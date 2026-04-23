let ACCENT = '#00D2D3';
let PU_COLOR = '#00D2D3';

const colorPalette = {
  ArcticPowder: "#F1F6F4",
  MysticMint: "#D9E8E3",
  Forsythia: ACCENT,
  DeepSaffron: "#9B3068",
  NocturnalExpedition: "#114C5A",
  OceanicNoir: "#172B36",
};

const DAY_COLOR = colorPalette.MysticMint;
const DAY_BALL_COLOR = colorPalette.NocturnalExpedition;
const NIGHT_COLOR = colorPalette.NocturnalExpedition;
const NIGHT_BALL_COLOR = colorPalette.MysticMint;

const SQUARE_SIZE = 25;
const CANVAS_SIZE = 800;
const NUM_SQUARES = CANVAS_SIZE / SQUARE_SIZE;
const TOTAL_SQUARES = NUM_SQUARES * NUM_SQUARES;

const BASE_BALL_SPEED = 7;
const MIN_SPEED = 5;
const MAX_SPEED = 14;
const BASE_BALL_RADIUS = SQUARE_SIZE / 2;

const BASE_PLAYER_SPEED = 12;
const BASE_PLAYER_WIDTH = SQUARE_SIZE;
const BASE_PLAYER_HEIGHT = SQUARE_SIZE * 6; // 6 squares tall (20% longer than 5)

const DOMINATION_THRESHOLD = 0.8;
const BIGGER_BALL_MULT = 1.0;
const BIGGER_RACKET_MULT = 2;
const FASTER_BALL_MULT = 0.5;

const POWERUP_VISUAL_RADIUS = SQUARE_SIZE;
const POWERUP_RESPAWN_QUICK = 10; // seconds after collection

const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;
const SNAP_THRESHOLD = 3;

// ==================== TOUCH / MOBILE DETECTION ====================
const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// Pointer-only heuristic: a device with a fine pointer (mouse/trackpad) is likely a laptop/desktop
const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
// Default: touch mode ON for phones/tablets (no fine pointer), OFF for laptops with touchscreens
let touchMode = hasTouch && !hasFinePointer;
const isSmallScreen = hasTouch && !hasFinePointer; // actual phone/tablet (no mouse)
function applyTouchMode() {
  document.body.classList.toggle('is-mobile', touchMode);
  document.body.classList.toggle('is-small-screen', isSmallScreen);
  document.body.classList.toggle('has-fine-pointer', hasFinePointer);
  const row = document.getElementById('touch-mode-row');
  if (row) row.classList.toggle('hidden', !hasTouch);
}
applyTouchMode();

// ==================== DOM REFS ====================
const canvas = document.getElementById("pongCanvas");
const ctx = canvas.getContext("2d");
const dayScoreEl = document.getElementById("day-score");
const nightScoreEl = document.getElementById("night-score");
const timerEl = document.getElementById("timer-display");
const dayPowerupsEl = document.getElementById("day-powerups");
const nightPowerupsEl = document.getElementById("night-powerups");

// ==================== SETTINGS ====================
const DEFAULT_BINDINGS = {
  p1: { up: 'e', down: 'd', left: 's', right: 'f', rotL: 'a', rotR: 'q' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', rotL: ',', rotR: '.' },
};

const DEFAULT_ADV = {
  effectsEnabled: true,
  screenShake: true,
  racketOutline: true,
  gridEffect: false,
  particles: true,
  soundEnabled: true,
  soundVolume: 70,
  powerupFrequency: 15,
  powerupDuration: 40,
  progressionBar: true,
  freeMovement: false,
  mirroredPowerups: true,
  touchControls: null, // null = auto-detect, true/false = manual override
  theme: 'cyber',
  ai1Difficulty: 'medium', // Day AI
};

let keyBindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

const settings = {
  mode: '2p',
  aiDifficulty: 'medium',
  winCondition: 'combined',
  duration: 180,
  ...JSON.parse(JSON.stringify(DEFAULT_ADV)),
};

let settingsReturnTo = 'menu'; // 'menu' | 'pause' | 'playing'

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('pongWarsSettings'));
    if (!saved) return;
    for (const k of Object.keys(DEFAULT_ADV)) {
      if (saved[k] !== undefined) settings[k] = saved[k];
    }
    if (saved.keyBindings) {
      if (saved.keyBindings.p1) Object.assign(keyBindings.p1, saved.keyBindings.p1);
      if (saved.keyBindings.p2) Object.assign(keyBindings.p2, saved.keyBindings.p2);
    }
    // Apply saved touch mode preference
    if (hasTouch && saved.touchControls !== undefined && saved.touchControls !== null) {
      touchMode = saved.touchControls;
      applyTouchMode();
    }
  } catch (e) { }
  applyTheme(settings.theme || 'cyber');
}

function applyTheme(themeName) {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
  if (themeName !== 'cyber') {
    document.body.classList.add('theme-' + themeName);
  }
  syncThemeColors();
}

function syncThemeColors() {
  // Reflow to ensure CSS variables are applied
  void document.body.offsetHeight;

  const rootStyles = getComputedStyle(document.body);
  const cssAccent = rootStyles.getPropertyValue('--ui-accent').trim();
  const cssPuColor = rootStyles.getPropertyValue('--powerup-color').trim();

  // Update variables (use Cyber cyan as fallback if CSS hasn't loaded yet)
  ACCENT = cssAccent || '#00D2D3';
  PU_COLOR = cssPuColor || '#00D2D3';
  colorPalette.Forsythia = ACCENT;
}

function saveSettings() {
  try {
    const obj = { keyBindings };
    for (const k of Object.keys(DEFAULT_ADV)) obj[k] = settings[k];
    localStorage.setItem('pongWarsSettings', JSON.stringify(obj));
  } catch (e) { }
}

// ==================== AUDIO SYSTEM ====================
const audio = {
  ctx: null,
  masterGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = settings.soundVolume / 100;
    } catch (e) { }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) {
    settings.soundVolume = v;
    if (this.masterGain) this.masterGain.gain.value = v / 100;
  },
  _play(fn) {
    if (!settings.soundEnabled || !this.ctx) return;
    this.resume();
    try { fn(this.ctx, this.masterGain); } catch (e) { }
  },
  _lastBounce: 0,
  playBounce(team) {
    const now = performance.now();
    if (now - this._lastBounce < 60) return;
    this._lastBounce = now;
    this._play((ac, dest) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(dest);
      o.frequency.value = team === 'day' ? 440 : 330;
      g.gain.setValueAtTime(0.1, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
      o.start(); o.stop(ac.currentTime + 0.07);
    });
  },
  playRacketHit() {
    this._play((ac, dest) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(dest);
      o.type = 'triangle'; o.frequency.value = 280;
      g.gain.setValueAtTime(0.18, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
      o.start(); o.stop(ac.currentTime + 0.1);
    });
  },
  playPowerup() {
    this._play((ac, dest) => {
      [500, 650, 800].forEach((freq, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(dest);
        o.type = 'triangle'; o.frequency.value = freq;
        const t = ac.currentTime + i * 0.07;
        g.gain.setValueAtTime(0.13, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.start(t); o.stop(t + 0.12);
      });
    });
  },
  playWin() {
    this._play((ac, dest) => {
      [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(dest);
        o.frequency.value = freq;
        const t = ac.currentTime + i * 0.15;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        o.start(t); o.stop(t + 1.0);
      });
    });
  },
};

// ==================== GAME STATE ====================
// AI skill: 0 (easiest) to 1 (hardest). All behavior derives from this single value.
const AI_SKILL = { easy: 0.15, medium: 0.45, hard: 0.75, hardest: 1.0 };

let game = { state: 'menu', timeRemaining: 0, tickCount: 0, winner: null };
let squares = [];
let balls = [];
let player1, player2;
let powerups = [];
let activeEffects = { day: {}, night: {} };
let particles = [], ballTrails = [];
let _trailPool = []; // recycled trail objects to avoid GC
let screenShake = { intensity: 0 };
let dayScore = 0, nightScore = 0;
let lastSpawn = { day: 0, night: 0 };
function makeAiState(x, y) {
  return { targetX: x, targetY: y, reactionCounter: 0, stayTrapping: false, isolated: false, isolationCheckAt: 0 };
}
let aiState = { p1: makeAiState(0, 0), p2: makeAiState(0, 0) };
const TELEPORT_MAX = 3;
const TELEPORT_HOLD_FRAMES = 120; // 2 seconds at 60fps
const TELEPORT_BLINK_START = 30;  // start blinking at 500ms
const TELEPORT_BLINK_SPEED = 10;  // sine cycle speed
let teleportState = {
  p1: { holdFrames: 0, remaining: TELEPORT_MAX },
  p2: { holdFrames: 0, remaining: TELEPORT_MAX },
};

const keys = {};
let joystickInput = { p1: null, p2: null };
let mobileRotate = { p1ccw: false, p1cw: false, p2ccw: false, p2cw: false };
const ROT_SNAP = 45 * Math.PI / 180; // 45 degrees
const ROT_HOLD_THRESHOLD = 10; // frames before switching to fine rotation
let rotHoldFrames = { p1L: 0, p1R: 0, p2L: 0, p2R: 0 };

// ==================== GEOMETRY HELPERS ====================
function getRotatedCorners(cx, cy, w, h, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const hw = w / 2, hh = h / 2;
  return [
    { x: cx - hw * c + hh * s, y: cy - hw * s - hh * c },
    { x: cx + hw * c + hh * s, y: cy + hw * s - hh * c },
    { x: cx + hw * c - hh * s, y: cy + hw * s + hh * c },
    { x: cx - hw * c - hh * s, y: cy - hw * s + hh * c },
  ];
}

function getRotatedAABB(cx, cy, w, h, angle) {
  const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle));
  const bw = w * ca + h * sa, bh = w * sa + h * ca;
  return { left: cx - bw / 2, top: cy - bh / 2, right: cx + bw / 2, bottom: cy + bh / 2 };
}

// Check that the rotated rectangle fits within canvas bounds
function isWithinBounds(cx, cy, w, h, angle) {
  const aabb = getRotatedAABB(cx, cy, w, h, angle);
  return aabb.left >= 0 && aabb.right <= CANVAS_SIZE && aabb.top >= 0 && aabb.bottom <= CANVAS_SIZE;
}

// Inlined perimeter validation — checks that no perimeter point sits on an enemy square
function isPerimeterValid(cx, cy, w, h, angle, step, enemyColor) {
  const EPS = 0.5;
  const c = Math.cos(angle), s = Math.sin(angle);
  const hw = w / 2 - EPS, hh = h / 2 - EPS;
  for (let t = -hw; t <= hw; t += step) {
    if (!_checkPt(cx + t * c + hh * s, cy + t * s - hh * c, enemyColor)) return false;
    if (!_checkPt(cx + t * c - hh * s, cy + t * s + hh * c, enemyColor)) return false;
  }
  for (let t = -hh + step; t < hh; t += step) {
    if (!_checkPt(cx - hw * c + t * s, cy - hw * s - t * c, enemyColor)) return false;
    if (!_checkPt(cx + hw * c + t * s, cy + hw * s - t * c, enemyColor)) return false;
  }
  return true;
}
function _checkPt(x, y, enemyColor) {
  if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return false;
  const i = Math.floor(x / SQUARE_SIZE), j = Math.floor(y / SQUARE_SIZE);
  return !(i >= 0 && i < NUM_SQUARES && j >= 0 && j < NUM_SQUARES && squares[i][j] === enemyColor);
}

