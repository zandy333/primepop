/* ============================================================
   PRIME POP - Core Game Engine v1.0
   HTML5 Canvas game - Pop the prime number bubbles!
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     SECTION 1: CONFIGURATION & CONSTANTS
     All tunable game parameters live here.
     ============================================================ */

  var CONFIG = {
    BALL_RADIUS: 36,           // Base radius in pixels at reference width 400px
    TARGET_BALL_COUNT: 10,     // Balls visible at once
    MAX_LEVELS: 10,            // Total number of levels
    SCORE_PRIME_HIT: 10,       // Points awarded for popping a prime
    SCORE_WRONG_HIT: -15,      // Points deducted for wrong ball
    SCORE_MISSED_PRIME: -5,    // Points deducted per escaped prime
    REF_WIDTH: 400,            // Reference canvas width for scaling
    REF_HEIGHT: 700,           // Reference canvas height for scaling
  };

  /* All 25 prime numbers between 1 and 100 */
  var PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];

  /* Ball color palette — candy/jelly tones inspired by the background art */
  var BALL_COLORS = [
    { fill: '#FF9EC4', glow: '#FF5FA0' },  // Cotton-candy pink
    { fill: '#C4A0FF', glow: '#9B5BFF' },  // Lavender purple
    { fill: '#82C8FF', glow: '#3BA8FF' },  // Sky blue
    { fill: '#95F0D4', glow: '#35D4A0' },  // Mint green
    { fill: '#FFE882', glow: '#FFD022' },  // Soft yellow
    { fill: '#FFCBA4', glow: '#FFA04A' },  // Peach
    { fill: '#A0EEFF', glow: '#3ADAFF' },  // Cyan ice
  ];

  /* Spawn ratios: proportion of prime / even / odd-non-prime per wave */
  var RATIOS = [
    { prime: 0.20, even: 0.40, odd: 0.40 }, // Ratio 1
    { prime: 0.00, even: 0.50, odd: 0.50 }, // Ratio 2
    { prime: 0.30, even: 0.00, odd: 0.70 }, // Ratio 3
    { prime: 0.30, even: 0.70, odd: 0.00 }, // Ratio 4
    { prime: 0.10, even: 0.20, odd: 0.70 }, // Ratio 5
  ];

  /* Cumulative weights for ratio selection (must sum to 100) */
  var RATIO_CUM_WEIGHTS = [50, 60, 70, 80, 100];

  /* Ball upward speed (px/s) per level at reference height 700px */
  var LEVEL_SPEEDS = [55, 70, 88, 108, 130, 155, 182, 212, 245, 282];

  /* How many seconds each level lasts before auto-advancing */
  var LEVEL_DURATION = [32,30,28,26,24,22,20,18,16,14];

  /* ============================================================
     SECTION 2: GAME STATE VARIABLES
     ============================================================ */

  var canvas, ctx;

  /* Current screen: 'preload' | 'menu' | 'levelSelect' | 'game' | 'paused' | 'help' | 'about' */
  var state = 'preload';

  var score = 0;
  var currentLevel = 1;
  var balls = [];
  var particles = [];
  var floatingTexts = [];
  var usedNumbers = {};       // Tracks which numbers are currently on screen
  var soundEnabled = true;
  var audioCtx = null;
  var lastTime = 0;
  var ballIdCounter = 0;
  var gameTime = 0;           // Seconds elapsed in current level
  var nextLevelIn = 32;       // Seconds until next level

  /* Background */
  var bgImage = null;
  var bgLoaded = false;
  var loadProgress = 0;

  /* Logo image (replaces text title on preloader & menu) */
  var logoImage = null;
  var logoLoaded = false;

  /* Background star field */
  var stars = [];

  /* Button hit areas (rebuilt each render frame) */
  var menuButtons = [];
  var levelButtons = [];
  var hudButtons = [];

  /* Store last played level in localStorage */
  var STORAGE_KEY = 'primePop_lastLevel';
  var lastPlayedLevel = 1;

  /* Scale factors derived from canvas size each resize */
  var scaleX = 1, scaleY = 1;

  /* HiDPI / Retina support — logical (CSS) canvas dimensions */
  var dpr = 1, lW = 0, lH = 0;

  /* ============================================================
     SECTION 3: UTILITY FUNCTIONS
     ============================================================ */

  /** Returns true if n is prime */
  function isPrime(n) {
    return PRIMES.indexOf(n) !== -1;
  }

  /** Returns the type string for a number */
  function numberType(n) {
    if (isPrime(n)) return 'prime';
    if (n % 2 === 0) return 'even';
    return 'odd';
  }

  /** Random integer between min and max inclusive */
  function rndInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Fisher-Yates shuffle — returns the array (mutates) */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /** Pick a ratio index based on weighted random selection */
  function pickRatio() {
    var r = rndInt(0, 99);
    for (var i = 0; i < RATIO_CUM_WEIGHTS.length; i++) {
      if (r < RATIO_CUM_WEIGHTS[i]) return i;
    }
    return 0;
  }

  /** Draw a rounded rectangle path (does not fill/stroke — caller does that) */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /** Draw a 5-pointed star centred at (cx, cy) */
  function drawStar(cx, cy, spikes, outer, inner) {
    var rot = -Math.PI / 2;
    var step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    for (var i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    }
    ctx.closePath();
  }

  /** Clamp v between min and max */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /* ============================================================
     SECTION 4: AUDIO — Web Audio API synthesized sounds
     No external audio files required; everything is synthesised.
     ============================================================ */

  /** Lazily initialise the AudioContext on first user interaction */
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { }
  }

  /**
   * Play a simple synthesised tone.
   * @param {number} freq   Frequency in Hz
   * @param {string} type   OscillatorNode type: 'sine'|'square'|'sawtooth'|'triangle'
   * @param {number} dur    Duration in seconds
   * @param {number} gain   Peak gain (0–1)
   * @param {number} [detune] Cents of detuning
   */
  function playTone(freq, type, dur, gain, detune) {
    if (!soundEnabled || !audioCtx) return;
    try {
      var osc = audioCtx.createOscillator();
      var g   = audioCtx.createGain();
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (detune) osc.detune.setValueAtTime(detune, audioCtx.currentTime);
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { }
  }

  /** Happy sparkle sound — ascending arpeggio (prime pop) */
  function sfxPrime() {
    playTone(523, 'sine', 0.12, 0.28);
    setTimeout(function () { playTone(659, 'sine', 0.12, 0.28); }, 80);
    setTimeout(function () { playTone(784, 'sine', 0.15, 0.35); }, 160);
    setTimeout(function () { playTone(1047,'sine', 0.25, 0.28); }, 240);
  }

  /** Scary buzz — descending harsh sawtooth (wrong ball) */
  function sfxWrong() {
    playTone(280, 'sawtooth', 0.08, 0.35);
    setTimeout(function () { playTone(200, 'sawtooth', 0.08, 0.35); }, 60);
    setTimeout(function () { playTone(110, 'square',   0.25, 0.28); }, 130);
  }

  /** Soft whoosh — prime escaped */
  function sfxMissed() {
    playTone(500, 'sine', 0.25, 0.10, -400);
  }

  /** Level-up jingle */
  function sfxLevelUp() {
    var notes = [523, 659, 784, 1047, 1319];
    notes.forEach(function (f, i) {
      setTimeout(function () { playTone(f, 'sine', 0.18, 0.25); }, i * 100);
    });
  }

  /* ============================================================
     SECTION 5: PARTICLE SYSTEM
     Two explosion types: 'prime' (sparkle) and 'wrong' (shards).
     ============================================================ */

  /**
   * A single particle spawned by an explosion.
   * @param {number} x   Origin X
   * @param {number} y   Origin Y
   * @param {string} kind 'prime' | 'wrong'
   */
  function Particle(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind;

    var angle = Math.random() * Math.PI * 2;
    var speed = kind === 'prime'
      ? 90  + Math.random() * 240
      : 70  + Math.random() * 190;

    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - (kind === 'prime' ? 60 : 20);
    this.gravity = kind === 'prime' ? 160 : 260;
    this.life    = kind === 'prime' ? 0.8 + Math.random() * 0.4 : 0.5 + Math.random() * 0.35;
    this.maxLife = this.life;

    if (kind === 'prime') {
      this.size = (3 + Math.random() * 5) * scaleX;
      var hue = 35 + Math.random() * 50;
      this.color = 'hsl(' + hue + ',100%,70%)';
      this.shape = Math.random() < 0.55 ? 'star' : 'circle';
    } else {
      this.size = (3 + Math.random() * 7) * scaleX;
      this.color = Math.random() < 0.5
        ? 'hsl(' + (Math.random() * 20) + ',90%,35%)'
        : 'hsl(' + (350 + Math.random() * 20) + ',90%,55%)';
      this.shape = 'shard';
      this.rotation  = Math.random() * Math.PI * 2;
      this.rotSpeed  = (Math.random() - 0.5) * 10;
    }
  }

  Particle.prototype.update = function (dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.vy += this.gravity * dt;
    this.life -= dt;
    if (this.shape === 'shard') this.rotation += this.rotSpeed * dt;
  };

  Particle.prototype.draw = function () {
    var alpha = clamp(this.life / this.maxLife, 0, 1);
    var s = this.size * alpha;
    if (s < 0.5) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;

    if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'star') {
      drawStar(this.x, this.y, 5, s, s * 0.42);
      ctx.fill();
    } else {
      /* Jagged triangular shard */
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.2);
      ctx.lineTo(s * 0.45, s * 0.6);
      ctx.lineTo(-s * 0.45, s * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  /**
   * A ring-flash sprite attached to an explosion (not a long-lived particle).
   */
  function RingFlash(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    this.life = 0.22; this.maxLife = 0.22;
    this.r = 0; this.maxR = 70 * scaleX;
  }
  RingFlash.prototype.update = function (dt) {
    this.life -= dt;
    this.r = (1 - this.life / this.maxLife) * this.maxR;
  };
  RingFlash.prototype.draw = function () {
    var alpha = clamp(this.life / this.maxLife, 0, 1) * 0.75;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.kind === 'prime' ? '#FFE066' : '#FF2222';
    ctx.lineWidth = 3 * scaleX;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  /** Spawn a full explosion at (x, y) of the given kind */
  function spawnExplosion(x, y, kind) {
    var count = kind === 'prime' ? 26 : 22;
    for (var i = 0; i < count; i++) particles.push(new Particle(x, y, kind));
    particles.push(new RingFlash(x, y, kind));
  }

  /* ============================================================
     SECTION 6: FLOATING SCORE TEXT
     Brief "+10" / "-15" labels that float upward on pop.
     ============================================================ */

  function FloatingText(x, y, text, positive) {
    this.x = x; this.y = y;
    this.text = text;
    this.positive = positive;
    this.life = 1.1; this.maxLife = 1.1;
    this.vy = -55;
  }
  FloatingText.prototype.update = function (dt) {
    this.y  += this.vy * dt;
    this.vy *= 0.94;
    this.life -= dt;
  };
  FloatingText.prototype.draw = function () {
    var alpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold ' + Math.round(26 * scaleX) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.positive ? '#FFEE44' : '#FF5555';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  };

  /* ============================================================
     SECTION 7: NUMBER POOLS
     Separate pools for prime / even / odd-non-prime numbers.
     ============================================================ */

  var primePool = [];
  var evenPool  = [];
  var oddPool   = [];

  /** Build number pools from 1–100 */
  function buildPools() {
    primePool = []; evenPool = []; oddPool = [];
    for (var n = 1; n <= 100; n++) {
      if (isPrime(n))       primePool.push(n);
      else if (n % 2 === 0) evenPool.push(n);
      else                  oddPool.push(n);
    }
  }

  /** Pick an unused number from the given pool; fallback to any pool member */
  function pickFromPool(pool) {
    var available = pool.filter(function (n) { return !usedNumbers[n]; });
    if (available.length === 0) available = pool;
    return available[rndInt(0, available.length - 1)];
  }

  /** Generate a (type, number) pair for a new ball */
  function generateBall() {
    var ratio = RATIOS[pickRatio()];
    var r = Math.random();
    var type, number;

    if (r < ratio.prime && primePool.length > 0) {
      type = 'prime';
      number = pickFromPool(primePool);
    } else if (r < ratio.prime + ratio.even && evenPool.length > 0) {
      type = 'even';
      number = pickFromPool(evenPool);
    } else {
      type = 'odd';
      number = pickFromPool(oddPool);
    }

    /* Re-check in case a pool is empty due to ratio */
    if (type === 'prime' && primePool.length === 0)      { type = 'even'; number = pickFromPool(evenPool); }
    else if (type === 'even' && evenPool.length === 0)   { type = 'odd';  number = pickFromPool(oddPool); }
    else if (type === 'odd'  && oddPool.length === 0)    { type = 'even'; number = pickFromPool(evenPool); }

    return { type: type, number: number };
  }

  /* ============================================================
     SECTION 8: BALL CLASS
     Glowing jelly-like balls that float upward with gentle wobble.
     All balls look visually identical regardless of number type —
     players must judge by the number alone.
     ============================================================ */

  function Ball(x, y, number, color) {
    this.id    = ballIdCounter++;
    this.x     = x;
    this.y     = y;
    this.r     = CONFIG.BALL_RADIUS * scaleX;
    this.number = number;
    this.type  = numberType(number);
    this.color = color;
    this.speed = LEVEL_SPEEDS[currentLevel - 1] * scaleY;

    /* Gentle horizontal wobble */
    this.wobblePhase  = Math.random() * Math.PI * 2;
    this.wobbleSpeed  = 0.45 + Math.random() * 0.55;
    this.wobbleAmp    = (6 + Math.random() * 9) * scaleX;

    /* Glow pulsing */
    this.glowPhase = Math.random() * Math.PI * 2;

    /* Fade-in on spawn */
    this.opacity = 0;

    /* Actual drawn X (after wobble, used for hit detection) */
    this.drawX = x;
  }

  Ball.prototype.update = function (dt) {
    this.y           -= this.speed * dt;
    this.wobblePhase += this.wobbleSpeed * dt;
    this.glowPhase   += 2.2 * dt;
    this.opacity      = Math.min(1, this.opacity + dt * 3.5);
    this.drawX        = this.x + Math.sin(this.wobblePhase) * this.wobbleAmp;
  };

  Ball.prototype.draw = function () {
    var wx = this.drawX, wy = this.y, r = this.r;
    var glow = 0.55 + 0.45 * Math.sin(this.glowPhase);

    ctx.save();
    ctx.globalAlpha = this.opacity;

    /* Outer glow halo */
    var haloR = r * (1.35 + 0.18 * glow);
    var halo = ctx.createRadialGradient(wx, wy, 0, wx, wy, haloR);
    halo.addColorStop(0, this.color.fill + 'BB');
    halo.addColorStop(1, this.color.glow + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(wx, wy, haloR, 0, Math.PI * 2);
    ctx.fill();

    /* Main jelly body */
    var body = ctx.createRadialGradient(
      wx - r * 0.28, wy - r * 0.28, r * 0.05,
      wx, wy, r
    );
    body.addColorStop(0, '#FFFFFF');
    body.addColorStop(0.28, this.color.fill);
    body.addColorStop(1,   this.color.glow);

    ctx.shadowColor = this.color.glow;
    ctx.shadowBlur  = 14 * glow;
    ctx.fillStyle   = body;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;

    /* Specular highlight (top-left shine) */
    var shine = ctx.createRadialGradient(
      wx - r * 0.33, wy - r * 0.33, 0,
      wx - r * 0.33, wy - r * 0.33, r * 0.52
    );
    shine.addColorStop(0, 'rgba(255,255,255,0.92)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(wx - r * 0.33, wy - r * 0.33, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    /* Number label */
    var fontSize = Math.round(r * 0.88);
    ctx.font         = 'bold ' + fontSize + 'px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur   = 5;
    ctx.fillStyle    = '#FFFFFF';
    ctx.fillText(this.number, wx, wy + 1);
    ctx.shadowBlur   = 0;

    ctx.restore();
  };

  /** Returns true if canvas point (px, py) is inside the ball */
  Ball.prototype.hits = function (px, py) {
    var dx = px - this.drawX, dy = py - this.y;
    return dx * dx + dy * dy <= this.r * this.r;
  };

  /* ============================================================
     SECTION 9: BALL SPAWNING
     Balls spawn below the visible area and float up.
     Overlap prevention ensures no two balls share space.
     ============================================================ */

  /** Returns true if (x, y) with radius r overlaps any existing ball */
  function overlaps(x, y, r) {
    var minDist = r * 2.6;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var dx = b.drawX - x, dy = b.y - y;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
    return false;
  }

  /**
   * Separation pass — run every frame after ball.update().
   * For every overlapping pair, push both balls apart along the
   * separation axis until they no longer touch. Multiple passes
   * resolve clusters cleanly without jitter.
   */
  function separateBalls() {
    var PASSES = 4;
    for (var pass = 0; pass < PASSES; pass++) {
      for (var i = 0; i < balls.length - 1; i++) {
        for (var j = i + 1; j < balls.length; j++) {
          var a = balls[i], b = balls[j];
          var minDist = (a.r + b.r) * 1.06; /* 6 % padding so numbers don't kiss */
          var dx = b.drawX - a.drawX;
          var dy = b.y     - a.y;
          var distSq = dx * dx + dy * dy;
          if (distSq < minDist * minDist && distSq > 0.0001) {
            var dist    = Math.sqrt(distSq);
            var overlap = (minDist - dist) * 0.5;
            var nx = dx / dist, ny = dy / dist;

            /* Push base X positions — these persist across wobble updates */
            a.x -= nx * overlap;
            b.x += nx * overlap;

            /* Push Y directly (no per-frame offset on Y) */
            a.y += ny * overlap;
            b.y -= ny * overlap;

            /* Clamp to stay inside the canvas horizontally */
            var margin = a.r * 1.1;
            a.x = Math.max(margin, Math.min(lW - margin, a.x));
            b.x = Math.max(margin, Math.min(lW - margin, b.x));

            /* Re-derive drawX immediately so later pairs in this pass see the update */
            a.drawX = a.x + Math.sin(a.wobblePhase) * a.wobbleAmp;
            b.drawX = b.x + Math.sin(b.wobblePhase) * b.wobbleAmp;
          }
        }
      }
    }
  }

  /** Spawn a single ball below the canvas */
  function spawnBall() {
    var r      = CONFIG.BALL_RADIUS * scaleX;
    var margin = r * 2.2;
    var x, y, attempts = 0;

    do {
      x = margin + Math.random() * (lW - margin * 2);
      y = lH + r + Math.random() * 40 * scaleY;
      attempts++;
    } while (overlaps(x, y, r) && attempts < 40);

    var info  = generateBall();
    var color = BALL_COLORS[rndInt(0, BALL_COLORS.length - 1)];

    usedNumbers[info.number] = true;
    balls.push(new Ball(x, y, info.number, color));
  }

  /**
   * Stage all initial balls below the canvas, staggered so they drift
   * onto the screen gradually from the bottom rather than filling the
   * viewport all at once. Spread is proportional to ball speed so the
   * stagger feels the same at every level (~3 seconds of arrival time).
   */
  function spawnInitialBalls() {
    var r      = CONFIG.BALL_RADIUS * scaleX;
    var margin = r * 2.2;
    var speed  = LEVEL_SPEEDS[currentLevel - 1] * scaleY;

    /* Total vertical spread: 3 s of travel, at least half a screen height */
    var spread = Math.max(speed * 3.0, lH * 0.5);
    var count  = CONFIG.TARGET_BALL_COUNT;

    for (var i = 0; i < count; i++) {
      /* First ball spawns just below the bottom edge; last ball is ~spread px further down */
      var baseY = lH + r * 1.5 + (i / Math.max(1, count - 1)) * spread;

      var x, attempts = 0;
      do {
        x = margin + Math.random() * (lW - margin * 2);
        attempts++;
      } while (overlaps(x, baseY, r) && attempts < 40);

      var info  = generateBall();
      var color = BALL_COLORS[rndInt(0, BALL_COLORS.length - 1)];
      usedNumbers[info.number] = true;
      balls.push(new Ball(x, baseY, info.number, color));
    }
  }

  /* ============================================================
     SECTION 10: PRELOADER
     Shows percentage progress while the background image loads.
     ============================================================ */

  function renderPreloader() {
    var W = lW, H = lH;

    /* Gradient background */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0D0B2B');
    bg.addColorStop(1, '#2D1B5C');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Logo — scales to fit canvas width, centered at ~30 % from top */
    var logoW = Math.min(W * 0.82, 370);
    var logoH = logoW / 1.5;          /* source image is 900 × 600, ratio = 1.5 */
    var logoCY = H * 0.32;            /* vertical centre of logo */
    ctx.save();
    ctx.shadowColor = '#9B5BFF'; ctx.shadowBlur = 24;
    ctx.drawImage(logoImage, (W - logoW) / 2, logoCY - logoH / 2, logoW, logoH);
    ctx.restore();

    /* Progress bar track */
    var bw = W * 0.68, bh = Math.max(10, H * 0.028);
    var bx = (W - bw) / 2, by = H * 0.63;
    roundRect(bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();

    /* Progress bar fill */
    var fillW = bw * loadProgress;
    if (fillW > 1) {
      var barGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      barGrad.addColorStop(0, '#C4A0FF');
      barGrad.addColorStop(1, '#FFE066');
      ctx.fillStyle = barGrad;
      roundRect(bx, by, fillW, bh, bh / 2); ctx.fill();
    }

    /* Percentage label */
    ctx.save();
    ctx.font = 'bold ' + Math.round(W * 0.055) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(Math.round(loadProgress * 100) + '%', W / 2, by + bh + H * 0.022);
    ctx.restore();

    /* Loading text */
    ctx.save();
    ctx.font = Math.round(W * 0.036) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Loading…', W / 2, H * 0.78);
    ctx.restore();
  }

  /* ============================================================
     SECTION 11: BACKGROUND RENDERING
     Draws the loaded image (or a gradient fallback) + star field.
     ============================================================ */

  var bgAnimTime = 0;

  /* Build the static star field once */
  function buildStars() {
    stars = [];
    for (var i = 0; i < 70; i++) {
      stars.push({
        rx: Math.random(),   // fractional position (0–1)
        ry: Math.random(),
        r:  0.5 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawBackground() {
    var W = lW, H = lH;
    bgAnimTime += 0.016;

    if (bgLoaded && bgImage.complete && bgImage.naturalWidth > 0) {
      /* Draw the AI-generated background, covering the full canvas */
      ctx.drawImage(bgImage, 0, 0, W, H);
      /* Subtle dark overlay so UI elements stay readable */
      ctx.fillStyle = 'rgba(8, 4, 28, 0.38)';
      ctx.fillRect(0, 0, W, H);
    } else {
      /* Gradient fallback */
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0,   '#0D0B2B');
      grad.addColorStop(0.5, '#1A0D40');
      grad.addColorStop(1,   '#2D1B5C');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    /* Twinkling star overlay */
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var alpha = 0.35 + 0.35 * Math.sin(bgAnimTime * 1.8 + s.phase);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s.rx * W, s.ry * H, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Semi-transparent dark panel used behind overlay screens */
  function drawPanel() {
    var W = lW, H = lH;
    var pad = W * 0.05, r = W * 0.055;
    roundRect(pad, pad, W - pad * 2, H - pad * 2, r);
    ctx.fillStyle = 'rgba(8, 4, 30, 0.84)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,255,0.38)';
    ctx.lineWidth = 1.5 * scaleX;
    ctx.stroke();
  }

  /* ============================================================
     SECTION 12: BUTTON DRAWING HELPER
     Returns the bounding box of the drawn button.
     ============================================================ */

  function drawButton(x, y, w, h, label, highlighted) {
    var r = h * 0.36;
    ctx.save();

    if (highlighted) { ctx.shadowColor = '#C0A0FF'; ctx.shadowBlur = 22; }

    /* Fill */
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, highlighted ? '#DEC8FF' : '#C8AAFF');
    grad.addColorStop(1, highlighted ? '#B090FF' : '#9060EE');
    roundRect(x, y, w, h, r); ctx.fillStyle = grad; ctx.fill();

    /* Border */
    ctx.shadowBlur = 0;
    roundRect(x, y, w, h, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 1.5 * scaleX;
    ctx.stroke();

    /* Label */
    ctx.font = 'bold ' + Math.round(h * 0.38) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.42)'; ctx.shadowBlur = 5;
    ctx.fillText(label, x + w / 2, y + h / 2);

    ctx.restore();
    return { x: x, y: y, w: w, h: h };
  }

  function hitBtn(btn, px, py) {
    return px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h;
  }

  /* ============================================================
     SECTION 13: MAIN MENU
     ============================================================ */

  function renderMenu() {
    drawBackground();
    var W = lW, H = lH;

    /* Logo — anchored near the top, width responsive to canvas */
    var logoW = Math.min(W * 0.75, 340);
    var logoH = logoW / 1.5;          /* source image is 900 × 600, ratio = 1.5 */
    var logoTop = H * 0.04;
    var logoCY  = logoTop + logoH / 2;
    ctx.save();
    ctx.shadowColor = '#9060EE'; ctx.shadowBlur = 22;
    ctx.drawImage(logoImage, (W - logoW) / 2, logoTop, logoW, logoH);
    ctx.restore();

    /* Subtitle — positioned just below logo with a minimum gap */
    var subtitleY = Math.max(logoTop + logoH + H * 0.03, H * 0.345);
    ctx.save();
    ctx.font = Math.round(W * 0.042) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Pop the prime number bubbles!', W / 2, subtitleY);
    ctx.restore();

    /* Buttons */
    var bw = W * 0.62, bh = H * 0.072;
    var bx = (W - bw) / 2;
    var playLabel = lastPlayedLevel > 1 ? 'Play  (Level ' + lastPlayedLevel + ')' : 'Play';

    menuButtons = [
      Object.assign(drawButton(bx, H * 0.42, bw, bh, playLabel, false),   { action: 'play' }),
      Object.assign(drawButton(bx, H * 0.515, bw, bh, 'Select Level', false), { action: 'levels' }),
      Object.assign(drawButton(bx, H * 0.61,  bw, bh, 'How to Play', false),  { action: 'help' }),
      Object.assign(drawButton(bx, H * 0.705, bw, bh, 'About', false),        { action: 'about' }),
      Object.assign(drawButton(bx, H * 0.80,  bw, bh,
        soundEnabled ? '♪  Sound  ON' : '✕  Sound OFF', false),               { action: 'sound' }),
    ];
  }

  function handleMenuClick(px, py) {
    for (var i = 0; i < menuButtons.length; i++) {
      var btn = menuButtons[i];
      if (hitBtn(btn, px, py)) {
        if (btn.action === 'play')   { startGame(lastPlayedLevel); }
        else if (btn.action === 'levels') { state = 'levelSelect'; }
        else if (btn.action === 'help')   { state = 'help'; }
        else if (btn.action === 'about')  { state = 'about'; }
        else if (btn.action === 'sound')  { soundEnabled = !soundEnabled; }
        return;
      }
    }
  }

  /* ============================================================
     SECTION 14: LEVEL SELECT SCREEN
     ============================================================ */

  function renderLevelSelect() {
    drawBackground();
    drawPanel();
    var W = lW, H = lH;

    ctx.save();
    ctx.font = 'bold ' + Math.round(W * 0.082) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE066';
    ctx.shadowColor = '#9060EE'; ctx.shadowBlur = 14;
    ctx.fillText('Select Level', W / 2, H * 0.11);
    ctx.restore();

    levelButtons = [];
    var cols = 2;
    var bw = W * 0.37, bh = H * 0.078;
    var gapX = W * 0.06, gapY = H * 0.018;
    var startX = (W - cols * bw - gapX) / 2;
    var startY = H * 0.20;

    for (var i = 0; i < CONFIG.MAX_LEVELS; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      var x = startX + col * (bw + gapX);
      var y = startY + row * (bh + gapY);
      var highlight = (i + 1) === lastPlayedLevel;
      levelButtons.push(Object.assign(
        drawButton(x, y, bw, bh, 'Level ' + (i + 1), highlight),
        { level: i + 1 }
      ));
    }

    /* Back button */
    var backW = W * 0.42, backH = H * 0.065;
    levelButtons.push(Object.assign(
      drawButton((W - backW) / 2, H * 0.895, backW, backH, '← Back', false),
      { level: -1 }
    ));
  }

  function handleLevelSelectClick(px, py) {
    for (var i = 0; i < levelButtons.length; i++) {
      var btn = levelButtons[i];
      if (hitBtn(btn, px, py)) {
        if (btn.level === -1) state = 'menu';
        else startGame(btn.level);
        return;
      }
    }
  }

  /* ============================================================
     SECTION 15: HELP SCREEN
     ============================================================ */

  function renderHelp() {
    drawBackground();
    drawPanel();
    var W = lW, H = lH;

    var lines = [
      { text: 'HOW TO PLAY',                  s: 0.076, c: '#FFE066', b: true,  y: 0.10 },
      { text: 'Balls float up from the bottom.', s: 0.038, c: '#FFF',    b: false, y: 0.20 },
      { text: 'Each ball shows a number 1–100.',  s: 0.038, c: '#FFF',    b: false, y: 0.268},
      { text: 'TAP the PRIME NUMBER balls!',   s: 0.044, c: '#FFE066', b: true,  y: 0.345},
      { text: '(2, 3, 5, 7, 11, 13 … 97)',     s: 0.034, c: '#C8BEFF', b: false, y: 0.415},
      { text: '+10 pts  — prime ball popped ✦', s: 0.036, c: '#80FF90', b: false, y: 0.49 },
      { text: '−15 pts  — wrong ball tapped ✕', s: 0.036, c: '#FF8080', b: false, y: 0.555},
      { text: '−5 pts   — prime escapes top ↑', s: 0.036, c: '#FF8080', b: false, y: 0.62 },
      { text: 'Speed increases each level.',   s: 0.036, c: '#FFF',    b: false, y: 0.695},
      { text: 'All balls look the same —',     s: 0.036, c: '#FFF',    b: false, y: 0.76 },
      { text: 'judge by the number alone!',    s: 0.036, c: '#FFF',    b: false, y: 0.825},
      { text: 'Tap anywhere to go back',       s: 0.034, c: 'rgba(255,255,255,0.6)', b: false, y: 0.915},
    ];

    lines.forEach(function (l) {
      ctx.save();
      ctx.font = (l.b ? 'bold ' : '') + Math.round(W * l.s) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = l.c;
      if (l.b) { ctx.shadowColor = '#9060EE'; ctx.shadowBlur = 10; }
      ctx.fillText(l.text, W / 2, H * l.y);
      ctx.restore();
    });
  }

  /* ============================================================
     SECTION 16: ABOUT SCREEN
     ============================================================ */

  function renderAbout() {
    drawBackground();
    drawPanel();
    var W = lW, H = lH;

    var lines = [
      { text: 'ABOUT',                       s: 0.086, c: '#FFE066', b: true,  y: 0.10  },
      { text: 'Prime Pop  v1.0',             s: 0.054, c: '#FFF',    b: true,  y: 0.22  },
      { text: 'A math-meets-arcade game',    s: 0.038, c: '#FFF',    b: false, y: 0.32  },
      { text: 'where you pop prime bubbles', s: 0.038, c: '#FFF',    b: false, y: 0.385 },
      { text: 'before they escape!',         s: 0.038, c: '#FFF',    b: false, y: 0.45  },
      { text: 'Built with HTML5 Canvas',     s: 0.036, c: '#C8BEFF', b: false, y: 0.55  },
      { text: '& Web Audio API.',            s: 0.036, c: '#C8BEFF', b: false, y: 0.615 },
      { text: 'No server · No data stored', s: 0.034, c: 'rgba(255,255,255,0.55)', b: false, y: 0.71 },
      { text: '(except your last level)',    s: 0.034, c: 'rgba(255,255,255,0.55)', b: false, y: 0.77 },
      { text: '© 2025 Prime Pop',           s: 0.034, c: 'rgba(255,255,255,0.45)', b: false, y: 0.85 },
      { text: 'Tap anywhere to go back',    s: 0.034, c: 'rgba(255,255,255,0.55)', b: false, y: 0.925},
    ];

    lines.forEach(function (l) {
      ctx.save();
      ctx.font = (l.b ? 'bold ' : '') + Math.round(W * l.s) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = l.c;
      if (l.b) { ctx.shadowColor = '#9060EE'; ctx.shadowBlur = 10; }
      ctx.fillText(l.text, W / 2, H * l.y);
      ctx.restore();
    });
  }

  /* ============================================================
     SECTION 17: IN-GAME HUD
     Score, level indicator, progress bar to next level.
     ============================================================ */

  function renderHUD() {
    var W = lW, H = lH;
    hudButtons = [];

    /* Score */
    ctx.save();
    ctx.font = 'bold ' + Math.round(W * 0.062) + 'px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFE066';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
    ctx.fillText('Score: ' + score, W * 0.04, H * 0.018);
    ctx.restore();

    /* Level */
    ctx.save();
    ctx.font = 'bold ' + Math.round(W * 0.056) + 'px Arial';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
    ctx.fillText('Level ' + currentLevel, W * 0.96, H * 0.018);
    ctx.restore();

    /* Level progress bar */
    var barW = W * 0.58, barH = Math.max(6, H * 0.014);
    var barX = (W - barW) / 2, barY = H * 0.07;
    var progress = clamp(gameTime / nextLevelIn, 0, 1);

    /* Track */
    roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();

    /* Fill (colour shifts green → red as level approaches) */
    if (progress > 0.01) {
      var hue = Math.round(120 - progress * 120);
      roundRect(barX, barY, barW * progress, barH, barH / 2);
      ctx.fillStyle = 'hsl(' + hue + ',90%,58%)'; ctx.fill();
    }

    /* Time label */
    ctx.save();
    ctx.font = Math.round(W * 0.028) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    var timeLabel = currentLevel < CONFIG.MAX_LEVELS
      ? 'Next level in ' + Math.max(0, Math.ceil(nextLevelIn - gameTime)) + 's'
      : '★  MAX LEVEL  ★';
    ctx.fillText(timeLabel, W / 2, barY + barH + 2 * scaleY);
    ctx.restore();

    /* Menu button (bottom centre) */
    var mbW = W * 0.3, mbH = H * 0.055;
    var mbBtn = drawButton((W - mbW) / 2, H * 0.935, mbW, mbH, 'Menu', false);
    hudButtons.push(Object.assign(mbBtn, { action: 'menu' }));
  }

  /* ============================================================
     SECTION 18: PAUSE OVERLAY
     ============================================================ */

  function renderPauseOverlay() {
    var W = lW, H = lH;

    /* Dimmer */
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* Panel */
    var pw = W * 0.72, ph = H * 0.38;
    var px = (W - pw) / 2, py = (H - ph) / 2;
    roundRect(px, py, pw, ph, W * 0.05);
    ctx.fillStyle = 'rgba(12, 7, 38, 0.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,255,0.4)'; ctx.lineWidth = 1.5 * scaleX; ctx.stroke();

    ctx.save();
    ctx.font = 'bold ' + Math.round(W * 0.1) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE066';
    ctx.shadowColor = '#9060EE'; ctx.shadowBlur = 16;
    ctx.fillText('PAUSED', W / 2, py + ph * 0.28);
    ctx.restore();

    var bw = pw * 0.7, bh = H * 0.07;
    var bx = (W - bw) / 2;

    hudButtons = [
      Object.assign(drawButton(bx, py + ph * 0.5,  bw, bh, 'Resume', false), { action: 'resume' }),
      Object.assign(drawButton(bx, py + ph * 0.72, bw, bh, 'Menu',   false), { action: 'menu'   }),
    ];
  }

  /* ============================================================
     SECTION 19: GAME START & LOGIC
     ============================================================ */

  function startGame(startLevel) {
    currentLevel = clamp(startLevel, 1, CONFIG.MAX_LEVELS);
    score        = 0;
    balls        = [];
    particles    = [];
    floatingTexts= [];
    usedNumbers  = {};
    gameTime     = 0;
    nextLevelIn  = LEVEL_DURATION[currentLevel - 1];

    buildPools();
    spawnInitialBalls();

    state = 'game';
    localStorage.setItem(STORAGE_KEY, currentLevel);
    lastPlayedLevel = currentLevel;
  }

  /** Called each frame while state === 'game' */
  function updateGame(dt) {
    gameTime += dt;

    /* Advance level when timer expires */
    if (gameTime >= nextLevelIn && currentLevel < CONFIG.MAX_LEVELS) {
      currentLevel++;
      gameTime    = 0;
      nextLevelIn = LEVEL_DURATION[currentLevel - 1];
      sfxLevelUp();
      localStorage.setItem(STORAGE_KEY, currentLevel);
      lastPlayedLevel = currentLevel;
      /* Update speed of all live balls */
      var newSpeed = LEVEL_SPEEDS[currentLevel - 1] * scaleY;
      balls.forEach(function (b) { b.speed = newSpeed; });
    }

    /* Update balls */
    balls.forEach(function (b) { b.update(dt); });

    /* Prevent overlap — push apart any colliding balls */
    separateBalls();

    /* Detect escaped balls */
    var survived = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.y + b.r < 0) {
        /* Ball has left the top — penalise if prime */
        if (b.type === 'prime') {
          score += CONFIG.SCORE_MISSED_PRIME;
          floatingTexts.push(new FloatingText(b.drawX, 60 * scaleY, '' + CONFIG.SCORE_MISSED_PRIME, false));
          sfxMissed();
        }
        delete usedNumbers[b.number];
      } else {
        survived.push(b);
      }
    }
    balls = survived;

    /* Replenish balls */
    while (balls.length < CONFIG.TARGET_BALL_COUNT) { spawnBall(); }

    /* Update particles */
    particles = particles.filter(function (p) {
      p.update(dt);
      return p.life > 0;
    });

    /* Update floating texts */
    floatingTexts = floatingTexts.filter(function (f) {
      f.update(dt);
      return f.life > 0;
    });
  }

  /* ============================================================
     SECTION 20: INPUT HANDLING
     Unified click/touch handler dispatching to the current screen.
     ============================================================ */

  function canvasPos(e) {
    var rect  = canvas.getBoundingClientRect();
    var sX    = lW / rect.width;
    var sY    = lH / rect.height;
    var src   = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * sX,
      y: (src.clientY - rect.top)  * sY,
    };
  }

  function handlePointer(px, py) {
    initAudio();

    if (state === 'menu') {
      handleMenuClick(px, py);
    } else if (state === 'levelSelect') {
      handleLevelSelectClick(px, py);
    } else if (state === 'help' || state === 'about') {
      state = 'menu';
    } else if (state === 'game') {
      handleGamePointer(px, py);
    } else if (state === 'paused') {
      handlePausedPointer(px, py);
    }
  }

  function handleGamePointer(px, py) {
    /* Check HUD buttons first */
    for (var i = 0; i < hudButtons.length; i++) {
      if (hitBtn(hudButtons[i], px, py)) {
        var action = hudButtons[i].action;
        if (action === 'menu') { state = 'paused'; }
        return;
      }
    }

    /* Hit-test balls (front-to-back: last added = top) */
    for (var j = balls.length - 1; j >= 0; j--) {
      var ball = balls[j];
      if (ball.hits(px, py)) {
        var ex = ball.drawX, ey = ball.y;
        if (ball.type === 'prime') {
          score += CONFIG.SCORE_PRIME_HIT;
          spawnExplosion(ex, ey, 'prime');
          floatingTexts.push(new FloatingText(ex, ey, '+' + CONFIG.SCORE_PRIME_HIT, true));
          sfxPrime();
        } else {
          score += CONFIG.SCORE_WRONG_HIT;
          spawnExplosion(ex, ey, 'wrong');
          floatingTexts.push(new FloatingText(ex, ey, '' + CONFIG.SCORE_WRONG_HIT, false));
          sfxWrong();
        }
        delete usedNumbers[ball.number];
        balls.splice(j, 1);
        return;
      }
    }
  }

  function handlePausedPointer(px, py) {
    for (var i = 0; i < hudButtons.length; i++) {
      if (hitBtn(hudButtons[i], px, py)) {
        var a = hudButtons[i].action;
        if (a === 'resume') state = 'game';
        else if (a === 'menu') state = 'menu';
        return;
      }
    }
  }

  /* ============================================================
     SECTION 21: CANVAS RESIZE
     Keeps the canvas portrait-oriented and properly scaled.
     ============================================================ */

  function resize() {
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    if (isMobile && window.innerWidth > window.innerHeight) {
      /* Show the CSS landscape overlay instead of forcing canvas */
      document.getElementById('landscapeWarning').style.display = 'flex';
      return;
    }
    document.getElementById('landscapeWarning').style.display = 'none';

    var maxW = 480;
    var W    = Math.min(window.innerWidth,  maxW);
    var H    = window.innerHeight;

    dpr = window.devicePixelRatio || 1;
    lW  = W;
    lH  = H;

    /* Backing buffer at physical pixels — eliminates blurry/pixelated text
       on Retina / HiDPI / mobile screens (devicePixelRatio > 1).
       CSS width/height are NOT overridden here; the stylesheet's
       width:100% / max-width:480px / height:100% continues to set the
       display size, and the buffer is scaled up by dpr for crispness. */
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    /* Centre on desktop */
    canvas.style.position = 'absolute';
    canvas.style.left     = ((window.innerWidth - W) / 2) + 'px';
    canvas.style.top      = '0';

    /* Update scale factors */
    scaleX = W / CONFIG.REF_WIDTH;
    scaleY = H / CONFIG.REF_HEIGHT;

    /* Rescale all live balls */
    var r = CONFIG.BALL_RADIUS * scaleX;
    var speed = currentLevel > 0 ? LEVEL_SPEEDS[currentLevel - 1] * scaleY : LEVEL_SPEEDS[0] * scaleY;
    balls.forEach(function (b) { b.r = r; b.speed = speed; });
  }

  /* ============================================================
     SECTION 22: LANDSCAPE WARNING (canvas-drawn fallback)
     Drawn when CSS media query is not supported.
     ============================================================ */

  function renderLandscapeWarning() {
    var W = lW, H = lH;
    ctx.fillStyle = '#0D0B2B'; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.font = 'bold ' + Math.round(Math.min(W, H) * 0.08) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFE066';
    ctx.fillText('↺', W / 2, H * 0.38);

    ctx.font = 'bold ' + Math.round(Math.min(W, H) * 0.055) + 'px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Please rotate your device', W / 2, H * 0.52);
    ctx.fillText('to portrait orientation', W / 2, H * 0.60);
    ctx.restore();
  }

  /* ============================================================
     SECTION 23: MAIN RENDER LOOP
     requestAnimationFrame-driven. Clears and redraws each frame.
     ============================================================ */

  function loop(timestamp) {
    var dt = Math.min((timestamp - lastTime) / 1000, 0.08);
    lastTime = timestamp;

    /* Re-apply HiDPI scale every frame — setting canvas.width in resize()
       resets the context transform, so we restate it here to be safe. */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Check orientation on mobile */
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile && window.innerWidth > window.innerHeight) {
      ctx.clearRect(0, 0, lW, lH);
      renderLandscapeWarning();
      requestAnimationFrame(loop);
      return;
    }

    ctx.clearRect(0, 0, lW, lH);

    if (state === 'preload') {
      renderPreloader();
    } else if (state === 'menu') {
      renderMenu();
    } else if (state === 'levelSelect') {
      renderLevelSelect();
    } else if (state === 'help') {
      renderHelp();
    } else if (state === 'about') {
      renderAbout();
    } else if (state === 'game') {
      updateGame(dt);
      drawBackground();
      particles.forEach(function (p) { p.draw(); });
      balls.forEach(function (b) { b.draw(); });
      floatingTexts.forEach(function (f) { f.draw(); });
      renderHUD();
    } else if (state === 'paused') {
      drawBackground();
      particles.forEach(function (p) { p.draw(); });
      balls.forEach(function (b) { b.draw(); });
      renderPauseOverlay();
    }

    requestAnimationFrame(loop);
  }

  /* ============================================================
     SECTION 24: INITIALISATION
     Sets up the canvas, loads the background, and starts the loop.
     ============================================================ */

  function init() {
    /* Grab DOM elements */
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');

    /* Read last saved level */
    var saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
    lastPlayedLevel = isNaN(saved) ? 1 : clamp(saved, 1, CONFIG.MAX_LEVELS);

    /* Build static helpers */
    buildStars();
    buildPools();

    /* Resize canvas to fit window */
    resize();
    window.addEventListener('resize',            resize);
    window.addEventListener('orientationchange', resize);

    /* Pointer events */
    canvas.addEventListener('click', function (e) {
      var p = canvasPos(e); handlePointer(p.x, p.y);
    });
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var p = canvasPos(e); handlePointer(p.x, p.y);
    }, { passive: false });

    /* Load background image */
    bgImage = new Image();
    bgImage.onload  = function () { bgLoaded = true; };
    bgImage.onerror = function () { bgLoaded = true; };   /* use gradient fallback */
    bgImage.src = 'assets/background.png';

    /* Load logo image */
    logoImage = new Image();
    logoImage.onload  = function () { logoLoaded = true; };
    logoImage.onerror = function () { logoLoaded = true; };
    logoImage.src = 'assets/logo.png';

    /* Simulate incremental load progress for the preloader bar */
    var bothLoaded = function () { return bgLoaded && logoLoaded; };
    var fakeProgress = 0;
    var ticker = setInterval(function () {
      fakeProgress += 0.04;
      loadProgress  = Math.min(fakeProgress, bothLoaded() ? 1 : 0.92);
      if (bothLoaded() && loadProgress >= 0.99) {
        loadProgress = 1;
        clearInterval(ticker);
        /* Short pause on 100% before transitioning to menu */
        setTimeout(function () { state = 'menu'; }, 300);
      }
    }, 50);

    /* Kick off render loop */
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  /* Start once the DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