function pointInRotatedRect(px, py, cx, cy, w, h, angle) {
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const dx = px - cx, dy = py - cy;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

function rotatedRectOverlapsSquare(player, i, j) {
  const aabb = getRotatedAABB(player.cx, player.cy, player.width, player.height, player.angle);
  const sl = i * SQUARE_SIZE, st = j * SQUARE_SIZE;
  const sr = sl + SQUARE_SIZE, sb = st + SQUARE_SIZE;
  if (aabb.right < sl || aabb.left > sr || aabb.bottom < st || aabb.top > sb) return false;
  if (pointInRotatedRect(sl + SQUARE_SIZE / 2, st + SQUARE_SIZE / 2,
    player.cx, player.cy, player.width, player.height, player.angle)) return true;
  for (const [ox, oy] of [[0, 0], [SQUARE_SIZE, 0], [0, SQUARE_SIZE], [SQUARE_SIZE, SQUARE_SIZE]]) {
    if (pointInRotatedRect(sl + ox, st + oy, player.cx, player.cy, player.width, player.height, player.angle)) return true;
  }
  const corners = getRotatedCorners(player.cx, player.cy, player.width, player.height, player.angle);
  for (const p of corners) {
    if (p.x >= sl && p.x <= sr && p.y >= st && p.y <= sb) return true;
  }
  return false;
}

// ==================== PLAYER VALIDATION & MOVEMENT ====================
function isValidRotatedPos(player, cx, cy, angle) {
  if (!isWithinBounds(cx, cy, player.width, player.height, angle)) return false;
  if (settings.freeMovement) return true;
  const enemyColor = player.team === 'day' ? NIGHT_COLOR : DAY_COLOR;
  return isPerimeterValid(cx, cy, player.width, player.height, angle, 5, enemyColor);
}

function isPlayerStuck(player) {
  if (settings.freeMovement) return false;
  const spd = player.speed;
  // Can move in any cardinal direction?
  if (isValidRotatedPos(player, player.cx + spd, player.cy, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx - spd, player.cy, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx, player.cy + spd, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx, player.cy - spd, player.angle)) return false;
  // Can move even 1px?
  if (isValidRotatedPos(player, player.cx + 1, player.cy, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx - 1, player.cy, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx, player.cy + 1, player.angle)) return false;
  if (isValidRotatedPos(player, player.cx, player.cy - 1, player.angle)) return false;
  // Can rotate?
  if (isValidRotatedPos(player, player.cx, player.cy, player.angle + ROT_SNAP)) return false;
  if (isValidRotatedPos(player, player.cx, player.cy, player.angle - ROT_SNAP)) return false;
  return true;
}

function rescuePlayer(player) {
  // Clear enemy squares that touch the racket perimeter + 1 square margin
  const ownColor = player.team === 'day' ? DAY_COLOR : NIGHT_COLOR;
  const aabb = getRotatedAABB(player.cx, player.cy, player.width, player.height, player.angle);
  const margin = SQUARE_SIZE;
  const iMin = Math.max(0, Math.floor((aabb.left - margin) / SQUARE_SIZE));
  const iMax = Math.min(NUM_SQUARES - 1, Math.floor((aabb.right + margin) / SQUARE_SIZE));
  const jMin = Math.max(0, Math.floor((aabb.top - margin) / SQUARE_SIZE));
  const jMax = Math.min(NUM_SQUARES - 1, Math.floor((aabb.bottom + margin) / SQUARE_SIZE));
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      if (squares[i][j] !== ownColor) {
        const old = squares[i][j];
        squares[i][j] = ownColor;
        if (old === DAY_COLOR) { dayScore--; nightScore++; }
        else { dayScore++; nightScore--; }
      }
    }
  }
}

function wouldOverlapBall(player, cx, cy) {
  const cos = Math.cos(-player.angle), sin = Math.sin(-player.angle);
  const hw = player.width / 2, hh = player.height / 2;
  for (const ball of balls) {
    const dx = ball.x - cx, dy = ball.y - cy;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    // Ball center inside racket?
    if (Math.abs(lx) < hw && Math.abs(ly) < hh) return true;
    // Ball edge overlapping racket?
    const clX = Math.max(-hw, Math.min(hw, lx));
    const clY = Math.max(-hh, Math.min(hh, ly));
    const ddx = lx - clX, ddy = ly - clY;
    if (ddx * ddx + ddy * ddy < ball.radius * ball.radius) return true;
  }
  return false;
}

function canMoveTo(player, cx, cy) {
  return isValidRotatedPos(player, cx, cy, player.angle) && !wouldOverlapBall(player, cx, cy);
}

function movePlayer(player, targetCx, targetCy) {
  // Try full distance first (fast path), fall back to per-pixel on collision
  const fullDx = Math.round(targetCx - player.cx);
  if (fullDx !== 0) {
    if (canMoveTo(player, player.cx + fullDx, player.cy)) {
      player.cx += fullDx;
    } else {
      const dx = Math.sign(fullDx);
      const steps = Math.min(Math.abs(fullDx), player.speed);
      for (let s = 0; s < steps; s++) {
        if (canMoveTo(player, player.cx + dx, player.cy)) {
          player.cx += dx;
        } else break;
      }
    }
  }
  const fullDy = Math.round(targetCy - player.cy);
  if (fullDy !== 0) {
    if (canMoveTo(player, player.cx, player.cy + fullDy)) {
      player.cy += fullDy;
    } else {
      const dy = Math.sign(fullDy);
      const steps = Math.min(Math.abs(fullDy), player.speed);
      for (let s = 0; s < steps; s++) {
        if (canMoveTo(player, player.cx, player.cy + dy)) {
          player.cy += dy;
        } else break;
      }
    }
  }
}

function snapRotation(player, targetAngle) {
  // Only snap to exact 45-degree multiples
  if (isValidRotatedPos(player, player.cx, player.cy, targetAngle)) {
    player.angle = targetAngle;
  }
}

function resetRotation(player) {
  // Try to reset to 0
  if (isValidRotatedPos(player, player.cx, player.cy, 0)) {
    player.angle = 0;
    return;
  }
  // Can't go to 0 — try nearest 45-degree multiples
  for (let i = 1; i <= 4; i++) {
    if (isValidRotatedPos(player, player.cx, player.cy, i * ROT_SNAP)) { player.angle = i * ROT_SNAP; return; }
    if (isValidRotatedPos(player, player.cx, player.cy, -i * ROT_SNAP)) { player.angle = -i * ROT_SNAP; return; }
  }
}

function applyGridSnap(player) {
  if (Math.abs(player.angle) > 0.01) return;
  const leftEdge = player.cx - player.width / 2;
  const mod = ((leftEdge % SQUARE_SIZE) + SQUARE_SIZE) % SQUARE_SIZE;
  if (mod > 0 && mod <= SNAP_THRESHOLD) {
    const snapped = player.cx - mod;
    if (isValidRotatedPos(player, snapped, player.cy, player.angle)) player.cx = snapped;
  } else if (mod >= SQUARE_SIZE - SNAP_THRESHOLD) {
    const snapped = player.cx + (SQUARE_SIZE - mod);
    if (isValidRotatedPos(player, snapped, player.cy, player.angle)) player.cx = snapped;
  }
  const topEdge = player.cy - player.height / 2;
  const modY = ((topEdge % SQUARE_SIZE) + SQUARE_SIZE) % SQUARE_SIZE;
  if (modY > 0 && modY <= SNAP_THRESHOLD) {
    const snapped = player.cy - modY;
    if (isValidRotatedPos(player, player.cx, snapped, player.angle)) player.cy = snapped;
  } else if (modY >= SQUARE_SIZE - SNAP_THRESHOLD) {
    const snapped = player.cy + (SQUARE_SIZE - modY);
    if (isValidRotatedPos(player, player.cx, snapped, player.angle)) player.cy = snapped;
  }
}

function updatePlayers() {
  // Record previous positions for racket velocity tracking
  player1.prevCx = player1.cx; player1.prevCy = player1.cy;
  player2.prevCx = player2.cx; player2.prevCy = player2.cy;

  if (isPlayerStuck(player1)) rescuePlayer(player1);
  if (settings.mode === 'aivsai') {
    updateAI(player1, 'ai1Difficulty');
  } else {
    updatePlayerInput(player1, 'p1', keyBindings.p1);
  }
  applyGridSnap(player1);
  pushBallsFromRacket(player1);

  if (isPlayerStuck(player2)) rescuePlayer(player2);
  if (settings.mode === 'ai' || settings.mode === 'aivsai') {
    updateAI(player2, 'aiDifficulty');
  } else {
    updatePlayerInput(player2, 'p2', keyBindings.p2);
  }
  applyGridSnap(player2);
  pushBallsFromRacket(player2);

  // Compute racket velocity for power shot
  player1.vx = player1.cx - player1.prevCx; player1.vy = player1.cy - player1.prevCy;
  player2.vx = player2.cx - player2.prevCx; player2.vy = player2.cy - player2.prevCy;
}



function chargeTeleport(player, pKey, charging) {
  const ts = teleportState[pKey];
  if (charging && ts.remaining > 0) {
    ts.holdFrames++;
    if (ts.holdFrames >= TELEPORT_HOLD_FRAMES) {
      teleportBallToRacket(player);
      ts.remaining--;
      ts.holdFrames = 0;
    }
  } else {
    ts.holdFrames = 0;
  }
}

function updatePlayerInput(player, pKey, binds) {
  const rL = keys[binds.rotL];
  const rR = keys[binds.rotR];
  const mrL = mobileRotate[pKey + 'ccw'];
  const mrR = mobileRotate[pKey + 'cw'];
  const rotLeft = rL || mrL;
  const rotRight = rR || mrR;

  const holdKeyL = pKey + 'L', holdKeyR = pKey + 'R';
  if (rotLeft && rotRight) {
    resetRotation(player);
    rotHoldFrames[holdKeyL] = 0; rotHoldFrames[holdKeyR] = 0;
  } else if (rotLeft) {
    rotHoldFrames[holdKeyL]++;
    if (rotHoldFrames[holdKeyL] === 1 || (rotHoldFrames[holdKeyL] > ROT_HOLD_THRESHOLD && rotHoldFrames[holdKeyL] % 6 === 0)) {
      const target = Math.round((player.angle - ROT_SNAP) / ROT_SNAP) * ROT_SNAP;
      snapRotation(player, target);
    }
    rotHoldFrames[holdKeyR] = 0;
  } else if (rotRight) {
    rotHoldFrames[holdKeyR]++;
    if (rotHoldFrames[holdKeyR] === 1 || (rotHoldFrames[holdKeyR] > ROT_HOLD_THRESHOLD && rotHoldFrames[holdKeyR] % 6 === 0)) {
      const target = Math.round((player.angle + ROT_SNAP) / ROT_SNAP) * ROT_SNAP;
      snapRotation(player, target);
    }
    rotHoldFrames[holdKeyL] = 0;
  } else {
    rotHoldFrames[holdKeyL] = 0; rotHoldFrames[holdKeyR] = 0;
  }
  chargeTeleport(player, pKey, rotLeft && rotRight);
  const ji = joystickInput[pKey];
  if (ji) {
    const mag = Math.sqrt(ji.dx * ji.dx + ji.dy * ji.dy);
    if (mag > 0.1) {
      // Full speed once past deadzone — direction from joystick, speed matches keyboard
      movePlayer(player, player.cx + (ji.dx / mag) * player.speed, player.cy + (ji.dy / mag) * player.speed);
    }
  } else {
    const pressL = keys[binds.left], pressR = keys[binds.right];
    const kx = (pressL ? -1 : 0) + (pressR ? 1 : 0);
    const ky = (keys[binds.up] ? -1 : 0) + (keys[binds.down] ? 1 : 0);
    if (kx || ky) movePlayer(player, player.cx + kx * player.speed, player.cy + ky * player.speed);
  }
}

// ==================== BALL-RACKET PUSH (fixes ball-through-racket) ====================
function pushBallsFromRacket(player) {
  for (const ball of balls) pushBallOutOfRacket(ball, player);
}

function clampBallToBounds(ball) {
  ball.x = Math.max(ball.radius, Math.min(CANVAS_SIZE - ball.radius, ball.x));
  ball.y = Math.max(ball.radius, Math.min(CANVAS_SIZE - ball.radius, ball.y));
}

function pushBallOutOfRacket(ball, player) {
  const dx = ball.x - player.cx, dy = ball.y - player.cy;
  const c = Math.cos(-player.angle), s = Math.sin(-player.angle);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  const hw = player.width / 2, hh = player.height / 2;
  const c2 = Math.cos(player.angle), s2 = Math.sin(player.angle);

  let wnx, wny;

  if (Math.abs(lx) >= hw || Math.abs(ly) >= hh) {
    // Center outside — check edge overlap
    const clX = Math.max(-hw, Math.min(hw, lx));
    const clY = Math.max(-hh, Math.min(hh, ly));
    const ddx = lx - clX, ddy = ly - clY;
    const distSq = ddx * ddx + ddy * ddy;
    if (distSq >= ball.radius * ball.radius || distSq < 0.01) return;
    const dist = Math.sqrt(distSq);
    const nlx = ddx / dist, nly = ddy / dist;
    wnx = nlx * c2 - nly * s2; wny = nlx * s2 + nly * c2;
    const overlap = ball.radius - dist + 1;
    ball.x += wnx * overlap; ball.y += wny * overlap;
  } else {
    // Center inside racket — push out the nearest same-side edge
    const side = lx >= 0 ? 1 : -1;
    const edgeDist = side > 0 ? hw - lx : hw + lx;
    const pushDist = edgeDist + ball.radius + 1;
    wnx = side * c2; wny = side * s2;
    ball.x += wnx * pushDist; ball.y += wny * pushDist;
    ball.skipSquareCheck = 2;
    audio.playRacketHit();
  }

  clampBallToBounds(ball);
  const vDot = ball.dx * wnx + ball.dy * wny;
  if (vDot < 0) { ball.dx -= 2 * vDot * wnx; ball.dy -= 2 * vDot * wny; }
}

function teleportBallToRacket(player) {
  // Find nearest same-team ball
  let best = null, bestDist = Infinity;
  for (const b of balls) {
    if (b.team !== player.team) continue;
    const d = Math.hypot(b.x - player.cx, b.y - player.cy);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  if (!best) return;

  // Reset ball to normal size
  best.radius = BASE_BALL_RADIUS;
  best.powerBoost = 0;
  best.powerBoostTime = 0;

  // Place ball at the front face of the racket
  const outDir = player.team === 'day' ? 1 : -1;
  const co = Math.cos(player.angle), si = Math.sin(player.angle);
  const offset = (player.width / 2 + BASE_BALL_RADIUS + 2) * outDir;
  best.x = player.cx + offset * co;
  best.y = player.cy + offset * si;

  // Clear enemy squares around the spawn point so the ball fits
  const ownColor = player.team === 'day' ? DAY_COLOR : NIGHT_COLOR;
  const clearRadius = 2; // clear a small area (2-square radius)
  const ci = Math.floor(best.x / SQUARE_SIZE), cj = Math.floor(best.y / SQUARE_SIZE);
  for (let di = -clearRadius; di <= clearRadius; di++) {
    for (let dj = -clearRadius; dj <= clearRadius; dj++) {
      const gi = ci + di, gj = cj + dj;
      if (gi >= 0 && gi < NUM_SQUARES && gj >= 0 && gj < NUM_SQUARES && squares[gi][gj] !== ownColor) {
        const old = squares[gi][gj];
        squares[gi][gj] = ownColor;
        if (old === DAY_COLOR) { dayScore--; nightScore++; }
        else { dayScore++; nightScore--; }
      }
    }
  }

  // Fire outward from the racket face
  best.dx = outDir * BASE_BALL_SPEED;
  best.dy = (Math.random() - 0.5) * BASE_BALL_SPEED * 0.5;
  best.skipSquareCheck = 8;
  audio.playRacketHit();
  if (settings.effectsEnabled && settings.particles) {
    for (let p = 0; p < 8; p++) particles.push(makeParticle(best.x, best.y, best.ballColor));
  }
}

// ==================== AI ====================

// Flood-fill reachability: is the racket connected to any own ball via own-color squares?
// Runs at most once per second per AI player.
function aiCheckIsolation(player, _playerKey, ai) {
  const now = game.tickCount;
  if (now < ai.isolationCheckAt) return;
  ai.isolationCheckAt = now + TICK_RATE; // next check in 1 second

  const ownColor = player.team === 'day' ? DAY_COLOR : NIGHT_COLOR;
  // Seed grid cells under the racket
  const aabb = getRotatedAABB(player.cx, player.cy, player.width, player.height, player.angle);
  const iMin = Math.max(0, Math.floor(aabb.left / SQUARE_SIZE));
  const iMax = Math.min(NUM_SQUARES - 1, Math.floor(aabb.right / SQUARE_SIZE));
  const jMin = Math.max(0, Math.floor(aabb.top / SQUARE_SIZE));
  const jMax = Math.min(NUM_SQUARES - 1, Math.floor(aabb.bottom / SQUARE_SIZE));

  // Ball target cells
  const ballCells = new Set();
  for (const b of balls) {
    if (b.team !== player.team) continue;
    const bi = Math.floor(b.x / SQUARE_SIZE), bj = Math.floor(b.y / SQUARE_SIZE);
    if (bi >= 0 && bi < NUM_SQUARES && bj >= 0 && bj < NUM_SQUARES) ballCells.add(bi * NUM_SQUARES + bj);
  }
  if (ballCells.size === 0) { ai.isolated = true; return; }

  // BFS on own-color grid cells (flat visited array for speed)
  const visited = new Uint8Array(NUM_SQUARES * NUM_SQUARES);
  const queue = [];
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const key = i * NUM_SQUARES + j;
      if (!visited[key]) { visited[key] = 1; queue.push(key); }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const key = queue[head++];
    if (ballCells.has(key)) { ai.isolated = false; return; }
    const ci = (key / NUM_SQUARES) | 0, cj = key % NUM_SQUARES;
    const neighbors = [
      ci > 0 ? key - NUM_SQUARES : -1,
      ci < NUM_SQUARES - 1 ? key + NUM_SQUARES : -1,
      cj > 0 ? key - 1 : -1,
      cj < NUM_SQUARES - 1 ? key + 1 : -1,
    ];
    for (const nk of neighbors) {
      if (nk >= 0 && !visited[nk]) {
        const ni = (nk / NUM_SQUARES) | 0, nj = nk % NUM_SQUARES;
        if (squares[ni][nj] === ownColor) { visited[nk] = 1; queue.push(nk); }
      }
    }
  }
  ai.isolated = true;
}

// AI movement: rotate toward desired angle, then move toward target
function aiMoveToward(player, targetX, targetY, speed, desiredAngle) {
  // Step 1: rotate toward desired angle (default: vertical)
  const goalAngle = desiredAngle ?? 0;
  const angleDiff = goalAngle - player.angle;
  if (Math.abs(angleDiff) > 0.01) {
    const dir = angleDiff > 0 ? 1 : -1;
    const nextAngle = Math.round((player.angle + dir * ROT_SNAP) / ROT_SNAP) * ROT_SNAP;
    if (isValidRotatedPos(player, player.cx, player.cy, nextAngle)) {
      player.angle = nextAngle;
    }
  } else if (player.angle !== goalAngle && isValidRotatedPos(player, player.cx, player.cy, goalAngle)) {
    player.angle = goalAngle;
  }

  // Step 2: move toward target
  const dx = Math.max(-speed, Math.min(speed, targetX - player.cx));
  const dy = Math.max(-speed, Math.min(speed, targetY - player.cy));
  const prevX = player.cx, prevY = player.cy;
  movePlayer(player, player.cx + dx, player.cy + dy);

  // Step 3: if blocked and wanted to move, try one rotation to get unstuck
  const wantedToMove = Math.abs(dx) + Math.abs(dy) > 1;
  const actuallyMoved = Math.abs(player.cx - prevX) + Math.abs(player.cy - prevY) > 0.5;
  if (wantedToMove && !actuallyMoved) {
    // Only try the direction closer to our goal angle to avoid oscillation
    const tryDir = angleDiff >= 0 ? ROT_SNAP : -ROT_SNAP;
    const tryAngle = Math.round((player.angle + tryDir) / ROT_SNAP) * ROT_SNAP;
    if (isValidRotatedPos(player, player.cx, player.cy, tryAngle)) {
      player.angle = tryAngle;
      movePlayer(player, player.cx + dx, player.cy + dy);
    }
  }
}

// Compute the best angle for the racket to face the target direction
function aiBestAngle(player, targetX, targetY) {
  const dx = targetX - player.cx, dy = targetY - player.cy;
  if (Math.abs(dx) + Math.abs(dy) < 5) return 0; // too close, stay vertical
  // Racket's long axis should be perpendicular to travel direction
  // Travel angle → perpendicular angle for the racket
  const travelAngle = Math.atan2(dy, dx);
  const perpAngle = travelAngle + Math.PI / 2;
  // Snap to nearest 45-degree multiple
  return Math.round(perpAngle / ROT_SNAP) * ROT_SNAP;
}

function updateAI(player, diffKey) {
  const skill = AI_SKILL[settings[diffKey]] ?? AI_SKILL.medium;

  // Derived parameters from skill (0-1)
  const speedMult = 0.3 + skill * 0.7;             // 0.30 – 1.00
  const reactionFrames = Math.round(20 * (1 - skill)); // 20 – 0
  const jitter = 40 * (1 - skill);                  // 40 – 0
  const usePrediction = skill >= 0.4;
  const seeksPowerups = skill >= 0.3;

  const playerKey = player.team === 'day' ? 'p1' : 'p2';
  const ai = aiState[playerKey];

  // Reaction delay — keep moving toward cached target
  if (ai.reactionCounter > 0) {
    ai.reactionCounter--;
    const speed = player.speed * speedMult;
    aiMoveToward(player, ai.targetX, ai.targetY, speed);
    aiCheckIsolation(player, playerKey, ai);
    chargeTeleport(player, playerKey, ai.isolated && teleportState[playerKey].remaining > 0);
    return;
  }
  ai.reactionCounter = reactionFrames;

  const isDay = player.team === 'day';
  const enemyColor = isDay ? NIGHT_COLOR : DAY_COLOR;

  // --- Gather info ---

  // Nearest own-team ball
  let ownBall = null, ownDist = Infinity;
  for (const b of balls) {
    if (b.team !== player.team) continue;
    const d = Math.hypot(b.x - player.cx, b.y - player.cy);
    if (d < ownDist) { ownDist = d; ownBall = b; }
  }

  // Nearest collectible powerup (on own-color squares)
  let bestPU = null, bestPUDist = Infinity;
  if (seeksPowerups) {
    for (const pu of powerups) {
      if (squares[pu.gridX][pu.gridY] === enemyColor) continue;
      const px = pu.gridX * SQUARE_SIZE + SQUARE_SIZE / 2;
      const py = pu.gridY * SQUARE_SIZE + SQUARE_SIZE / 2;
      const dist = Math.hypot(px - player.cx, py - player.cy);
      if (dist < bestPUDist) { bestPUDist = dist; bestPU = pu; }
    }
  }

  // Count enemy blocks near the ball — only trap when the ball is actually near enemy territory
  let trappedEnemy = 0;
  if (ownBall) {
    const radius = 6; // check 6-square radius around ball
    const bi = Math.floor(ownBall.x / SQUARE_SIZE), bj = Math.floor(ownBall.y / SQUARE_SIZE);
    const iMin = Math.max(0, bi - radius), iMax = Math.min(NUM_SQUARES - 1, bi + radius);
    const jMin = Math.max(0, bj - radius), jMax = Math.min(NUM_SQUARES - 1, bj + radius);
    for (let i = iMin; i <= iMax; i++)
      for (let j = jMin; j <= jMax; j++)
        if (squares[i][j] === enemyColor) trappedEnemy++;
  }

  // Don't trap near any edge — ball against an edge/corner has nowhere productive to paint
  const edgeBuf = SQUARE_SIZE * 4; // 4 squares from any edge
  const ballNearEdge = ownBall && (
    ownBall.x < edgeBuf || ownBall.x > CANVAS_SIZE - edgeBuf ||
    ownBall.y < edgeBuf || ownBall.y > CANVAS_SIZE - edgeBuf);

  // Hysteresis: stay trapping if pocket has < 80 enemy blocks, leave when >= 100 or 0
  if (trappedEnemy === 0 || trappedEnemy >= 100 || ballNearEdge) ai.stayTrapping = false;
  else if (trappedEnemy > 0 && trappedEnemy < 80) ai.stayTrapping = true;

  // --- Decide target ---
  let targetX = player.cx, targetY = player.cy;
  let desiredAngle = 0; // default: vertical racket

  if (bestPU && !ai.stayTrapping) {
    // Priority 1: Collect powerups (unless trapping productively)
    targetX = bestPU.gridX * SQUARE_SIZE + SQUARE_SIZE / 2;
    targetY = bestPU.gridY * SQUARE_SIZE + SQUARE_SIZE / 2;
    desiredAngle = aiBestAngle(player, targetX, targetY);
  } else if (ownBall && trappedEnemy > 0 && !ballNearEdge && ownDist < CANVAS_SIZE * 0.4 &&
             (isDay ? ownBall.x > CANVAS_SIZE * 0.35 : ownBall.x < CANVAS_SIZE * 0.65)) {
    // Priority 2: Trap own ball — only when nearby, enemy blocks exist, ball not near any edge
    const gap = player.width / 2 + ownBall.radius + 4;
    targetX = isDay ? ownBall.x - gap : ownBall.x + gap;
    targetX = Math.max(player.width / 2 + 2, Math.min(CANVAS_SIZE - player.width / 2 - 2, targetX));
    targetY = usePrediction ? predictBallY(ownBall, targetX) : ownBall.y;
    targetY += (Math.random() - 0.5) * jitter;

    // If ball is near a side edge, rotate racket to deflect it inward
    const edgeMargin = SQUARE_SIZE * 3;
    if (ownBall.x < edgeMargin || ownBall.x > CANVAS_SIZE - edgeMargin) {
      desiredAngle = ownBall.y < CANVAS_SIZE / 2 ? ROT_SNAP : -ROT_SNAP;
    } else {
      desiredAngle = 0;
    }
  } else {
    // Priority 3: Block opponent balls (no own ball available)
    let bestBall = null, bestUrgency = -Infinity;
    for (const ball of balls) {
      if (ball.team === player.team) continue;
      const urgency = isDay
        ? (ball.dx < 0 ? 1 + (CANVAS_SIZE - ball.x) / CANVAS_SIZE : (CANVAS_SIZE - ball.x) / CANVAS_SIZE * 0.3)
        : (ball.dx > 0 ? 1 + ball.x / CANVAS_SIZE : ball.x / CANVAS_SIZE * 0.3);
      if (urgency > bestUrgency) { bestUrgency = urgency; bestBall = ball; }
    }

    if (bestBall) {
      targetY = usePrediction ? predictBallY(bestBall, player.cx) : bestBall.y;
      targetX = isDay
        ? Math.max(40, Math.min(CANVAS_SIZE * 0.5 - 20, bestBall.x - 80))
        : Math.max(CANVAS_SIZE * 0.5 + 20, Math.min(CANVAS_SIZE - 40, bestBall.x + 80));
      targetY += (Math.random() - 0.5) * jitter;
    } else {
      targetX = isDay ? CANVAS_SIZE * 0.6 : CANVAS_SIZE * 0.4;
      targetY = CANVAS_SIZE / 2 + (Math.random() - 0.5) * 100;
    }
  }

  ai.targetX = targetX;
  ai.targetY = targetY;
  const speed = player.speed * speedMult;
  aiMoveToward(player, targetX, targetY, speed, desiredAngle);

  // Teleport: use if isolated from own balls (checked via flood-fill)
  aiCheckIsolation(player, playerKey, ai);
  chargeTeleport(player, playerKey, ai.isolated && teleportState[playerKey].remaining > 0);
}

function predictBallY(ball, targetX) {
  let sx = ball.x, sy = ball.y, sdx = ball.dx, sdy = ball.dy;
  for (let step = 0; step < 300; step++) {
    sx += sdx; sy += sdy;
    if (sy < BASE_BALL_RADIUS || sy > CANVAS_SIZE - BASE_BALL_RADIUS) sdy = -sdy;
    if (sx < BASE_BALL_RADIUS || sx > CANVAS_SIZE - BASE_BALL_RADIUS) sdx = -sdx;
    if ((sdx > 0 && sx >= targetX) || (sdx < 0 && sx <= targetX)) return sy;
  }
  return ball.y;
}

// ==================== BALL PHYSICS ====================
function updateBalls() {
  const now = game.tickCount / TICK_RATE;
  // Remove expired extra balls in-place (avoids allocating a new array via filter)
  for (let i = balls.length - 1; i >= 0; i--) {
    if (balls[i].isExtra && now >= balls[i].expiresAt) {
      balls[i] = balls[balls.length - 1]; balls.pop();
    }
  }

  for (const ball of balls) {
    const bigStacks = effectStacks(ball.team, 'BIGGER_BALL', now);
    ball.radius = BASE_BALL_RADIUS * (1 + bigStacks * BIGGER_BALL_MULT);

    const fastStacks = effectStacks(ball.team, 'FASTER_BALL', now);
    const speedMult = 1 + (fastStacks * FASTER_BALL_MULT);

    const totalSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) * speedMult;
    const subSteps = Math.max(2, Math.ceil(totalSpeed / (ball.radius * 0.5))); // higher density for trails
    const subDt = speedMult / subSteps;

    ball.bounceT = -1; // Reset per tick
    for (let s = 0; s < subSteps; s++) {
      const startX = ball.x;
      const startY = ball.y;
      const moveX = ball.dx * subDt;
      const moveY = ball.dy * subDt;
      const nx = startX + moveX;
      const ny = startY + moveY;

      // X-boundary
      if (nx >= CANVAS_SIZE - ball.radius && ball.dx > 0) {
        const t = Math.max(0, (CANVAS_SIZE - ball.radius - startX) / moveX);
        ball.bounceX = CANVAS_SIZE - ball.radius;
        ball.bounceY = startY + moveY * t;
        ball.bounceT = (s + t) / subSteps;
        ball.x = ball.bounceX; ball.dx = -ball.dx;
        ball.x += ball.dx * subDt * (1 - t);
      } else if (nx <= ball.radius && ball.dx < 0) {
        const t = Math.max(0, (ball.radius - startX) / moveX);
        ball.bounceX = ball.radius;
        ball.bounceY = startY + moveY * t;
        ball.bounceT = (s + t) / subSteps;
        ball.x = ball.bounceX; ball.dx = -ball.dx;
        ball.x += ball.dx * subDt * (1 - t);
      } else {
        ball.x = nx;
      }

      // Y-boundary
      if (ny >= CANVAS_SIZE - ball.radius && ball.dy > 0) {
        const t = Math.max(0, (CANVAS_SIZE - ball.radius - startY) / moveY);
        ball.bounceY = CANVAS_SIZE - ball.radius;
        // Note: we use current updated ball.x if it just hit X, or ny if not. 
        // Actually, to be super precise for bounceT, we store the Y contact.
        if (ball.bounceT === -1 || (s + t) / subSteps < ball.bounceT) {
          ball.bounceX = startX + moveX * t;
          ball.bounceY = CANVAS_SIZE - ball.radius;
          ball.bounceT = (s + t) / subSteps;
        }
        ball.y = CANVAS_SIZE - ball.radius; ball.dy = -ball.dy;
        ball.y += ball.dy * subDt * (1 - t);
      } else if (ny <= ball.radius && ball.dy < 0) {
        const t = Math.max(0, (ball.radius - startY) / moveY);
        if (ball.bounceT === -1 || (s + t) / subSteps < ball.bounceT) {
          ball.bounceX = startX + moveX * t;
          ball.bounceY = ball.radius;
          ball.bounceT = (s + t) / subSteps;
        }
        ball.y = ball.radius; ball.dy = -ball.dy;
        ball.y += ball.dy * subDt * (1 - t);
      } else {
        ball.y = ny;
      }

      if (ball.skipSquareCheck > 0) ball.skipSquareCheck--;
      else checkSquareCollision(ball);

      checkRacketCollision(ball, player1);
      checkRacketCollision(ball, player2);
      if (settings.effectsEnabled && settings.particles) {
        let t = _trailPool.pop();
        if (t) { t.x = ball.x; t.y = ball.y; t.color = ball.ballColor; t.life = 1.0; t.radius = ball.radius * 0.4; }
        else { t = { x: ball.x, y: ball.y, color: ball.ballColor, life: 1.0, radius: ball.radius * 0.4 }; }
        ballTrails.push(t);
      }
    }
    // Clamping still ensures no one-pixel escapes
    ball.x = Math.max(ball.radius, Math.min(CANVAS_SIZE - ball.radius, ball.x));
    ball.y = Math.max(ball.radius, Math.min(CANVAS_SIZE - ball.radius, ball.y));

    addRandomness(ball);
  }

  // Ball-ball collision (elastic, handles different radii)
  for (let i = 0; i < balls.length - 1; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (distSq < minDist * minDist && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist, ny = dy / dist;
        // Push apart
        const overlap = minDist - dist;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
        // Elastic velocity exchange along collision normal
        const dvx = a.dx - b.dx, dvy = a.dy - b.dy;
        const relV = dvx * nx + dvy * ny;
        if (relV > 0) { // approaching
          a.dx -= relV * nx; a.dy -= relV * ny;
          b.dx += relV * nx; b.dy += relV * ny;
          a.skipSquareCheck = 2;
          b.skipSquareCheck = 2;
        }
      }
    }
  }
}

function checkSquareCollision(ball) {
  let painted = false, bouncedX = false, bouncedY = false;
  const opponent = ball.team === 'day' ? player2 : player1;
  const r = ball.radius;

  // Check ALL grid squares overlapping the ball's bounding box
  const iMin = Math.max(0, Math.floor((ball.x - r) / SQUARE_SIZE));
  const iMax = Math.min(NUM_SQUARES - 1, Math.floor((ball.x + r) / SQUARE_SIZE));
  const jMin = Math.max(0, Math.floor((ball.y - r) / SQUARE_SIZE));
  const jMax = Math.min(NUM_SQUARES - 1, Math.floor((ball.y + r) / SQUARE_SIZE));

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      if (squares[i][j] === ball.paintColor) continue;

      // Circle-vs-AABB overlap test
      const sqL = i * SQUARE_SIZE, sqT = j * SQUARE_SIZE;
      const closestX = Math.max(sqL, Math.min(sqL + SQUARE_SIZE, ball.x));
      const closestY = Math.max(sqT, Math.min(sqT + SQUARE_SIZE, ball.y));
      const dx = ball.x - closestX, dy = ball.y - closestY;
      if (dx * dx + dy * dy > r * r) continue;

      // Only bounce+paint if not protected by opponent racket
      if (rotatedRectOverlapsSquare(opponent, i, j)) continue;
      const oldColor = squares[i][j];
      squares[i][j] = ball.paintColor;
      if (oldColor === DAY_COLOR) { dayScore--; nightScore++; }
      else { dayScore++; nightScore--; }
      painted = true;

      // Bounce direction: use vector from ball center to square center
      const scx = sqL + SQUARE_SIZE / 2, scy = sqT + SQUARE_SIZE / 2;
      if (Math.abs(ball.x - scx) > Math.abs(ball.y - scy)) {
        if (!bouncedX) { ball.dx = -ball.dx; bouncedX = true; }
      } else {
        if (!bouncedY) { ball.dy = -ball.dy; bouncedY = true; }
      }
    }
  }
  if (painted) {
    audio.playBounce(ball.team);
    if (settings.effectsEnabled && settings.screenShake) screenShake.intensity = Math.max(screenShake.intensity, 1);
  }
}

function checkRacketCollision(ball, player) {
  const dx = ball.x - player.cx, dy = ball.y - player.cy;
  const c = Math.cos(-player.angle), s = Math.sin(-player.angle);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  const hw = player.width / 2, hh = player.height / 2;

  const closestX = Math.max(-hw, Math.min(hw, lx));
  const closestY = Math.max(-hh, Math.min(hh, ly));
  const distX = lx - closestX, distY = ly - closestY;
  const distSq = distX * distX + distY * distY;

  if (distSq < ball.radius * ball.radius) {
    const c2 = Math.cos(player.angle), s2 = Math.sin(player.angle);
    let nx, ny;
    if (distSq < 0.01) {
      // Ball center inside racket — push out the nearest same-side edge
      const side = lx >= 0 ? 1 : -1;
      const edgeDist = side > 0 ? hw - lx : hw + lx;
      const pushDist = edgeDist + ball.radius + 1;
      nx = side * c2; ny = side * s2;
      ball.x += nx * pushDist; ball.y += ny * pushDist;
      clampBallToBounds(ball);
    } else {
      const dist = Math.sqrt(distSq);
      const nlx = distX / dist, nly = distY / dist;
      nx = nlx * c2 - nly * s2;
      ny = nlx * s2 + nly * c2;
      const overlap = ball.radius - dist;
      ball.x += nx * (overlap + 2); ball.y += ny * (overlap + 2);
      clampBallToBounds(ball);
    }
    // Reflect velocity
    const dot = ball.dx * nx + ball.dy * ny;
    if (dot < 0) { ball.dx -= 2 * dot * nx; ball.dy -= 2 * dot * ny; }
    // Angle variation
    const hitPos = ly / hh;
    ball.dy += hitPos * 1.8;
    // Physics power shot: add racket velocity component along normal
    const rvx = player.vx || 0, rvy = player.vy || 0;
    const racketVNorm = rvx * nx + rvy * ny; // racket speed projected onto bounce normal
    if (racketVNorm > 0.5) {
      // Racket was moving into the ball — apply moderate momentum transfer
      // Capped at 30% of MAX_SPEED to keep it realistic
      const boostAdd = Math.min(racketVNorm * 0.35, MAX_SPEED * 0.3);
      ball.dx += nx * boostAdd; ball.dy += ny * boostAdd;
      ball.powerBoost = boostAdd;
      ball.powerBoostTime = game.tickCount / TICK_RATE;
    }
    // Clamp speed (with decaying boost allowance, hard cutoff at 5s)
    const spd = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    const boostAge = game.tickCount / TICK_RATE - (ball.powerBoostTime || 0);
    const boostExtra = boostAge < 5 ? (ball.powerBoost || 0) * (1 - boostAge / 5) : 0;
    const dynamicMax = MAX_SPEED + boostExtra;
    if (spd > dynamicMax) { ball.dx = (ball.dx / spd) * dynamicMax; ball.dy = (ball.dy / spd) * dynamicMax; }

    ball.skipSquareCheck = 2; // brief skip to avoid immediate re-bounce into squares behind racket
    audio.playRacketHit();
    if (settings.effectsEnabled) {
      if (settings.screenShake) screenShake.intensity = Math.max(screenShake.intensity, 3.5);
      if (settings.particles) for (let p = 0; p < 5; p++) particles.push(makeParticle(ball.x, ball.y, ball.ballColor));
    }
  }
}

function addRandomness(ball) {
  ball.dx += Math.random() * 0.02 - 0.01;
  ball.dy += Math.random() * 0.02 - 0.01;
  const boostAge = game.tickCount / TICK_RATE - (ball.powerBoostTime || 0);
  const boostExtra = boostAge < 5 ? (ball.powerBoost || 0) * (1 - boostAge / 5) : 0;
  const cap = MAX_SPEED + boostExtra;
  ball.dx = Math.min(Math.max(ball.dx, -cap), cap);
  ball.dy = Math.min(Math.max(ball.dy, -cap), cap);
  if (Math.abs(ball.dx) < MIN_SPEED) ball.dx = ball.dx > 0 ? MIN_SPEED : -MIN_SPEED;
  if (Math.abs(ball.dy) < MIN_SPEED) ball.dy = ball.dy > 0 ? MIN_SPEED : -MIN_SPEED;
}

// ==================== POWERUPS ====================
// Count active stacks of an effect (cumulative powerups)
function effectStacks(team, type, now) {
  const arr = activeEffects[team][type];
  if (!arr) return 0;
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (now < arr[i]) count++;
    else { arr.splice(i, 1); } // clean up expired
  }
  return count;
}

const POWERUP_TYPES = ['BIGGER_BALL', 'EXTRA_BALL', 'BIGGER_RACKET', 'FASTER_BALL', 'SHRINK_RACKET'];
const POWERUP_HUD = { BIGGER_BALL: '\u25C9', EXTRA_BALL: '\u271A', BIGGER_RACKET: '\u21D5', FASTER_BALL: '\u00BB', SHRINK_RACKET: '\u2913' };
const POWERUP_NAMES = { BIGGER_BALL: 'Big Ball', EXTRA_BALL: 'Extra Ball', BIGGER_RACKET: 'Big Racket', FASTER_BALL: 'Fast Ball', SHRINK_RACKET: 'Shrink Foe' };
const MIN_RACKET_HEIGHT = SQUARE_SIZE * 3; // minimum racket height (3 blocks)
const POWERUP_LIMITS = {
  BIGGER_BALL: 5,
  EXTRA_BALL: 8,
  BIGGER_RACKET: 3,
  FASTER_BALL: 4,
  SHRINK_RACKET: 3,
};

// Mirrored powerup sequence state
let mirroredSeq = [];   // shuffled sequence of POWERUP_TYPES, shared by both teams
let mirroredIdx = { day: 0, night: 0 }; // per-team index into mirroredSeq

function updatePowerups() {
  const now = game.tickCount / TICK_RATE;
  const freq = settings.powerupFrequency;

  if (now - lastSpawn.day >= freq) {
    lastSpawn.day = now;
    spawnPowerup(DAY_COLOR);
  }
  if (now - lastSpawn.night >= freq) {
    lastSpawn.night = now;
    spawnPowerup(NIGHT_COLOR);
  }

  for (let idx = powerups.length - 1; idx >= 0; idx--) {
    const pu = powerups[idx];
    // Expire after 30s uncollected
    if (now - pu.spawnTime > 30) { powerups.splice(idx, 1); continue; }
    pu.pulsePhase += 0.05;
    const squareColor = squares[pu.gridX] ? squares[pu.gridX][pu.gridY] : null;

    for (const player of [player1, player2]) {
      const playerColor = player.team === 'day' ? DAY_COLOR : NIGHT_COLOR;
      if (!settings.freeMovement && squareColor !== playerColor) continue;
      const aabb = getRotatedAABB(player.cx, player.cy, player.width, player.height, player.angle);
      const puCx = pu.gridX * SQUARE_SIZE + SQUARE_SIZE / 2;
      const puCy = pu.gridY * SQUARE_SIZE + SQUARE_SIZE / 2;
      const margin = SQUARE_SIZE / 2;
      if (puCx >= aabb.left - margin && puCx <= aabb.right + margin &&
        puCy >= aabb.top - margin && puCy <= aabb.bottom + margin) {
        collectPowerup(pu, player);
        powerups.splice(idx, 1);
        break;
      }
    }
  }

  // Racket size effects — grow to max compatible size
  for (const [pl, team] of [[player1, 'day'], [player2, 'night']]) {
    const growStacks = effectStacks(team, 'BIGGER_RACKET', now);
    const shrinkStacks = effectStacks(team, 'SHRINK_RACKET', now);
    let desiredH = BASE_PLAYER_HEIGHT + (growStacks * SQUARE_SIZE * BIGGER_RACKET_MULT) - (shrinkStacks * SQUARE_SIZE * BIGGER_RACKET_MULT);
    desiredH = Math.max(MIN_RACKET_HEIGHT, desiredH);
    const canFit = (h) => {
      if (!isWithinBounds(pl.cx, pl.cy, pl.width, h, pl.angle)) return false;
      if (settings.freeMovement) return true;
      const ec = team === 'day' ? NIGHT_COLOR : DAY_COLOR;
      return isPerimeterValid(pl.cx, pl.cy, pl.width, h, pl.angle, SQUARE_SIZE, ec);
    };
    if (desiredH <= pl.height) {
      // Shrinking always works (smaller always fits)
      pl.height = desiredH;
    } else if (canFit(desiredH)) {
      pl.height = desiredH;
    } else {
      // Binary search for max height that fits
      let lo = pl.height, hi = desiredH;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (canFit(mid)) lo = mid; else hi = mid;
      }
      pl.height = lo;
    }
    // Clamp position using rotated AABB
    const aabb = getRotatedAABB(pl.cx, pl.cy, pl.width, pl.height, pl.angle);
    const halfH = (aabb.bottom - aabb.top) / 2;
    if (pl.cy > CANVAS_SIZE - halfH) pl.cy = CANVAS_SIZE - halfH;
    if (pl.cy < halfH) pl.cy = halfH;
  }

  updatePowerupHUD();
}

function spawnPowerup(color) {
  // Reservoir sampling: pick a random matching square without building an array
  let count = 0, pi = 0, pj = 0;
  for (let i = 0; i < NUM_SQUARES; i++)
    for (let j = 0; j < NUM_SQUARES; j++)
      if (squares[i][j] === color) {
        count++;
        if (Math.random() * count < 1) { pi = i; pj = j; }
      }
  if (count < 5) return;
  const pos = { i: pi, j: pj };
  let type;
  if (settings.mirroredPowerups) {
    const team = (color === DAY_COLOR) ? 'day' : 'night';
    // If this team needs a powerup that hasn't been generated yet, 
    // append a new batch to the global sequence.
    if (mirroredIdx[team] >= mirroredSeq.length) {
      const nextBatch = [...POWERUP_TYPES].sort(() => Math.random() - 0.5);
      mirroredSeq.push(...nextBatch);
    }
    type = mirroredSeq[mirroredIdx[team]++];
  } else {
    type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  }
  powerups.push({ type, gridX: pos.i, gridY: pos.j, pulsePhase: Math.random() * Math.PI * 2, spawnTime: game.tickCount / TICK_RATE });
}

function collectPowerup(pu, collector) {
  const team = collector.team;
  const now = game.tickCount / TICK_RATE;
  const dur = settings.powerupDuration;
  if (pu.type === 'EXTRA_BALL') {
    const extraCount = balls.filter(b => b.team === team && b.isExtra && now < b.expiresAt).length;
    if (extraCount >= POWERUP_LIMITS.EXTRA_BALL) {
      // Replace oldest extra ball's expiry to extend duration
      let oldest = null;
      for (const b of balls) {
        if (b.team === team && b.isExtra && (!oldest || b.expiresAt < oldest.expiresAt)) oldest = b;
      }
      if (oldest) oldest.expiresAt = now + dur;
    } else {
      const startX = team === 'day' ? CANVAS_SIZE * 0.25 : CANVAS_SIZE * 0.75;
      const extra = makeBall(startX, CANVAS_SIZE / 2,
        (team === 'day' ? 1 : -1) * BASE_BALL_SPEED,
        (Math.random() > 0.5 ? 1 : -1) * BASE_BALL_SPEED, team);
      extra.isExtra = true;
      extra.expiresAt = now + dur;
      balls.push(extra);
    }
  } else {
    // SHRINK_RACKET applies to the opponent
    const effectTeam = pu.type === 'SHRINK_RACKET' ? (team === 'day' ? 'night' : 'day') : team;
    if (!activeEffects[effectTeam][pu.type]) activeEffects[effectTeam][pu.type] = [];
    const arr = activeEffects[effectTeam][pu.type];
    const limit = POWERUP_LIMITS[pu.type] || 3;
    if (arr.length >= limit) {
      // Replace oldest (earliest expiry) to extend duration
      let minIdx = 0;
      for (let i = 1; i < arr.length; i++) { if (arr[i] < arr[minIdx]) minIdx = i; }
      arr[minIdx] = now + dur;
    } else {
      arr.push(now + dur);
    }
  }

  // Quick respawn: cap next spawn to POWERUP_RESPAWN_QUICK seconds
  const sideKey = team;
  const freq = settings.powerupFrequency;
  const nextScheduled = lastSpawn[sideKey] + freq;
  if (nextScheduled - now > POWERUP_RESPAWN_QUICK) {
    lastSpawn[sideKey] = now - freq + POWERUP_RESPAWN_QUICK;
  }

  audio.playPowerup();
  if (settings.effectsEnabled && settings.particles) {
    const px = pu.gridX * SQUARE_SIZE + SQUARE_SIZE / 2;
    const py = pu.gridY * SQUARE_SIZE + SQUARE_SIZE / 2;
    for (let p = 0; p < 10; p++) particles.push(makeParticle(px, py, ACCENT));
    if (settings.screenShake) screenShake.intensity = Math.max(screenShake.intensity, 4);
  }
}

function updatePowerupHUD() {
  const now = game.tickCount / TICK_RATE;
  for (const [team, el, pKey] of [['day', dayPowerupsEl, 'p1'], ['night', nightPowerupsEl, 'p2']]) {
    let html = '';
    for (const type of POWERUP_TYPES) {
      const stacks = effectStacks(team, type, now);
      if (stacks > 0) html += `<span class="powerup-icon" title="${POWERUP_NAMES[type]}${stacks > 1 ? ' x' + stacks : ''}">${POWERUP_HUD[type]}${stacks > 1 ? stacks : ''}</span>`;
    }
    if (balls.some(b => b.team === team && b.isExtra && now < b.expiresAt))
      html += `<span class="powerup-icon" title="Extra Ball">\u271A</span>`;
    // Teleport charges
    const ts = teleportState[pKey];
    if (ts.remaining > 0) {
      const charging = ts.holdFrames > 0;
      const pct = charging ? Math.round(ts.holdFrames / TELEPORT_HOLD_FRAMES * 100) : 0;
      const style = charging ? 'opacity:1' : 'opacity:0.45';
      html += `<span class="powerup-icon teleport-icon" title="Teleport (both rotate 2s) x${ts.remaining}${charging ? ' — ' + pct + '%' : ''}" style="${style};cursor:pointer">\u21CC${ts.remaining}</span>`;
    }
    el.innerHTML = html;
    // Mirror to side HUD
    const sideEl = document.getElementById(team === 'day' ? 'side-day-powerups' : 'side-night-powerups');
    if (sideEl) sideEl.innerHTML = html;
  }
}

// Cached DOM refs for per-tick HUD updates (avoid getElementById every frame)
const _sideTimerL = document.getElementById('side-timer-left');
const _sideTimerR = document.getElementById('side-timer-right');
const _progBar = document.getElementById('progression-bar');
const _progDay = document.getElementById('prog-day');
const _progNight = document.getElementById('prog-night');
const _sideDayScore = document.getElementById('side-day-score');
const _sideNightScore = document.getElementById('side-night-score');
const _sideBarL = document.getElementById('side-hud-bar-left');
const _sideBarR = document.getElementById('side-hud-bar-right');
const _vprogDayL = _sideBarL ? _sideBarL.querySelector('.vprog-day') : null;
const _vprogNightL = _sideBarL ? _sideBarL.querySelector('.vprog-night') : null;
const _vprogDayR = _sideBarR ? _sideBarR.querySelector('.vprog-day') : null;
const _vprogNightR = _sideBarR ? _sideBarR.querySelector('.vprog-night') : null;
// Change-detection: only write DOM when values actually change
let _prevDayScore = -1, _prevNightScore = -1, _prevDayPct = -1, _prevShowBar = null;

function updateSideTimers() {
  const txt = timerEl.textContent;
  if (_sideTimerL) _sideTimerL.textContent = txt;
  if (_sideTimerR) _sideTimerR.textContent = txt;
}

// ==================== SCORE & WIN ====================
function updateScoreHUD() {
  if (dayScore !== _prevDayScore) {
    _prevDayScore = dayScore;
    dayScoreEl.textContent = dayScore;
    if (_sideDayScore) _sideDayScore.textContent = dayScore;
  }
  if (nightScore !== _prevNightScore) {
    _prevNightScore = nightScore;
    nightScoreEl.textContent = nightScore;
    if (_sideNightScore) _sideNightScore.textContent = nightScore;
  }
  // Progression bar
  const showBar = settings.progressionBar && (settings.winCondition === 'combined' || settings.winCondition === 'domination');
  if (showBar !== _prevShowBar) {
    _prevShowBar = showBar;
    _progBar.style.display = showBar ? 'flex' : 'none';
    if (_sideBarL) _sideBarL.classList.toggle('prog-hidden', !showBar);
    if (_sideBarR) _sideBarR.classList.toggle('prog-hidden', !showBar);
  }
  if (showBar) {
    const dayRaw = dayScore / TOTAL_SQUARES;
    const range = DOMINATION_THRESHOLD - 0.5;
    const dayPct = Math.max(0, Math.min(100, 50 + (dayRaw - 0.5) / range * 50));
    if (dayPct !== _prevDayPct) {
      _prevDayPct = dayPct;
      const dayStr = dayPct + '%';
      const nightStr = (100 - dayPct) + '%';
      _progDay.style.width = dayStr;
      _progNight.style.width = nightStr;
      if (_vprogDayL) _vprogDayL.style.height = dayStr;
      if (_vprogNightL) _vprogNightL.style.height = nightStr;
      if (_vprogDayR) _vprogDayR.style.height = dayStr;
      if (_vprogNightR) _vprogNightR.style.height = nightStr;
    }
  }
}

function checkWinCondition() {
  const now = game.tickCount / TICK_RATE;
  if (settings.winCondition !== 'domination') {
    game.timeRemaining = Math.max(0, settings.duration - now);
    timerEl.textContent = formatTime(game.timeRemaining);
  } else {
    timerEl.textContent = '';
  }
  updateSideTimers();

  const dayPct = dayScore / TOTAL_SQUARES, nightPct = nightScore / TOTAL_SQUARES;
  if (settings.winCondition === 'combined' || settings.winCondition === 'domination') {
    if (dayPct >= DOMINATION_THRESHOLD) { triggerWin('day', true); return; }
    if (nightPct >= DOMINATION_THRESHOLD) { triggerWin('night', true); return; }
  }
  if (settings.winCondition !== 'domination' && game.timeRemaining <= 0) {
    triggerWin(dayScore > nightScore ? 'day' : nightScore > dayScore ? 'night' : 'draw');
  }
}

function triggerWin(winner, isDomination) {
  game.state = 'gameover';
  game.winner = winner;
  audio.playWin();
  if (settings.effectsEnabled && settings.particles) {
    const colors = winner === 'day' ? [DAY_COLOR, ACCENT, colorPalette.ArcticPowder]
      : winner === 'night' ? [NIGHT_COLOR, '#4488aa', '#2a6070']
        : [DAY_COLOR, NIGHT_COLOR, ACCENT];
    for (let i = 0; i < 80; i++)
      particles.push(makeConfetti(CANVAS_SIZE * Math.random(), CANVAS_SIZE * 0.3 * Math.random(),
        colors[Math.floor(Math.random() * colors.length)]));
  }
  setTimeout(() => {
    const dayPctRaw = dayScore / TOTAL_SQUARES * 100;
    const nightPctRaw = nightScore / TOTAL_SQUARES * 100;
    const dayR = Math.round(dayPctRaw), nightR = Math.round(nightPctRaw);
    const scoreEl = document.getElementById('final-score');
    const titleEl = document.getElementById('winner-text');
    titleEl.style.color = '#D9E8E3';

    if (winner === 'draw' || (dayR === 50 && nightR === 50)) {
      titleEl.textContent = "IT'S A DRAW!";
      scoreEl.textContent = '';
    } else if (isDomination) {
      titleEl.textContent = `${winner.toUpperCase()} DOMINATES!`;
      scoreEl.textContent = '';
    } else {
      titleEl.textContent = `${winner.toUpperCase()} WINS!`;
      const winR = winner === 'day' ? dayR : nightR;
      scoreEl.textContent = `${winR}% domination`;
    }
    document.getElementById('gameover').classList.remove('hidden');
  }, 1400);
}

// ==================== EFFECTS ====================
function makeParticle(x, y, color) {
  return {
    x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
    color, life: 1, decay: 0.03 + Math.random() * 0.03, size: 3 + Math.random() * 4
  };
}
function makeConfetti(x, y, color) {
  return {
    x, y, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 10 - 2,
    gravity: 0.15, color, life: 1, decay: 0.004 + Math.random() * 0.006,
    size: 4 + Math.random() * 8, rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15
  };
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.gravity) p.vy += p.gravity;
    if (p.rotation !== undefined) p.rotation += p.rotSpeed;
    p.life -= p.decay;
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
  }
  for (let i = ballTrails.length - 1; i >= 0; i--) {
    ballTrails[i].life -= 0.12;
    if (ballTrails[i].life <= 0) {
      _trailPool.push(ballTrails[i]); // recycle to pool
      ballTrails[i] = ballTrails[ballTrails.length - 1]; ballTrails.pop();
    }
  }
  if (screenShake.intensity > 0) {
    screenShake.intensity *= 0.88;
    if (screenShake.intensity < 0.3) screenShake.intensity = 0;
  }
}

// ==================== RENDERING ====================
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function hexLerp(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t)
  );
}

function drawStar(cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI / points) - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function drawSun(cx, cy, r, rays) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const spread = 0.18;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.48 * Math.cos(a - spread), cy + r * 0.48 * Math.sin(a - spread));
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.lineTo(cx + r * 0.48 * Math.cos(a + spread), cy + r * 0.48 * Math.sin(a + spread));
    ctx.closePath();
    ctx.fill();
  }
}

function drawPowerupIcon(cx, cy, type, size) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.08;
  const s = size * 0.28;
  switch (type) {
    case 'BIGGER_BALL':
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.75, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'EXTRA_BALL':
      const bw = s * 0.22, bl = s * 0.7;
      ctx.fillRect(cx - bw, cy - bl, bw * 2, bl * 2);
      ctx.fillRect(cx - bl, cy - bw, bl * 2, bw * 2);
      break;
    case 'BIGGER_RACKET':
      ctx.fillRect(cx - s * 0.12, cy - s * 0.55, s * 0.24, s * 1.1);
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.85); ctx.lineTo(cx - s * 0.3, cy - s * 0.5); ctx.lineTo(cx + s * 0.3, cy - s * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.85); ctx.lineTo(cx - s * 0.3, cy + s * 0.5); ctx.lineTo(cx + s * 0.3, cy + s * 0.5);
      ctx.closePath(); ctx.fill();
      break;
    case 'FASTER_BALL':
      ctx.lineWidth = size * 0.1; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.05, cy);
      ctx.lineTo(cx - s * 0.45, cy + s * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.5, cy);
      ctx.lineTo(cx, cy + s * 0.45);
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    case 'SHRINK_RACKET':
      // Inward arrows (shrinking)
      ctx.fillRect(cx - s * 0.12, cy - s * 0.55, s * 0.24, s * 1.1);
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.25); ctx.lineTo(cx - s * 0.3, cy - s * 0.1); ctx.lineTo(cx + s * 0.3, cy - s * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.25); ctx.lineTo(cx - s * 0.3, cy + s * 0.1); ctx.lineTo(cx + s * 0.3, cy + s * 0.1);
      ctx.closePath(); ctx.fill();
      break;
  }
}

// Squares: fill day as background, then batch-path all night cells into a single fill.
// Two fillStyle assignments per frame + one batched path — stays on the GPU path,
// unlike putImageData which can force canvas into software mode on mobile GPUs.
function renderSquares() {
  const sq = SQUARE_SIZE;
  ctx.fillStyle = DAY_COLOR;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = NIGHT_COLOR;
  ctx.beginPath();
  for (let i = 0; i < NUM_SQUARES; i++) {
    const col = squares[i];
    const x = i * sq;
    for (let j = 0; j < NUM_SQUARES; j++) {
      if (col[j] === NIGHT_COLOR) ctx.rect(x, j * sq, sq, sq);
    }
  }
  ctx.fill();
}

function render(alpha = 1) {
  renderSquares();

  ctx.save();
  if (settings.effectsEnabled && settings.screenShake && screenShake.intensity > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake.intensity, (Math.random() - 0.5) * screenShake.intensity);
  }

  // Grid lines (single batched path)
  if (settings.effectsEnabled && settings.gridEffect) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= NUM_SQUARES; i++) {
      const pos = i * SQUARE_SIZE;
      ctx.moveTo(pos, 0); ctx.lineTo(pos, CANVAS_SIZE);
      ctx.moveTo(0, pos); ctx.lineTo(CANVAS_SIZE, pos);
    }
    ctx.stroke();
  }

  // Ball trails
  if (settings.effectsEnabled && settings.particles) {
    for (const t of ballTrails) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius * t.life, 0, Math.PI * 2);
      ctx.fillStyle = t.color; ctx.globalAlpha = t.life * 0.1;
      ctx.fill(); ctx.closePath();
    }
    ctx.globalAlpha = 1;
  }

  // Powerups (stars for night territory, suns for day territory)
  for (const pu of powerups) {
    const px = pu.gridX * SQUARE_SIZE + SQUARE_SIZE / 2;
    const py = pu.gridY * SQUARE_SIZE + SQUARE_SIZE / 2;
    const pulse = 0.7 + 0.3 * Math.sin(pu.pulsePhase);
    const onDaySide = squares[pu.gridX] && squares[pu.gridX][pu.gridY] === DAY_COLOR;

    // Glow
    if (settings.effectsEnabled && settings.particles) {
      ctx.beginPath();
      ctx.arc(px, py, POWERUP_VISUAL_RADIUS * pulse * 1.1, 0, Math.PI * 2);
      ctx.globalAlpha = 0.12 * pulse;
      ctx.fillStyle = PU_COLOR;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Shape
    ctx.fillStyle = PU_COLOR;
    if (onDaySide) {
      drawSun(px, py, POWERUP_VISUAL_RADIUS * 0.6, 10);
    } else {
      drawStar(px, py, POWERUP_VISUAL_RADIUS * 0.6, POWERUP_VISUAL_RADIUS * 0.25, 5);
      ctx.fill();
    }

    // Icon
    drawPowerupIcon(px, py, pu.type, POWERUP_VISUAL_RADIUS);
  }

  // Players — blink racket during teleport charge (after 500ms)
  let p1Color = DAY_BALL_COLOR;
  if (teleportState.p1.holdFrames > TELEPORT_BLINK_START) {
    const t = (Math.sin((teleportState.p1.holdFrames - TELEPORT_BLINK_START) * TELEPORT_BLINK_SPEED * Math.PI / TELEPORT_HOLD_FRAMES * 2) + 1) / 2;
    p1Color = hexLerp(DAY_BALL_COLOR, ACCENT, t);
  }
  let p2Color = NIGHT_BALL_COLOR;
  if (teleportState.p2.holdFrames > TELEPORT_BLINK_START) {
    const t = (Math.sin((teleportState.p2.holdFrames - TELEPORT_BLINK_START) * TELEPORT_BLINK_SPEED * Math.PI / TELEPORT_HOLD_FRAMES * 2) + 1) / 2;
    p2Color = hexLerp(NIGHT_BALL_COLOR, ACCENT, t);
  }
  drawRotatedPlayer(player1, p1Color, alpha);
  drawRotatedPlayer(player2, p2Color, alpha);

  // Balls
  for (const ball of balls) {
    const drawX = ball.oldX + (ball.x - ball.oldX) * alpha;
    const drawY = ball.oldY + (ball.y - ball.oldY) * alpha;

    ctx.beginPath();
    ctx.arc(drawX, drawY, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.ballColor; ctx.fill(); ctx.closePath();
    if (ball.radius > BASE_BALL_RADIUS) {
      ctx.beginPath();
      ctx.arc(drawX, drawY, ball.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.stroke(); ctx.closePath();
    }
  }

  // Particles
  if (settings.effectsEnabled && settings.particles) {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.rotation !== undefined) {
        ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();

}

function drawRotatedPlayer(player, fillColor, alpha = 1) {
  const drawX = player.oldX + (player.cx - player.oldX) * alpha;
  const drawY = player.oldY + (player.cy - player.oldY) * alpha;
  const drawAngle = player.oldAngle + (player.angle - player.oldAngle) * alpha;

  ctx.save();
  ctx.translate(drawX, drawY);
  ctx.rotate(drawAngle);
  ctx.fillStyle = fillColor;
  ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
  if (settings.effectsEnabled && settings.racketOutline) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-player.width / 2, -player.height / 2, player.width, player.height);
  }
  ctx.restore();
}

// Sync side HUD bars to align with the canvas (desktop touch landscape)
function syncSideHudAlignment() {
  if (!touchMode || !hasFinePointer) return;
  const c = canvas;
  const leftBar = document.getElementById('side-hud-bar-left');
  const rightBar = document.getElementById('side-hud-bar-right');
  if (!c || !leftBar || !rightBar) return;
  const canvasRect = c.getBoundingClientRect();
  const wrapperRect = c.closest('#game-wrapper').getBoundingClientRect();
  const offset = canvasRect.top - wrapperRect.top;
  const h = canvasRect.height;
  leftBar.style.marginTop = offset + 'px';
  rightBar.style.marginTop = offset + 'px';
  leftBar.style.height = h + 'px';
  rightBar.style.height = h + 'px';
}

// ==================== GAME LOOP ======================================
let lastFrameTime = 0, accumulator = 0;

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;

  if (game.state === 'gameover') { updateParticles(); render(1); return; }
  if (game.state !== 'playing') return;

  accumulator += delta;
  while (accumulator >= TICK_MS) {
    // Record state for interpolation
    player1.oldX = player1.cx; player1.oldY = player1.cy; player1.oldAngle = player1.angle;
    player2.oldX = player2.cx; player2.oldY = player2.cy; player2.oldAngle = player2.angle;
    for (const b of balls) { b.oldX = b.x; b.oldY = b.y; }

    game.tickCount++;
    updatePlayers();
    updateBalls();
    updatePowerups();
    updateScoreHUD();
    checkWinCondition();
    if (game.state !== 'playing') break;
    accumulator -= TICK_MS;
  }
  // After physics: if a ball bounced this tick, start interpolation from the
  // wall so the ball visually touches the edge before moving away.
  for (const b of balls) {
    if (b.bounceT > 0 && b.bounceT <= 1) {
      b.oldX = b.bounceX;
      b.oldY = b.bounceY;
    }
  }
  updateParticles();
  const alpha = accumulator / TICK_MS;
  render(alpha);
  syncSideHudAlignment();
}

// ==================== INPUT SETUP ====================
function normalizeKey(k) { return k.length === 1 ? k.toLowerCase() : k; }

document.addEventListener('keydown', e => {
  const key = normalizeKey(e.key);
  keys[key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
  if (listeningBtn) { handleKeyBindPress(e); return; }
  if (key === 'Escape') {
    if (game.state === 'playing' || game.state === 'paused') togglePause();
    else if (!document.getElementById('keybind-overlay').classList.contains('hidden')) closeKeybindUI();
    else if (!document.getElementById('settings-overlay').classList.contains('hidden')) closeSettings();
  }
  if (key === ' ' && game.state === 'menu') startGame();
  if (key === 'Enter') {
    // Submit the primary button of the currently visible overlay/menu
    const targets = [
      ['keybind-overlay', 'close-keys-btn'],
      ['settings-overlay', 'close-settings-btn'],
      ['pause-overlay', 'resume-btn'],
      ['gameover', 'play-again-btn'],
      ['menu', 'start-btn'],
    ];
    for (const [overlayId, btnId] of targets) {
      const overlay = document.getElementById(overlayId);
      if (overlay && !overlay.classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById(btnId)?.click();
        break;
      }
    }
  }
});
document.addEventListener('keyup', e => { keys[normalizeKey(e.key)] = false; });

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    document.getElementById('pause-overlay').classList.remove('hidden');
  } else if (game.state === 'paused') {
    game.state = 'playing';
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('settings-overlay').classList.add('hidden');
  }
}

// Joystick — minimal-latency using Pointer Events + setPointerCapture.
// Geometry is cached on layout changes (not per-touch), and input objects are
// reused to avoid GC allocations in the hot path.
function setupJoystick(areaId, knobId, pKey) {
  const area = document.getElementById(areaId);
  const knob = document.getElementById(knobId);
  if (!area || !knob) return;
  let centerX = 0, centerY = 0, maxD = 22, halfKnob = 12;
  let active = false;
  // Pre-allocate input object — mutated in place, never recreated
  const inputObj = { dx: 0, dy: 0 };
  // Detect CSS rotation on the panel to counter-rotate knob visuals
  let cosR = 1, sinR = 0;

  function cacheGeometry() {
    const rect = area.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    maxD = Math.max(22, rect.width * 0.4);
    halfKnob = knob.offsetWidth / 2;
    // Detect panel rotation
    const panel = area.closest('.mobile-panel');
    if (!panel) { cosR = 1; sinR = 0; return; }
    const st = getComputedStyle(panel).transform;
    if (!st || st === 'none') { cosR = 1; sinR = 0; return; }
    const m = st.match(/matrix\(([^)]+)\)/);
    if (m) {
      const v = m[1].split(',').map(Number);
      cosR = v[0]; sinR = -v[1];
    }
  }

  // Cache geometry on layout changes instead of every pointer-down
  const layoutObserver = new ResizeObserver(cacheGeometry);
  layoutObserver.observe(area);
  window.addEventListener('orientationchange', () => setTimeout(cacheGeometry, 100));
  // Initial cache after first layout
  requestAnimationFrame(cacheGeometry);

  function onDown(e) {
    if (active) return; // already tracking a pointer
    active = true;
    area.setPointerCapture(e.pointerId);
    audio.init(); audio.resume();
    // Refresh geometry on down (cheap since ResizeObserver keeps it warm,
    // but handles scroll offset changes)
    const rect = area.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    processPointer(e);
  }
  function onMove(e) {
    if (!active) return;
    processPointer(e);
  }
  function processPointer(e) {
    // Screen-space deltas
    const sdx = e.clientX - centerX, sdy = e.clientY - centerY;
    // Counter-rotate screen deltas into panel's local coordinate space
    const ldx = sdx * cosR - sdy * sinR, ldy = sdx * sinR + sdy * cosR;
    // Clamp in local space (for knob visual)
    const cx = Math.max(-maxD, Math.min(maxD, ldx));
    const cy = Math.max(-maxD, Math.min(maxD, ldy));
    knob.style.transform = `translate3d(${cx - halfKnob}px,${cy - halfKnob}px,0)`;
    // Game input uses screen-space deltas (player movement is in screen orientation)
    const gx = Math.max(-maxD, Math.min(maxD, sdx));
    const gy = Math.max(-maxD, Math.min(maxD, sdy));
    inputObj.dx = gx / maxD;
    inputObj.dy = gy / maxD;
    joystickInput[pKey] = inputObj;
  }
  function onUp() {
    active = false;
    joystickInput[pKey] = null;
    knob.style.transform = 'translate(-50%,-50%)';
  }
  area.addEventListener('pointerdown', onDown);
  area.addEventListener('pointermove', onMove);
  area.addEventListener('pointerup', onUp);
  area.addEventListener('pointercancel', onUp);
  // Prevent touch-based scrolling/zooming on the joystick area
  area.style.touchAction = 'none';
}

function setupRotateBtn(btnId, key) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.style.touchAction = 'none';
  btn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    btn.setPointerCapture(e.pointerId);
    mobileRotate[key] = true; btn.classList.add('pressed');
  });
  const up = () => { mobileRotate[key] = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}

// ==================== KEYBINDING UI ====================
let listeningBtn = null;

function keyDisplayName(key) {
  const m = {
    ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192',
    ' ': 'Space', Escape: 'Esc', ',': ',', '.': '.'
  };
  return m[key] || (key.length === 1 ? key.toUpperCase() : key);
}

function buildKeyBindUI() {
  const grid = document.getElementById('keybind-grid');
  grid.innerHTML = '';
  for (const [pKey, label] of [['p1', 'Player 1 (Day)'], ['p2', 'Player 2 (Night)']]) {
    const sec = document.createElement('div');
    sec.className = 'keybind-section';
    sec.innerHTML = `<h3>${label}</h3>`;
    for (const [action, name] of [['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['rotL', 'Rotate \u21BA'], ['rotR', 'Rotate \u21BB']]) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      row.innerHTML = `<span>${name}</span><button class="keybind-btn" data-player="${pKey}" data-action="${action}">${keyDisplayName(keyBindings[pKey][action])}</button>`;
      row.querySelector('.keybind-btn').addEventListener('click', function () { startListening(this); });
      sec.appendChild(row);
    }
    grid.appendChild(sec);
  }
}

function startListening(btn) {
  if (listeningBtn) { listeningBtn.classList.remove('listening'); restoreListeningBtn(); }
  listeningBtn = btn;
  btn.classList.add('listening');
  btn.textContent = '...';
}

function restoreListeningBtn() {
  if (!listeningBtn) return;
  const p = listeningBtn.dataset.player, a = listeningBtn.dataset.action;
  listeningBtn.textContent = keyDisplayName(keyBindings[p][a]);
  listeningBtn.classList.remove('listening');
  listeningBtn = null;
}

function handleKeyBindPress(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { restoreListeningBtn(); return; }
  const p = listeningBtn.dataset.player, a = listeningBtn.dataset.action;
  keyBindings[p][a] = normalizeKey(e.key);
  listeningBtn.textContent = keyDisplayName(normalizeKey(e.key));
  listeningBtn.classList.remove('listening');
  listeningBtn = null;
  saveSettings();
  updateControlsHelp();
}

function openKeybindUI() {
  buildKeyBindUI();
  document.getElementById('keybind-overlay').classList.remove('hidden');
}
function closeKeybindUI() {
  if (listeningBtn) restoreListeningBtn();
  document.getElementById('keybind-overlay').classList.add('hidden');
}

function updateControlsHelp() {
  const b = keyBindings;
  const el = document.getElementById('desktop-controls-help');
  if (el) {
    el.innerHTML = `P1: ${keyDisplayName(b.p1.up)} ${keyDisplayName(b.p1.left)} ${keyDisplayName(b.p1.down)} ${keyDisplayName(b.p1.right)} + ${keyDisplayName(b.p1.rotL)}/${keyDisplayName(b.p1.rotR)} rotate &bull; P2: ${keyDisplayName(b.p2.up)} ${keyDisplayName(b.p2.left)} ${keyDisplayName(b.p2.down)} ${keyDisplayName(b.p2.right)} + ${keyDisplayName(b.p2.rotL)}/${keyDisplayName(b.p2.rotR)} rotate<br><a id="config-keys-link">Configure Keys</a> &bull; <a id="menu-settings-link">&#x2699; Settings</a> &bull; ESC: Pause`;
    document.getElementById('config-keys-link').addEventListener('click', openKeybindUI);
    document.getElementById('menu-settings-link').addEventListener('click', () => openSettings('menu'));
  }
}

// ==================== SETTINGS UI ====================
function openSettings(from) {
  settingsReturnTo = from || 'menu';
  const isInGame = game.state === 'playing' || game.state === 'paused';
  if (game.state === 'playing') {
    game.state = 'paused';
    document.getElementById('pause-overlay').classList.add('hidden');
  }

  // Grey out game-logic settings when in-game
  document.querySelectorAll('.game-logic-setting').forEach(el => {
    el.classList.toggle('disabled', isInGame);
  });

  syncSettingsUI();
  document.getElementById('settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
  saveSettings();
  if (settingsReturnTo === 'playing') {
    game.state = 'playing';
  } else if (settingsReturnTo === 'pause') {
    document.getElementById('pause-overlay').classList.remove('hidden');
  }
  // 'menu' — menu is already showing
}

function syncSettingsUI() {
  // Sound
  setToggle('snd-toggle', settings.soundEnabled ? 'on' : 'off');
  document.getElementById('volume-slider').value = settings.soundVolume;
  document.getElementById('volume-label').textContent = settings.soundVolume + '%';

  // FX
  setToggle('fx-master', settings.effectsEnabled ? 'on' : 'off');
  setToggle('fx-shake', settings.screenShake ? 'on' : 'off');
  setToggle('fx-outline', settings.racketOutline ? 'on' : 'off');
  setToggle('fx-grid', settings.gridEffect ? 'on' : 'off');
  setToggle('fx-particles', settings.particles ? 'on' : 'off');
  setToggle('fx-progbar', settings.progressionBar ? 'on' : 'off');
  document.getElementById('fx-sub').style.opacity = settings.effectsEnabled ? '1' : '0.35';
  document.getElementById('fx-sub').style.pointerEvents = settings.effectsEnabled ? 'auto' : 'none';

  // Powerups
  document.getElementById('pu-freq-slider').value = settings.powerupFrequency;
  document.getElementById('pu-freq-label').textContent = settings.powerupFrequency + 's';
  document.getElementById('pu-dur-slider').value = settings.powerupDuration;
  document.getElementById('pu-dur-label').textContent = settings.powerupDuration + 's';

  // Gameplay
  setToggle('free-move-toggle', settings.freeMovement ? 'on' : 'off');
  setToggle('pu-mirror-toggle', settings.mirroredPowerups ? 'on' : 'off');
  setToggle('touch-mode-toggle', touchMode ? 'on' : 'off');
  setToggle('theme-toggle', settings.theme || 'cyber');
  const touchRow = document.getElementById('touch-mode-row');
  if (touchRow) touchRow.classList.toggle('hidden', !hasTouch);
}

function setToggle(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

function setupSettingsUI() {
  // Toggle groups in settings
  const settingsToggles = {
    'snd-toggle': v => { settings.soundEnabled = v === 'on'; },
    'fx-master': v => {
      settings.effectsEnabled = v === 'on';
      document.getElementById('fx-sub').style.opacity = v === 'on' ? '1' : '0.35';
      document.getElementById('fx-sub').style.pointerEvents = v === 'on' ? 'auto' : 'none';
    },
    'fx-shake': v => { settings.screenShake = v === 'on'; },
    'fx-outline': v => { settings.racketOutline = v === 'on'; },
    'fx-grid': v => { settings.gridEffect = v === 'on'; },
    'fx-particles': v => { settings.particles = v === 'on'; },
    'fx-progbar': v => { settings.progressionBar = v === 'on'; },
    'free-move-toggle': v => { settings.freeMovement = v === 'on'; },
    'pu-mirror-toggle': v => { settings.mirroredPowerups = v === 'on'; },
    'theme-toggle': v => { settings.theme = v; applyTheme(v); },
    'touch-mode-toggle': v => {
      touchMode = v === 'on';
      settings.touchControls = touchMode;
      applyTouchMode();
      if (touchMode) initJoysticks();
    },
  };

  for (const [id, handler] of Object.entries(settingsToggles)) {
    const group = document.getElementById(id);
    if (!group) continue;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handler(btn.dataset.value);
        saveSettings();
      });
    });
  }

  // Sliders
  const volSlider = document.getElementById('volume-slider');
  volSlider.addEventListener('input', () => {
    const v = parseInt(volSlider.value);
    audio.setVolume(v);
    document.getElementById('volume-label').textContent = v + '%';
    saveSettings();
  });

  const freqSlider = document.getElementById('pu-freq-slider');
  freqSlider.addEventListener('input', () => {
    settings.powerupFrequency = parseInt(freqSlider.value);
    document.getElementById('pu-freq-label').textContent = settings.powerupFrequency + 's';
    saveSettings();
  });

  const durSlider = document.getElementById('pu-dur-slider');
  durSlider.addEventListener('input', () => {
    settings.powerupDuration = parseInt(durSlider.value);
    document.getElementById('pu-dur-label').textContent = settings.powerupDuration + 's';
    saveSettings();
  });

  // Reset buttons
  const resetMap = {
    soundEnabled: () => { settings.soundEnabled = DEFAULT_ADV.soundEnabled; syncSettingsUI(); saveSettings(); },
    soundVolume: () => { settings.soundVolume = DEFAULT_ADV.soundVolume; audio.setVolume(settings.soundVolume); syncSettingsUI(); saveSettings(); },
    effectsEnabled: () => { settings.effectsEnabled = DEFAULT_ADV.effectsEnabled; syncSettingsUI(); saveSettings(); },
    screenShake: () => { settings.screenShake = DEFAULT_ADV.screenShake; syncSettingsUI(); saveSettings(); },
    racketOutline: () => { settings.racketOutline = DEFAULT_ADV.racketOutline; syncSettingsUI(); saveSettings(); },
    gridEffect: () => { settings.gridEffect = DEFAULT_ADV.gridEffect; syncSettingsUI(); saveSettings(); },
    particles: () => { settings.particles = DEFAULT_ADV.particles; syncSettingsUI(); saveSettings(); },
    progressionBar: () => { settings.progressionBar = DEFAULT_ADV.progressionBar; syncSettingsUI(); saveSettings(); },
    powerupFrequency: () => { settings.powerupFrequency = DEFAULT_ADV.powerupFrequency; syncSettingsUI(); saveSettings(); },
    powerupDuration: () => { settings.powerupDuration = DEFAULT_ADV.powerupDuration; syncSettingsUI(); saveSettings(); },
    freeMovement: () => { settings.freeMovement = DEFAULT_ADV.freeMovement; syncSettingsUI(); saveSettings(); },
    mirroredPowerups: () => { settings.mirroredPowerups = DEFAULT_ADV.mirroredPowerups; syncSettingsUI(); saveSettings(); },
    theme: () => { settings.theme = DEFAULT_ADV.theme; applyTheme(settings.theme); syncSettingsUI(); saveSettings(); },
    touchControls: () => {
      settings.touchControls = null;
      touchMode = hasTouch && !hasFinePointer;
      applyTouchMode();
      syncSettingsUI(); saveSettings();
    },
  };

  document.querySelectorAll('.reset-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (resetMap[key]) resetMap[key]();
    });
  });

  // Close / open
  document.getElementById('close-settings-btn').addEventListener('click', closeSettings);
  document.getElementById('settings-keys-btn').addEventListener('click', () => {
    document.getElementById('settings-overlay').classList.add('hidden');
    openKeybindUI();
  });

  // Gear button
  document.getElementById('gear-btn').addEventListener('click', () => {
    audio.init(); audio.resume();
    if (game.state === 'playing') {
      openSettings('playing');
    } else if (game.state === 'paused') {
      document.getElementById('pause-overlay').classList.add('hidden');
      openSettings('pause');
    } else if (game.state === 'menu') {
      openSettings('menu');
    } else if (game.state === 'gameover') {
      openSettings('menu');
    }
  });

  // Mobile pause button
  document.getElementById('pause-btn').addEventListener('click', () => {
    if (game.state === 'playing' || game.state === 'paused') togglePause();
  });

  // Pause settings button
  document.getElementById('pause-settings-btn').addEventListener('click', () => {
    document.getElementById('pause-overlay').classList.add('hidden');
    openSettings('pause');
  });
}

// ==================== MENU LOGIC ====================
function setupMenu() {
  document.querySelectorAll('#menu .toggle-group').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handleOptionChange(group.id, btn.dataset.value);
      });
    });
  });

  const slider = document.getElementById('duration-slider');
  const label = document.getElementById('duration-label');
  slider.addEventListener('input', () => {
    settings.duration = parseInt(slider.value);
    label.textContent = formatTime(settings.duration);
  });
  // Hidden feature: click duration label to enter arbitrary time
  label.addEventListener('click', () => {
    const input = prompt('Enter duration in seconds:', settings.duration);
    if (input !== null) {
      const val = parseInt(input);
      if (val > 0) {
        settings.duration = val;
        slider.max = Math.max(300, val);
        slider.value = val;
        label.textContent = formatTime(val);
      }
    }
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('play-again-btn').addEventListener('click', startGame);
  document.getElementById('menu-btn').addEventListener('click', showMenu);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  document.getElementById('quit-btn').addEventListener('click', showMenu);
  document.getElementById('config-keys-link').addEventListener('click', openKeybindUI);
  document.getElementById('close-keys-btn').addEventListener('click', closeKeybindUI);
  document.getElementById('reset-keys-btn').addEventListener('click', () => {
    keyBindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    saveSettings(); buildKeyBindUI(); updateControlsHelp();
  });

  // Menu settings links
  const msl = document.getElementById('menu-settings-link');
  if (msl) msl.addEventListener('click', () => openSettings('menu'));
  const mslm = document.getElementById('menu-settings-link-mobile');
  if (mslm) mslm.addEventListener('click', () => openSettings('menu'));
}

function handleOptionChange(groupId, value) {
  switch (groupId) {
    case 'mode-select':
      settings.mode = value;
      // In "vs AI", hide Day AI difficulty and only present Night AI difficulty but labeled as "AI Difficulty"
      // In "AI vs AI", present both.
      document.getElementById('ai-options').classList.toggle('hidden', value !== 'aivsai');
      document.getElementById('ai2-options').classList.toggle('hidden', value !== 'ai' && value !== 'aivsai');
      const lbl2 = document.getElementById('ai2-difficulty-label');
      if (lbl2) lbl2.textContent = value === 'aivsai' ? 'Night AI Difficulty' : 'AI Difficulty';

      document.body.classList.toggle('p1-ai', value === 'aivsai');
      document.body.classList.toggle('p2-ai', value === 'ai' || value === 'aivsai');
      document.body.classList.toggle('ai-mode', value === 'ai' || value === 'aivsai');
      break;
    case 'difficulty-select': settings.ai1Difficulty = value; break;
    case 'difficulty2-select': settings.aiDifficulty = value; break;
    case 'win-select':
      settings.winCondition = value;
      document.getElementById('duration-options').classList.toggle('hidden', value === 'domination');
      break;
  }
}

function showMenu() {
  game.state = 'menu';
  document.body.classList.remove('game-active');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
  if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  // Clear inline styles that would override CSS display rules
  document.getElementById('progression-bar').style.display = '';
}

function formatTime(s) {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// Teleport icon: click/tap to explain how to trigger
document.addEventListener('click', e => {
  if (e.target.closest('.teleport-icon')) {
    const msg = touchMode
      ? 'Hold both rotate buttons for 2 seconds to teleport your ball to your racket.'
      : `Hold both rotate keys (${keyDisplayName(keyBindings.p1.rotL)}+${keyDisplayName(keyBindings.p1.rotR)} or ${keyDisplayName(keyBindings.p2.rotL)}+${keyDisplayName(keyBindings.p2.rotR)}) for 2 seconds to teleport your ball to your racket.`;
    alert(msg);
  }
});

// ==================== GAME INIT ====================
function makeBall(x, y, dx, dy, team) {
  return {
    x, y, dx, dy, team,
    oldX: x, oldY: y,
    bounceX: 0, bounceY: 0, bounceT: -1,
    paintColor: team === 'day' ? DAY_COLOR : NIGHT_COLOR,
    ballColor: team === 'day' ? DAY_BALL_COLOR : NIGHT_BALL_COLOR,
    radius: BASE_BALL_RADIUS, isExtra: false, expiresAt: Infinity,
    skipSquareCheck: 0,
    powerBoost: 0, powerBoostTime: 0
  }; // for physics power shot
}

function startGame() {
  audio.init(); audio.resume();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('keybind-overlay').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
  document.body.classList.add('game-active');
  document.body.classList.toggle('p1-ai', settings.mode === 'aivsai');
  document.body.classList.toggle('p2-ai', settings.mode !== '2p');
  document.body.classList.toggle('ai-mode', settings.mode !== '2p');

  // For 2P mode on mobile, attempt to force landscape to avoid overlapping controls
  if (settings.mode === '2p' && hasTouch && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => { });
  }

  squares = [];
  for (let i = 0; i < NUM_SQUARES; i++) {
    squares[i] = [];
    for (let j = 0; j < NUM_SQUARES; j++)
      squares[i][j] = i < NUM_SQUARES / 2 ? DAY_COLOR : NIGHT_COLOR;
  }

  balls = [
    makeBall(CANVAS_SIZE * 0.25, CANVAS_SIZE / 2, BASE_BALL_SPEED, -BASE_BALL_SPEED, 'day'),
    makeBall(CANVAS_SIZE * 0.75, CANVAS_SIZE / 2, -BASE_BALL_SPEED, BASE_BALL_SPEED, 'night'),
  ];

  const hw = BASE_PLAYER_WIDTH / 2;
  player1 = {
    cx: 30 + hw, cy: CANVAS_SIZE / 2, width: BASE_PLAYER_WIDTH, height: BASE_PLAYER_HEIGHT,
    speed: BASE_PLAYER_SPEED, team: 'day', angle: 0,
    oldX: 30 + hw, oldY: CANVAS_SIZE / 2, oldAngle: 0
  };
  player2 = {
    cx: CANVAS_SIZE - 30 - hw, cy: CANVAS_SIZE / 2, width: BASE_PLAYER_WIDTH, height: BASE_PLAYER_HEIGHT,
    speed: BASE_PLAYER_SPEED, team: 'night', angle: 0,
    oldX: CANVAS_SIZE - 30 - hw, oldY: CANVAS_SIZE / 2, oldAngle: 0
  };

  powerups = []; activeEffects = { day: {}, night: {} };
  particles = []; ballTrails = []; _trailPool = []; screenShake = { intensity: 0 };
  _prevDayScore = -1; _prevNightScore = -1; _prevDayPct = -1; _prevShowBar = null;
  teleportState = { p1: { holdFrames: 0, remaining: TELEPORT_MAX }, p2: { holdFrames: 0, remaining: TELEPORT_MAX } };
  dayScore = TOTAL_SQUARES / 2; nightScore = TOTAL_SQUARES / 2;
  lastSpawn = { day: 0, night: 0 };
  mirroredSeq = []; mirroredIdx = { day: 0, night: 0 };
  aiState = { p1: makeAiState(player1.cx, player1.cy), p2: makeAiState(player2.cx, player2.cy) };

  game.state = 'playing'; game.tickCount = 0; game.winner = null;
  game.timeRemaining = settings.winCondition === 'domination' ? Infinity : settings.duration;
  lastFrameTime = 0; accumulator = 0;
  // Sync side HUDs after layout settles
  requestAnimationFrame(syncSideHudAlignment);
}

// ==================== BOOT ====================
loadSettings();
setupMenu();
setupSettingsUI();
updateControlsHelp();

let joysticksInitialized = false;
function initJoysticks() {
  if (joysticksInitialized) return;
  joysticksInitialized = true;
  setupJoystick('joystick-p1', 'knob-p1', 'p1');
  setupJoystick('joystick-p2', 'knob-p2', 'p2');
  setupJoystick('joystick-p1b', 'knob-p1b', 'p1'); // bottom panel (AI mode)
  setupRotateBtn('rot-p1-ccw', 'p1ccw');
  setupRotateBtn('rot-p1-cw', 'p1cw');
  setupRotateBtn('rot-p2-ccw', 'p2ccw');
  setupRotateBtn('rot-p2-cw', 'p2cw');
  setupRotateBtn('rot-p1b-ccw', 'p1ccw'); // bottom panel rotate
  setupRotateBtn('rot-p1b-cw', 'p1cw');
}
if (touchMode) initJoysticks();

// Fullscreen button (always wire up if it exists)
const fsBtn = document.getElementById('fullscreen-btn');
if (fsBtn) {
  const fsSvgEnter = '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  const fsSvgExit = '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  function updateFsIcon() {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    fsBtn.innerHTML = isFs ? fsSvgExit : fsSvgEnter;
  }
  fsBtn.addEventListener('click', () => {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFs) {
      try {
        const docEl = document.documentElement;
        const req = docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.mozRequestFullScreen ||
          docEl.msRequestFullscreen;
        if (req) {
          const res = req.call(docEl);
          if (res && res.catch) res.catch(e => { });
        }

        // In 2P mode, lock to landscape; in AI mode allow any orientation
        if (screen.orientation && screen.orientation.lock) {
          if (settings.mode !== 'ai') {
            screen.orientation.lock('landscape').catch(() => { });
          }
        }
      } catch (e) {
        console.error('Fullscreen request failed:', e);
      }
    } else {
      const exitFs = document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen;
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      if (exitFs) {
        try {
          const res = exitFs.call(document);
          if (res && res.catch) res.catch(e => { });
        } catch (e) { }
      }
    }
  });
  const updateFsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  updateFsEvents.forEach(evt => document.addEventListener(evt, updateFsIcon));

  // Gesture blocking is handled by CSS touch-action:none on html/body.
}

requestAnimationFrame(gameLoop);

// Final color sync once all external stylesheets are definitely loaded
window.addEventListener('load', syncThemeColors);
