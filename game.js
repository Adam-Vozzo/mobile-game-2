/* ============================================================
   Yharnam Nights — gameplay
   A Bloodborne-themed Vampire Survivors clone.
   ============================================================ */
'use strict';

// ============================================================
// Utilities
// ============================================================
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
};

// ============================================================
// Canvas
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let DPR = 1;
let W = 0, H = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ============================================================
// Audio (synthesized on the fly)
// ============================================================
let audioCtx = null;
let masterGain = null;
let muted = false;

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  } catch (e) { /* no audio */ }
}

function envGain(g, t0, attack, decay, peak, sustain) {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + attack + decay);
}

function tone(freq, dur, type = 'sine', vol = 0.3, attack = 0.005, decay = 0.08, freqEnd = null) {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  envGain(g, t0, attack, decay, vol, 0.0001);
  g.gain.setTargetAtTime(0.0001, t0 + dur - 0.05, 0.05);
  o.connect(g); g.connect(masterGain);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.25, filterFreq = 1500, filterQ = 1, type = 'lowpass') {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = type; filt.frequency.value = filterFreq; filt.Q.value = filterQ;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(masterGain);
  src.start(t0); src.stop(t0 + dur);
}

const sfx = {
  hit:        () => { noise(0.08, 0.35, 800, 1, 'lowpass'); tone(140, 0.07, 'square', 0.12, 0.002, 0.06, 90); },
  hitBig:     () => { noise(0.18, 0.5, 600, 2, 'lowpass'); tone(80, 0.18, 'sawtooth', 0.18, 0.002, 0.15, 50); },
  swing:      () => { noise(0.16, 0.18, 1200, 1, 'bandpass'); },
  shot:       () => { noise(0.06, 0.3, 2200, 4, 'bandpass'); tone(720, 0.05, 'square', 0.08, 0.002, 0.04, 220); },
  pickup:     () => { tone(880, 0.06, 'triangle', 0.18, 0.002, 0.05); tone(1320, 0.08, 'triangle', 0.12, 0.002, 0.07); },
  pickupBig:  () => { tone(660, 0.08, 'triangle', 0.2); tone(990, 0.1, 'triangle', 0.18, 0.005, 0.08); tone(1320, 0.12, 'triangle', 0.14, 0.01, 0.1); },
  levelup:    () => { tone(523, 0.18, 'triangle', 0.25); setTimeout(() => tone(659, 0.18, 'triangle', 0.25), 90); setTimeout(() => tone(784, 0.36, 'triangle', 0.28), 180); },
  hurt:       () => { noise(0.22, 0.4, 500, 2, 'lowpass'); tone(180, 0.2, 'sawtooth', 0.18, 0.002, 0.18, 60); },
  death:      () => { tone(220, 1.4, 'sawtooth', 0.3, 0.01, 1.2, 40); noise(1.2, 0.25, 400, 1, 'lowpass'); },
  victory:    () => { tone(523, 0.4, 'triangle', 0.25); setTimeout(() => tone(659, 0.4, 'triangle', 0.25), 200); setTimeout(() => tone(784, 0.4, 'triangle', 0.25), 400); setTimeout(() => tone(1047, 0.8, 'triangle', 0.3), 600); },
  boss:       () => { tone(60, 1.0, 'sawtooth', 0.4, 0.05, 0.95, 40); noise(1.0, 0.4, 200, 2, 'lowpass'); },
};

// ============================================================
// Input — touch joystick + keyboard fallback
// ============================================================
const input = {
  ax: 0, ay: 0,        // analog axes -1..1
  active: false,
  touchId: -1,
  origin: { x: 0, y: 0 },
  pos: { x: 0, y: 0 },
  keys: new Set(),
};

const JOY_MAX = 55; // px
const joystickEl = document.getElementById('joystick');
const joystickKnobEl = document.getElementById('joystickKnob');

function updateJoystickVisual() {
  joystickEl.style.left = input.origin.x + 'px';
  joystickEl.style.top = input.origin.y + 'px';
  const dx = clamp(input.pos.x - input.origin.x, -JOY_MAX, JOY_MAX);
  const dy = clamp(input.pos.y - input.origin.y, -JOY_MAX, JOY_MAX);
  joystickKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function setAxesFromTouch() {
  const dx = input.pos.x - input.origin.x;
  const dy = input.pos.y - input.origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) { input.ax = 0; input.ay = 0; return; }
  const k = Math.min(1, len / JOY_MAX);
  input.ax = (dx / len) * k;
  input.ay = (dy / len) * k;
}

canvas.addEventListener('touchstart', (e) => {
  ensureAudio();
  if (input.active || !game.running) return;
  const t = e.changedTouches[0];
  input.active = true;
  input.touchId = t.identifier;
  input.origin.x = t.clientX;
  input.origin.y = t.clientY;
  input.pos.x = t.clientX;
  input.pos.y = t.clientY;
  joystickEl.classList.remove('hidden');
  updateJoystickVisual();
  setAxesFromTouch();
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!input.active) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === input.touchId) {
      input.pos.x = t.clientX;
      input.pos.y = t.clientY;
      updateJoystickVisual();
      setAxesFromTouch();
      break;
    }
  }
  e.preventDefault();
}, { passive: false });

function endTouch(e) {
  if (!input.active) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === input.touchId) {
      input.active = false;
      input.touchId = -1;
      input.ax = 0; input.ay = 0;
      joystickEl.classList.add('hidden');
      break;
    }
  }
}
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

// Keyboard fallback (desktop testing)
window.addEventListener('keydown', (e) => {
  ensureAudio();
  input.keys.add(e.key.toLowerCase());
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

function readKeyboard() {
  if (input.active) return;
  let dx = 0, dy = 0;
  if (input.keys.has('arrowleft') || input.keys.has('a')) dx -= 1;
  if (input.keys.has('arrowright') || input.keys.has('d')) dx += 1;
  if (input.keys.has('arrowup') || input.keys.has('w')) dy -= 1;
  if (input.keys.has('arrowdown') || input.keys.has('s')) dy += 1;
  const l = Math.hypot(dx, dy);
  if (l > 0) { dx /= l; dy /= l; }
  input.ax = dx; input.ay = dy;
}

// Mouse fallback for desktop — drag from anywhere
canvas.addEventListener('mousedown', (e) => {
  ensureAudio();
  if (!game.running) return;
  input.active = true;
  input.touchId = -2;
  input.origin.x = e.clientX; input.origin.y = e.clientY;
  input.pos.x = e.clientX; input.pos.y = e.clientY;
  joystickEl.classList.remove('hidden');
  updateJoystickVisual();
});
canvas.addEventListener('mousemove', (e) => {
  if (!input.active || input.touchId !== -2) return;
  input.pos.x = e.clientX; input.pos.y = e.clientY;
  updateJoystickVisual();
  setAxesFromTouch();
});
canvas.addEventListener('mouseup', () => {
  if (input.touchId === -2) {
    input.active = false; input.touchId = -1;
    input.ax = 0; input.ay = 0;
    joystickEl.classList.add('hidden');
  }
});

// ============================================================
// Camera + screen shake
// ============================================================
const cam = { x: 0, y: 0, shake: 0, shakeMax: 0 };

function shakeScreen(amount) {
  cam.shake = Math.max(cam.shake, amount);
  cam.shakeMax = Math.max(cam.shakeMax, amount);
}

function camApply() {
  let sx = 0, sy = 0;
  if (cam.shake > 0.05) {
    sx = (Math.random() - 0.5) * cam.shake;
    sy = (Math.random() - 0.5) * cam.shake;
  }
  ctx.translate(W / 2 - cam.x + sx, H / 2 - cam.y + sy);
}

// ============================================================
// World (background tiles, fog)
// ============================================================
let bgPattern = null;
function buildBgPattern() {
  const tile = document.createElement('canvas');
  const SZ = 256;
  tile.width = SZ; tile.height = SZ;
  const tx = tile.getContext('2d');
  // Cobblestone-ish dark base
  tx.fillStyle = '#0c080a';
  tx.fillRect(0, 0, SZ, SZ);
  // Grit speckles
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const v = 6 + Math.random() * 14;
    tx.fillStyle = `rgba(${v + 8},${v},${v + 2},${0.4 + Math.random() * 0.4})`;
    tx.fillRect(x, y, 1, 1);
  }
  // Larger stone fragments
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 4 + Math.random() * 14;
    const v = 14 + Math.random() * 10;
    tx.fillStyle = `rgba(${v},${v - 2},${v},0.6)`;
    tx.beginPath(); tx.ellipse(x, y, r, r * 0.6, Math.random() * TAU, 0, TAU); tx.fill();
    tx.strokeStyle = 'rgba(0,0,0,0.55)';
    tx.lineWidth = 1; tx.stroke();
  }
  // Cracks
  tx.strokeStyle = 'rgba(0,0,0,0.7)';
  tx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    tx.beginPath();
    let x = Math.random() * SZ, y = Math.random() * SZ;
    tx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      tx.lineTo(x, y);
    }
    tx.stroke();
  }
  // Faint blood smears
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    tx.fillStyle = 'rgba(80,8,12,0.10)';
    tx.beginPath(); tx.ellipse(x, y, 30 + Math.random() * 30, 14, Math.random() * TAU, 0, TAU); tx.fill();
  }
  bgPattern = ctx.createPattern(tile, 'repeat');
}
buildBgPattern();

function drawWorldBg() {
  ctx.save();
  ctx.fillStyle = bgPattern;
  // Translate pattern into world space so it scrolls with the camera
  ctx.translate(W / 2 - cam.x, H / 2 - cam.y);
  ctx.fillRect(cam.x - W, cam.y - H, W * 2, H * 2);
  ctx.restore();
}

function drawVignette() {
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

let fogTime = 0;
function drawFog() {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    const t = fogTime * (0.04 + i * 0.025);
    const ox = Math.sin(t) * 80 + i * 70;
    const oy = Math.cos(t * 0.7) * 60 + i * 40;
    const grad = ctx.createRadialGradient(W * 0.5 + ox, H * 0.5 + oy, 50, W * 0.5 + ox, H * 0.5 + oy, Math.max(W, H) * 0.7);
    grad.addColorStop(0, 'rgba(40,30,38,0.05)');
    grad.addColorStop(0.5, 'rgba(30,20,28,0.025)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawGrain() {
  // Cheap film grain — sparse pixels
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#000';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

// ============================================================
// Particles, damage numbers, blood splats
// ============================================================
const particles = [];
function spawnParticle(p) { particles.push(p); }
function emitBlood(x, y, n = 6, dir = null, force = 1) {
  for (let i = 0; i < n; i++) {
    const a = dir != null ? dir + (Math.random() - 0.5) * 1.2 : Math.random() * TAU;
    const sp = (40 + Math.random() * 180) * force;
    particles.push({
      type: 'blood',
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.4, max: 0.9,
      size: 2 + Math.random() * 3,
      color: pick(['#8b0000', '#c41e3a', '#5a0608', '#a0121a']),
    });
  }
}
function emitSpark(x, y, n = 5, color = '#c9a961') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 60 + Math.random() * 120;
    particles.push({
      type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.25 + Math.random() * 0.3, max: 0.55, size: 1.5, color,
    });
  }
}
function emitSmoke(x, y, n = 4, color = 'rgba(60,40,50,0.5)') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 10 + Math.random() * 30;
    particles.push({
      type: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: 0.6 + Math.random() * 0.6, max: 1.2, size: 6 + Math.random() * 6, color,
    });
  }
}

const damageNumbers = [];
function spawnDamageNumber(x, y, n, crit = false) {
  damageNumbers.push({
    x, y: y - 8, vy: -36, life: 0.7, max: 0.7,
    text: '' + Math.round(n),
    crit,
  });
}

const splats = []; // permanent-ish blood marks on the ground
function spawnSplat(x, y, r = 18) {
  if (splats.length > 80) splats.shift();
  splats.push({ x, y, r, a: 0.55 + Math.random() * 0.25, rot: Math.random() * TAU });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'blood') { p.vy += 380 * dt; p.vx *= 0.96; }
    else if (p.type === 'spark') { p.vx *= 0.92; p.vy *= 0.92; }
    else if (p.type === 'smoke') { p.vx *= 0.98; p.vy *= 0.98; p.size += 14 * dt; }
  }
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.life -= dt;
    if (d.life <= 0) { damageNumbers.splice(i, 1); continue; }
    d.y += d.vy * dt;
    d.vy += 60 * dt;
  }
}

// ============================================================
// Pickups (echoes / xp gems, hearts, magnets)
// ============================================================
const pickups = [];
const PICKUP_TYPES = {
  echoSmall:  { color: '#7ec8ff', glow: '#8edcff', xp: 1,   size: 4, shape: 'diamond' },
  echoMed:    { color: '#3a8fe6', glow: '#5fb0ff', xp: 5,   size: 5, shape: 'diamond' },
  echoLarge:  { color: '#a560ff', glow: '#c98aff', xp: 25,  size: 7, shape: 'diamond' },
  echoCrest:  { color: '#3ce0c8', glow: '#a0f0e0', xp: 125, size: 10, shape: 'star' },
  heart:      { color: '#c41e3a', glow: '#ff4060', heal: 0.3, size: 6 },
  magnet:     { color: '#c9a961', glow: '#f5d98a', magnet: true, size: 6 },
  bomb:       { color: '#222', glow: '#ff6020', bomb: true, size: 7 },
};
function spawnPickup(type, x, y) {
  pickups.push({
    type, x, y,
    vx: rand(-40, 40), vy: rand(-40, 40),
    bornAt: game.time,
    bobSeed: Math.random() * TAU,
    attracted: false,
  });
}

// ============================================================
// Player & hunters
// ============================================================
const HUNTERS = {
  hunter:      { name: 'The Hunter',     hp: 100, speed: 150, weapon: 'sawCleaver',   bonus: { speed: 1.0, dmg: 1.0, area: 1.0 } },
  foreigner:   { name: 'The Foreigner',  hp: 80,  speed: 165, weapon: 'pistol',       bonus: { speed: 1.1, dmg: 1.1, area: 0.95 } },
  executioner: { name: 'The Executioner',hp: 130, speed: 138, weapon: 'threadedCane', bonus: { speed: 0.95, dmg: 1.0, area: 1.15 } },
};

// Distinct silhouettes per hunter — coat colour, hat shape, eye glow, and a
// signature accessory drawn on top.
const HUNTER_ART = {
  hunter: {
    coat: '#241410', trim: '#5a2818', skin: '#3a2418', eye: '#f5d98a',
    hat: 'tricorne', hatColor: '#1a0e0a', accent: 'scarf',
  },
  foreigner: {
    coat: '#1a1424', trim: '#3a3458', skin: '#5a4838', eye: '#80c0ff',
    hat: 'tophat', hatColor: '#0a0a14', accent: 'pistol',
  },
  executioner: {
    coat: '#2a1410', trim: '#5a1818', skin: '#241410', eye: '#ff5050',
    hat: 'hood', hatColor: '#1a0608', accent: 'greatsword',
  },
};

const player = {
  x: 0, y: 0, vx: 0, vy: 0,
  speed: 150,
  baseSpeed: 150,
  hp: 100, maxHp: 100,
  level: 1, xp: 0, xpNeed: 5,
  pickupRadius: 60,
  iframes: 0,
  faceDir: 0,           // last horizontal facing (-1,1)
  dmgMul: 1,
  cdMul: 1,
  areaMul: 1,
  projSpeedMul: 1,
  durationMul: 1,
  amountBonus: 0,
  regen: 0,
  weapons: [],          // [{ id, level }]
  passives: [],         // [{ id, level }]
  rerolls: 1,
  hpRegenAcc: 0,
  hitFlash: 0,
};

function resetPlayer(hunterId) {
  const h = HUNTERS[hunterId] || HUNTERS.hunter;
  player.x = 0; player.y = 0; player.vx = 0; player.vy = 0;
  player.baseSpeed = h.speed; player.speed = h.speed;
  player.maxHp = h.hp; player.hp = h.hp;
  player.level = 1; player.xp = 0; player.xpNeed = 5;
  player.pickupRadius = 60;
  player.iframes = 0; player.faceDir = 1;
  player.dmgMul = h.bonus.dmg;
  player.cdMul = 1;
  player.areaMul = h.bonus.area;
  player.projSpeedMul = 1;
  player.durationMul = 1;
  player.amountBonus = 0;
  player.regen = 0;
  player.weapons = [{ id: h.weapon, level: 1, cd: 0, state: {} }];
  player.passives = [];
  player.rerolls = 1;
  player.hpRegenAcc = 0;
  player.hitFlash = 0;
  // hunter-specific bonus speed
  player.speed = h.speed * h.bonus.speed;
}

function recomputeStats() {
  const h = HUNTERS[game.hunter] || HUNTERS.hunter;
  player.dmgMul = h.bonus.dmg * (player.metaDmgMul || 1);
  player.areaMul = h.bonus.area;
  player.cdMul = 1;
  player.projSpeedMul = 1;
  player.durationMul = 1;
  player.regen = 0;
  player.pickupRadius = 60 * (player.metaPickupMul || 1);
  let speedMul = h.bonus.speed * (player.metaSpeedMul || 1);
  let maxHpBonus = 0;
  const apply = (m) => {
    if (m.dmg)       player.dmgMul *= m.dmg;
    if (m.area)      player.areaMul *= m.area;
    if (m.cd)        player.cdMul *= m.cd;
    if (m.projSpeed) player.projSpeedMul *= m.projSpeed;
    if (m.duration)  player.durationMul *= m.duration;
    if (m.regen)     player.regen += m.regen;
    if (m.pickup)    player.pickupRadius *= m.pickup;
    if (m.speed)     speedMul *= m.speed;
    if (m.hp)        maxHpBonus += m.hp;
  };
  for (const p of player.passives) {
    PASSIVES[p.id].apply(p.level, apply);
  }
  player.speed = player.baseSpeed * speedMul;
  const newMax = HUNTERS[game.hunter].hp + (player.metaHpBonus || 0) + maxHpBonus;
  if (newMax > player.maxHp) {
    const heal = newMax - player.maxHp;
    player.maxHp = newMax;
    player.hp = Math.min(player.maxHp, player.hp + heal);
  } else {
    player.maxHp = newMax;
    if (player.hp > newMax) player.hp = newMax;
  }
}

// ============================================================
// Enemies
// ============================================================
const enemies = [];

const ENEMY_TYPES = {
  townsfolk: {
    name: 'Yharnamite', hp: 14, speed: 42, dmg: 9, r: 11, xp: 'echoSmall',
    color: '#3a2418', accent: '#5a3a28', rim: '#7a5238', halo: 'rgba(80,40,20,0.28)',
    eye: '#ff3850', shape: 'humanoid',
  },
  scourge: {
    name: 'Scourge Beast', hp: 38, speed: 78, dmg: 16, r: 13, xp: 'echoSmall',
    color: '#241a14', accent: '#3a2820', rim: '#5a4030', halo: 'rgba(60,30,15,0.3)',
    eye: '#ffb840', shape: 'beast',
  },
  crow: {
    name: 'Crow Hunter', hp: 55, speed: 60, dmg: 18, r: 12, xp: 'echoMed',
    color: '#1a1a2a', accent: '#5a5a6a', rim: '#7a7a8a', halo: 'rgba(40,40,70,0.3)',
    eye: '#d8e0f0', shape: 'crow', ranged: true, fireRate: 4.5, projSpeed: 170, projDmg: 8,
  },
  brickTroll: {
    name: 'Brick Troll', hp: 200, speed: 36, dmg: 26, r: 19, xp: 'echoMed',
    color: '#3a2a1a', accent: '#5a4030', rim: '#7a5a40', halo: 'rgba(80,55,30,0.35)',
    eye: '#ffaa30', shape: 'troll',
  },
  plagueRat: {
    name: 'Plague Rat', hp: 11, speed: 110, dmg: 6, r: 7, xp: 'echoSmall',
    color: '#1a1410', accent: '#3a2a20', rim: '#5a4830', halo: 'rgba(50,35,20,0.22)',
    eye: '#ff3838', shape: 'rat',
  },
  bloodlicker: {
    name: 'Bloodlicker', hp: 24, speed: 95, dmg: 26, r: 12, xp: 'echoSmall',
    color: '#5a0810', accent: '#8a1018', rim: '#b8202c', halo: 'rgba(140,20,30,0.4)',
    eye: '#ff4060', shape: 'lurker', explode: true, explodeR: 50,
  },
  cleric: {
    name: 'Cleric Beast', hp: 360, speed: 52, dmg: 32, r: 24, xp: 'echoLarge',
    color: '#3a1a14', accent: '#5a2818', rim: '#8a3820', halo: 'rgba(110,30,15,0.45)',
    eye: '#ff3030', shape: 'cleric', elite: true,
  },
  bloodletting: {
    name: 'Bloodletting Beast', hp: 6000, speed: 48, dmg: 36, r: 38, xp: 'echoLarge',
    color: '#3a0c10', accent: '#8a1018', rim: '#c82030', halo: 'rgba(160,15,25,0.55)',
    eye: '#ff2020', shape: 'boss', boss: true,
  },
  moonPresence: {
    name: 'Moon Presence', hp: 16000, speed: 56, dmg: 50, r: 44, xp: 'echoLarge',
    color: '#3a3045', accent: '#604858', rim: '#9080a0', halo: 'rgba(180,160,210,0.35)',
    eye: '#f0e0ff', shape: 'moon', boss: true,
  },
};

function spawnEnemy(typeId, x, y, mods = {}) {
  const def = ENEMY_TYPES[typeId];
  // Promotion to elite — rare. Promoting tougher units is even rarer.
  let promoted = false;
  if (!def.boss && !def.elite && !mods.elite && game.time > 90) {
    const baseChance = 0.0025;
    // Brick trolls and bloodlickers are already pressure units; rarely promote.
    const typeMul = (typeId === 'brickTroll' || typeId === 'bloodlicker') ? 0.4
                  : (typeId === 'crow') ? 0.7
                  : 1;
    if (Math.random() < baseChance * typeMul) promoted = true;
  }
  const eliteScale = promoted ? { hp: 5.0, dmg: 1.6, r: 1.3, sp: 1.08 } : { hp: 1, dmg: 1, r: 1, sp: 1 };
  // Early grace period — first 30s the rabble is fragile so the hunter can
  // settle in. After that, the time scaling kicks in on top of full base HP.
  const earlyMul = Math.min(1, 0.4 + game.time / 50);
  const timeBonus = Math.max(0, game.time - 20) * 0.6;
  const baseHp = (def.hp + timeBonus) * (mods.hpMul || 1) * eliteScale.hp * earlyMul;
  enemies.push({
    type: typeId, def,
    x, y, vx: 0, vy: 0,
    hp: baseHp,
    maxHp: baseHp,
    dmg: def.dmg * (mods.dmgMul || 1) * eliteScale.dmg,
    r: def.r * (mods.rMul || 1) * eliteScale.r,
    speed: def.speed * (mods.speedMul || 1) * rand(0.92, 1.08) * eliteScale.sp,
    flash: 0,
    hitCdById: {},
    fireCd: def.fireRate ? rand(0, def.fireRate) : 0,
    boss: !!def.boss,
    elite: !!def.elite || promoted,
    promoted,
    bornAt: game.time,
    knockX: 0, knockY: 0,
    aimNoise: rand(-0.2, 0.2),
    walkPhase: Math.random() * TAU,
  });
}

function spawnEnemyAroundPlayer(typeId, ringMin = 380, ringMax = 460) {
  const a = Math.random() * TAU;
  const r = rand(ringMin, ringMax);
  spawnEnemy(typeId, player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
}

// ============================================================
// Projectiles (player bullets, sweeps, AOE; enemy bullets)
// ============================================================
const projectiles = [];
const aoes = [];        // damage zones (molotov pools, sweeps, torch aura ticks)
const enemyShots = [];

let nextWeaponInstance = 1;

// ============================================================
// WEAPONS — definitions
// Each weapon entry has:
//   name, icon, desc, max, levels[ {desc, ...stats} ], onFire(player, w, def)
// w.id is set, w.level, w.cd (cooldown until next use), w.iid (instance id).
// ============================================================
const WEAPONS = {
  // Saw Cleaver — orbiting blades
  sawCleaver: {
    name: 'Saw Cleaver', icon: '⚔', tag: 'Trick',
    desc: 'A wicked blade, forever spinning at the hunter\'s side.',
    max: 8,
    levels: [
      { desc: 'Cleaves with a single blade.' },
      { desc: '+1 blade.' },
      { desc: '+10% damage, +5% area.' },
      { desc: '+1 blade.' },
      { desc: '+10% damage, +10% area.' },
      { desc: '+1 blade, faster spin.' },
      { desc: '+15% damage.' },
      { desc: '+1 blade. Severs all who draw near.' },
    ],
    update(dt, w) {
      const lv = w.level;
      const blades = 1 + Math.floor(lv / 2) + (lv >= 8 ? 1 : 0);
      const radius = (52 + lv * 3) * player.areaMul;
      const speed = 2.6 + lv * 0.12;
      const dmg = (8 + lv * 4) * player.dmgMul;
      w.state.angle = (w.state.angle || 0) + dt * speed;
      // Damage check
      for (let i = 0; i < blades; i++) {
        const a = w.state.angle + (i * TAU / blades);
        const bx = player.x + Math.cos(a) * radius;
        const by = player.y + Math.sin(a) * radius;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          const rr = (e.r + 12) * (e.r + 12);
          if (dist2(bx, by, e.x, e.y) < rr) {
            const key = w.iid + ':' + i;
            if ((e.hitCdById[key] || 0) <= 0) {
              hitEnemy(e, dmg, bx, by, 80);
              e.hitCdById[key] = 0.45;
            }
          }
        }
        // store positions for render
        w.state.pos = w.state.pos || [];
        w.state.pos[i] = { x: bx, y: by, r: 8 + lv * 0.7, a };
        w.state.bladeCount = blades;
      }
      // Decay per-enemy cooldowns
      for (const e of enemies) {
        for (const k in e.hitCdById) {
          if (k.startsWith(w.iid + ':')) e.hitCdById[k] = Math.max(0, e.hitCdById[k] - dt);
        }
      }
    },
    draw(w) {
      const blades = w.state.bladeCount || 1;
      const positions = w.state.pos || [];
      for (let i = 0; i < blades; i++) {
        const p = positions[i];
        if (!p) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a + Math.PI / 2);
        // blade
        ctx.fillStyle = '#d8d4c8';
        ctx.strokeStyle = '#1a1410';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -p.r);
        ctx.lineTo(p.r * 0.7, p.r * 0.7);
        ctx.lineTo(-p.r * 0.7, p.r * 0.7);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // blood smear
        ctx.fillStyle = 'rgba(139,0,0,0.6)';
        ctx.fillRect(-p.r * 0.4, -p.r * 0.5, p.r * 0.8, p.r * 0.3);
        ctx.restore();
      }
    },
  },

  // Hunter's Pistol — auto-fires at nearest enemy
  pistol: {
    name: 'Hunter\'s Pistol', icon: '⊹', tag: 'Firearm',
    desc: 'Quicksilver bullets through gnarled barrels.',
    max: 8,
    levels: [
      { desc: 'A single shot finds its mark.' },
      { desc: 'Faster reload.' },
      { desc: '+1 bullet per volley.' },
      { desc: '+15% damage. Faster bullets.' },
      { desc: '+1 bullet per volley.' },
      { desc: '+20% damage. Bullets pierce one target.' },
      { desc: '+1 bullet. Faster reload.' },
      { desc: 'Bullets pierce twice. Volley loosed in a wide spread.' },
    ],
    update(dt, w) {
      w.cd = (w.cd || 0) - dt;
      if (w.cd > 0) return;
      const lv = w.level;
      const target = nearestEnemy(player.x, player.y, 600);
      if (!target) { w.cd = 0.2; return; }
      const baseInt = 0.95 - lv * 0.07;
      w.cd = Math.max(0.2, baseInt) * player.cdMul;
      const dmg = (10 + lv * 5) * player.dmgMul;
      const speed = (380 + lv * 18) * player.projSpeedMul;
      const count = 1 + Math.floor((lv - 1) / 2) + player.amountBonus;
      const pierce = lv >= 8 ? 2 : (lv >= 6 ? 1 : 0);
      const spread = lv >= 8 ? 0.5 : 0.18;
      const baseAng = angleTo(player.x, player.y, target.x, target.y);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
        const a = baseAng + t * spread;
        projectiles.push({
          kind: 'bullet',
          x: player.x + Math.cos(a) * 12,
          y: player.y + Math.sin(a) * 12,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 1.4 * player.durationMul, dmg,
          pierce, hitSet: new Set(),
          r: 4, color: '#f5e6c0',
          trail: [], angle: a,
        });
      }
      sfx.shot();
      shakeScreen(1.2);
    },
  },

  // Threaded Cane — sweeping arc
  threadedCane: {
    name: 'Threaded Cane', icon: '⌒', tag: 'Trick',
    desc: 'A serpentine whip that lashes the night.',
    max: 8,
    levels: [
      { desc: 'A single sweeping lash.' },
      { desc: '+1 sweep alternates sides.' },
      { desc: '+15% area, +10% damage.' },
      { desc: '+1 sweep.' },
      { desc: '+20% area.' },
      { desc: '+1 sweep, +15% damage.' },
      { desc: 'Sweeps cover a wider arc.' },
      { desc: '+1 sweep. Strikes every weakness.' },
    ],
    update(dt, w) {
      w.cd = (w.cd || 0) - dt;
      if (w.cd > 0) return;
      const lv = w.level;
      const baseInt = (1.2 - lv * 0.04) * player.cdMul;
      w.cd = Math.max(0.45, baseInt);
      const sweeps = 1 + Math.floor(lv / 2);
      const dmg = (12 + lv * 6) * player.dmgMul;
      const reach = (95 + lv * 6) * player.areaMul;
      const arc = 1.4 + (lv >= 7 ? 0.4 : 0) + (lv * 0.05);
      const direction = (player.faceDir || 1);
      // queue sweeps over time
      w.state.queue = [];
      for (let i = 0; i < sweeps; i++) {
        const dir = (i % 2 === 0) ? direction : -direction;
        w.state.queue.push({ delay: i * 0.12, dir, t: 0, max: 0.22, arc, reach, dmg, hitSet: new Set() });
      }
    },
    perFrame(dt, w) {
      if (!w.state.queue) return;
      for (let i = w.state.queue.length - 1; i >= 0; i--) {
        const s = w.state.queue[i];
        if (s.delay > 0) { s.delay -= dt; continue; }
        if (s.t === 0) sfx.swing();
        s.t += dt;
        const u = s.t / s.max;
        const ang = (-s.arc / 2) + u * s.arc;
        const px = player.x + Math.cos(ang) * s.reach * s.dir;
        const py = player.y + Math.sin(ang) * s.reach;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          if (s.hitSet.has(e)) continue;
          const dx = (e.x - player.x) * s.dir;
          const dy = e.y - player.y;
          const d = Math.hypot(dx, dy);
          if (d < s.reach + e.r && dx > -10) {
            const ea = Math.atan2(dy, dx);
            if (Math.abs(ea - ang) < 0.6) {
              hitEnemy(e, s.dmg, e.x, e.y, 60);
              s.hitSet.add(e);
            }
          }
        }
        s.lastAng = ang; s.lastDir = s.dir; s.lastReach = s.reach;
        if (s.t >= s.max) w.state.queue.splice(i, 1);
      }
    },
    draw(w) {
      if (!w.state.queue) return;
      for (const s of w.state.queue) {
        if (s.delay > 0) continue;
        const u = s.t / s.max;
        ctx.save();
        ctx.translate(player.x, player.y);
        if (s.dir < 0) ctx.scale(-1, 1);
        const startA = -s.arc / 2;
        const endA = startA + s.arc * u;
        // bright outer arc
        ctx.beginPath();
        ctx.arc(0, 0, s.reach, startA, endA, false);
        ctx.strokeStyle = `rgba(245,230,192,${1 - u})`;
        ctx.lineWidth = 5 - u * 4;
        ctx.stroke();
        // blood-trail under-stroke
        ctx.strokeStyle = `rgba(196,30,58,${0.6 * (1 - u)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // leading-edge gleam
        const leadA = endA;
        const lx = Math.cos(leadA) * s.reach;
        const ly = Math.sin(leadA) * s.reach;
        ctx.fillStyle = `rgba(255,240,200,${0.8 * (1 - u)})`;
        ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
  },

  // Hunter's Torch — aura around the player
  torch: {
    name: 'Hunter\'s Torch', icon: '✦', tag: 'Tool',
    desc: 'Pale flame that wards the beasts that crowd the lane.',
    max: 8,
    levels: [
      { desc: 'A flickering aura sears the nearby.' },
      { desc: '+15% radius.' },
      { desc: '+15% damage.' },
      { desc: '+15% radius.' },
      { desc: '+20% damage. Slows the wretched.' },
      { desc: '+10% radius.' },
      { desc: '+25% damage.' },
      { desc: 'Flame roars eternal — pulses ignite.' },
    ],
    update(dt, w) {
      const lv = w.level;
      const baseR = (60 + lv * 8) * player.areaMul;
      const dmg = (4 + lv * 1.6) * player.dmgMul;
      const tickInt = 0.5 * player.cdMul;
      w.state.tick = (w.state.tick || 0) - dt;
      w.state.r = baseR;
      w.state.lv = lv;
      if (w.state.tick <= 0) {
        w.state.tick = tickInt;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          if (dist2(player.x, player.y, e.x, e.y) < baseR * baseR) {
            hitEnemy(e, dmg, e.x, e.y, 0);
            if (lv >= 5) { e.slowUntil = game.time + 1.0; }
          }
        }
        if (lv >= 8) {
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU;
            particles.push({ type: 'spark', x: player.x + Math.cos(a) * 10, y: player.y + Math.sin(a) * 10,
              vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.4, max: 0.4, size: 2, color: '#ffaa30' });
          }
        }
      }
      // Continuous rim embers (here, not in draw, so they pause cleanly).
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        particles.push({ type: 'spark',
          x: player.x + Math.cos(a) * baseR,
          y: player.y + Math.sin(a) * baseR,
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20,
          life: 0.4, max: 0.4, size: 1.5, color: '#ffaa50' });
      }
    },
    draw(w) {
      if (!w.state.r) return;
      const r = w.state.r;
      const pulse = 1 + Math.sin(game.time * 4) * 0.04;
      const rr = r * pulse;
      // inner warm glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, rr);
      grad.addColorStop(0, 'rgba(255,180,90,0.32)');
      grad.addColorStop(0.6, 'rgba(196,30,58,0.14)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(player.x, player.y, rr, 0, TAU); ctx.fill();
      ctx.restore();
      // bright inner ring
      ctx.strokeStyle = `rgba(255,200,120,${0.45 + Math.sin(game.time * 3) * 0.12})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, rr, 0, TAU); ctx.stroke();
      // dashed sigil ring drifting around the boundary
      ctx.save();
      ctx.strokeStyle = 'rgba(245,220,160,0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -game.time * 28;
      ctx.beginPath(); ctx.arc(player.x, player.y, rr - 3, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },
  },

  // Cainhurst Bulwark — periodic damage-mitigating shield, deflects bullets
  bulwark: {
    name: 'Cainhurst Bulwark', icon: '◯', tag: 'Trick',
    desc: 'Forbidden glass that turns aside the unworthy.',
    max: 8,
    levels: [
      { desc: 'A shimmer briefly grants full immunity from harm.' },
      { desc: 'Shield rises more often.' },
      { desc: 'Shield lasts longer.' },
      { desc: 'Bullets shatter and fly back at the unworthy.' },
      { desc: 'Shield rises more often.' },
      { desc: 'Shield lasts longer.' },
      { desc: 'Shield rises more often.' },
      { desc: 'A near-permanent ward — barely a moment of respite.' },
    ],
    update(dt, w) {
      const lv = w.level;
      const cdMax = Math.max(4.0, (9.5 - lv * 0.4)) * player.cdMul;
      const durMax = (1.8 + lv * 0.3) * player.durationMul;
      w.state.lv = lv;
      w.state.deflect = lv >= 4;
      if (w.state.cd === undefined) {
        w.state.cd = cdMax;
        w.state.dur = 0;
      }
      if (w.state.dur > 0) {
        w.state.dur -= dt;
        if (w.state.dur <= 0) {
          w.state.dur = 0;
          w.state.cd = cdMax;
        }
      } else {
        w.state.cd -= dt;
        if (w.state.cd <= 0) {
          w.state.dur = durMax;
          sfx.pickup();
        }
      }
      w.state.active = w.state.dur > 0;
    },
    draw(w) {
      if (!w.state.active) return;
      const r = 24;
      const ang = game.time * 1.4;
      ctx.save();
      ctx.translate(player.x, player.y);
      // bright outer ring
      ctx.strokeStyle = 'rgba(245,220,160,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      // rotating runes
      for (let i = 0; i < 6; i++) {
        const a = ang + i / 6 * TAU;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = 'rgba(255,235,180,0.95)';
        ctx.fillRect(-2, -3, 4, 6);
        ctx.restore();
      }
      ctx.restore();
    },
  },

  // Molotov — lobs to nearest enemy, leaves fire pool
  molotov: {
    name: 'Molotov', icon: '⚱', tag: 'Tool',
    desc: 'Quicksilver oil, ignited mid-flight.',
    max: 8,
    levels: [
      { desc: 'A jar of fire lobbed at the nearest beast.' },
      { desc: 'Faster throws.' },
      { desc: '+15% pool size, +15% damage.' },
      { desc: 'Pools linger longer.' },
      { desc: '+1 throw per volley.' },
      { desc: '+25% damage.' },
      { desc: '+1 throw per volley.' },
      { desc: 'Flames cling — pools last twice as long.' },
    ],
    update(dt, w) {
      w.cd = (w.cd || 0) - dt;
      if (w.cd > 0) return;
      const lv = w.level;
      w.cd = Math.max(0.8, (2.4 - lv * 0.12) * player.cdMul);
      const count = 1 + Math.floor((lv - 1) / 4);
      const targets = nearestEnemies(player.x, player.y, 380, count);
      if (targets.length === 0) { w.cd = 0.4; return; }
      const dmg = (10 + lv * 3) * player.dmgMul;
      const dur = (3.0 + (lv >= 8 ? 3 : 0)) * player.durationMul;
      const radius = (50 + lv * 5) * player.areaMul;
      for (const t of targets) {
        projectiles.push({
          kind: 'molotov',
          x: player.x, y: player.y,
          tx: t.x, ty: t.y,
          travel: 0, max: 0.55, dmg, dur, radius,
          h: 0,
        });
      }
    },
  },
};

// helpers used by weapons
function nearestEnemy(x, y, max = 600) {
  let best = null, bd = max * max;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestEnemies(x, y, max, n) {
  const arr = enemies.filter(e => e.hp > 0).map(e => ({ e, d: dist2(x, y, e.x, e.y) }))
    .filter(o => o.d < max * max);
  arr.sort((a, b) => a.d - b.d);
  return arr.slice(0, n).map(o => o.e);
}

// ============================================================
// PASSIVES
// ============================================================
const PASSIVES = {
  beasthood:    { name: 'Beasthood',          icon: '☩', desc: 'The beast within sharpens every blow.',
    levelDesc: lv => `+${lv * 10}% damage.`, max: 5,
    apply: (lv, mods) => mods({ dmg: 1 + lv * 0.1 }) },
  oedonWrithe:  { name: 'Oedon Writhe',       icon: '⊙', desc: 'Time bends — strikes come faster.',
    levelDesc: lv => `-${lv * 8}% cooldown.`, max: 5,
    apply: (lv, mods) => mods({ cd: Math.max(0.3, 1 - lv * 0.08) }) },
  caryll:       { name: 'Caryll Cursed',      icon: '✥', desc: 'Echoes are drawn to a marked hunter.',
    levelDesc: lv => `+${lv * 30}% pickup radius.`, max: 5,
    apply: (lv, mods) => mods({ pickup: 1 + lv * 0.3 }) },
  communion:    { name: 'Communion',          icon: '✚', desc: 'A sturdy vessel for the night\'s long toil.',
    levelDesc: lv => `+${lv * 25} max HP.`, max: 5,
    apply: (lv, mods) => mods({ hp: lv * 25 }) },
  bloodVial:    { name: 'Iosefka\'s Vial',    icon: '✶', desc: 'Slow regeneration of stolen blood.',
    levelDesc: lv => `+${lv * 0.5} HP/sec.`, max: 5,
    apply: (lv, mods) => mods({ regen: lv * 0.5 }) },
  oldHunter:    { name: 'Old Hunter\'s Bone', icon: '⚘', desc: 'Quickstep learned from the masters.',
    levelDesc: lv => `+${lv * 8}% move speed.`, max: 5,
    apply: (lv, mods) => mods({ speed: 1 + lv * 0.08 }) },
  tearStone:    { name: 'Tear Stone',         icon: '◇', desc: 'Wider sweeps, vaster auras.',
    levelDesc: lv => `+${lv * 12}% area.`, max: 5,
    apply: (lv, mods) => mods({ area: 1 + lv * 0.12 }) },
  marrowAsh:    { name: 'Bone Marrow Ash',    icon: '◈', desc: 'Bullets fly truer, swifter.',
    levelDesc: lv => `+${lv * 15}% projectile speed.`, max: 5,
    apply: (lv, mods) => mods({ projSpeed: 1 + lv * 0.15 }) },
};

// ============================================================
// Meta-progression — persistent perks bought with echoes between runs
// ============================================================
const SAVE_KEY = 'yharnam_save_v1';

const META_DEFS = {
  might:     { name: 'Might',     icon: '☩', max: 5, baseCost: 50,  desc: '+10% damage per level' },
  vitality:  { name: 'Vitality',  icon: '✚', max: 5, baseCost: 60,  desc: '+15 max HP per level' },
  swiftness: { name: 'Swiftness', icon: '⚘', max: 5, baseCost: 50,  desc: '+5% move speed per level' },
  avarice:   { name: 'Avarice',   icon: '✥', max: 5, baseCost: 60,  desc: '+12% pickup radius per level' },
  insight:   { name: 'Insight',   icon: '✦', max: 3, baseCost: 100, desc: '+1 reroll per run per level' },
  thrift:    { name: 'Thrift',    icon: '◇', max: 3, baseCost: 80,  desc: '+15% echoes earned per level' },
};

const meta = {
  totalEchoes: 0,
  perks: { might: 0, vitality: 0, swiftness: 0, avarice: 0, insight: 0, thrift: 0 },
};

function perkCost(id) {
  const lv = meta.perks[id];
  return Math.floor(META_DEFS[id].baseCost * Math.pow(1.6, lv));
}

function loadMeta() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return;
    const data = JSON.parse(s);
    if (typeof data.totalEchoes === 'number') meta.totalEchoes = data.totalEchoes;
    if (data.perks) {
      for (const k in meta.perks) {
        if (typeof data.perks[k] === 'number') meta.perks[k] = data.perks[k];
      }
    }
  } catch (e) { /* ignore */ }
}

function saveMeta() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      totalEchoes: meta.totalEchoes, perks: meta.perks,
    }));
  } catch (e) { /* ignore */ }
}

function awardEchoes() {
  const earned = Math.floor(game.echoes * (1 + meta.perks.thrift * 0.15));
  meta.totalEchoes += earned;
  saveMeta();
}

function buyPerk(id) {
  const def = META_DEFS[id];
  if (meta.perks[id] >= def.max) return;
  const cost = perkCost(id);
  if (meta.totalEchoes < cost) return;
  meta.totalEchoes -= cost;
  meta.perks[id]++;
  saveMeta();
  renderDreamPanel();
  sfx.pickupBig();
}

function applyMetaPerks() {
  player.metaDmgMul = 1 + meta.perks.might * 0.10;
  player.metaHpBonus = meta.perks.vitality * 15;
  player.metaSpeedMul = 1 + meta.perks.swiftness * 0.05;
  player.metaPickupMul = 1 + meta.perks.avarice * 0.12;
  player.rerolls = 1 + meta.perks.insight;
  player.maxHp += player.metaHpBonus;
  player.hp = player.maxHp;
}

// ============================================================
// Lantern of Insight — periodic waypoint reward
// ============================================================
const lanterns = [];
const LANTERN_LIFETIME = 75;

function spawnLantern() {
  const a = Math.random() * TAU;
  const r = rand(560, 920);
  lanterns.push({
    x: player.x + Math.cos(a) * r,
    y: player.y + Math.sin(a) * r,
    bornAt: game.time,
    expires: game.time + LANTERN_LIFETIME,
    pulse: 0,
  });
  sfx.pickup();
}

function updateLanterns(dt) {
  game.lanternCd -= dt;
  if (game.lanternCd <= 0 && lanterns.length === 0) {
    game.lanternCd = 55;
    spawnLantern();
  }
  for (let i = lanterns.length - 1; i >= 0; i--) {
    const l = lanterns[i];
    l.pulse += dt;
    if (game.time > l.expires) { lanterns.splice(i, 1); continue; }
    if (dist2(l.x, l.y, player.x, player.y) < 30 * 30) {
      grantLanternReward(l);
      lanterns.splice(i, 1);
    }
  }
}

function grantLanternReward(l) {
  for (let i = 0; i < 6; i++) {
    spawnPickup('echoLarge', l.x + rand(-25, 25), l.y + rand(-25, 25));
  }
  for (const p of pickups) {
    const def = PICKUP_TYPES[p.type];
    if (def.xp) p.attracted = true;
  }
  player.hp = Math.min(player.maxHp, player.hp + 25);
  shakeScreen(7);
  emitSpark(l.x, l.y, 50, '#f5d98a');
  sfx.levelup();
}

// ============================================================
// Breakable pots — scattered around the map, drop smart loot
// ============================================================
const pots = [];

function spawnPotsInitial() {
  // Seed a starting cluster so the first walk feels rewarded.
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * TAU;
    const r = rand(180, 460);
    pots.push({
      x: player.x + Math.cos(a) * r,
      y: player.y + Math.sin(a) * r,
      type: pick(['urn', 'urn', 'crate']),
      bornAt: 0,
    });
  }
}

function updatePots(dt) {
  game.potCd -= dt;
  if (game.potCd <= 0) {
    game.potCd = rand(6, 12);
    if (pots.length < 24) {
      const a = Math.random() * TAU;
      const r = rand(280, 580);
      pots.push({
        x: player.x + Math.cos(a) * r,
        y: player.y + Math.sin(a) * r,
        type: pick(['urn', 'urn', 'crate']),
        bornAt: game.time,
      });
    }
  }
  for (let i = pots.length - 1; i >= 0; i--) {
    const p = pots[i];
    if (dist2(p.x, p.y, player.x, player.y) < 17 * 17) {
      breakPot(p);
      pots.splice(i, 1);
    } else if (dist2(p.x, p.y, player.x, player.y) > 1300 * 1300) {
      pots.splice(i, 1);
    }
  }
}

function breakPot(p) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * TAU;
    const sp = 60 + Math.random() * 120;
    particles.push({
      type: 'spark', x: p.x, y: p.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.55, max: 0.55, size: 2,
      color: p.type === 'lantern' ? '#a07a48' : (p.type === 'crate' ? '#7a5a40' : '#5a4030'),
    });
  }
  emitSmoke(p.x, p.y, 4, 'rgba(50,40,30,0.5)');
  shakeScreen(2);
  sfx.hit();
  // Most pots are empty. The few that hold something favour what the
  // hunter actually needs right now — never echoes (those come from kills).
  const drop = chooseSmartLoot();
  if (drop) spawnPickup(drop, p.x, p.y);
}

function chooseSmartLoot() {
  const hpRatio = player.hp / player.maxHp;
  let nearbyEnemies = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (dist2(e.x, e.y, player.x, player.y) < 280 * 280) nearbyEnemies++;
  }
  let xpGems = 0;
  for (const pk of pickups) if (PICKUP_TYPES[pk.type].xp) xpGems++;

  // 'null' = empty pot. The base weight is high so most breaks return nothing.
  const pool = [{ type: null, weight: 8 }];
  if (hpRatio < 0.35)       pool.push({ type: 'heart',  weight: 6 });
  else if (hpRatio < 0.65)  pool.push({ type: 'heart',  weight: 1.5 });
  else                      pool.push({ type: 'heart',  weight: 0.4 });
  if (nearbyEnemies > 14)   pool.push({ type: 'bomb',   weight: 4 });
  else                      pool.push({ type: 'bomb',   weight: 0.3 });
  if (xpGems > 25)          pool.push({ type: 'magnet', weight: 3 });
  else                      pool.push({ type: 'magnet', weight: 0.4 });

  let total = 0;
  for (const e of pool) total += e.weight;
  let r = Math.random() * total;
  for (const e of pool) {
    if (r < e.weight) return e.type;
    r -= e.weight;
  }
  return null;
}

// ============================================================
// Reward chests — dropped by elites (silver) and bosses (gold)
// ============================================================
const chests = [];

function spawnChest(x, y, tier) {
  chests.push({ x, y, tier, bornAt: game.time, pulse: 0 });
}

function updateChests(dt) {
  for (let i = chests.length - 1; i >= 0; i--) {
    const c = chests[i];
    c.pulse += dt;
    if (dist2(c.x, c.y, player.x, player.y) < 24 * 24) {
      openChest(c);
      chests.splice(i, 1);
    }
  }
}

function openChest(c) {
  emitSpark(c.x, c.y, 30, c.tier === 'gold' ? '#f5d98a' : '#d8d8e0');
  emitSmoke(c.x, c.y, 6);
  shakeScreen(c.tier === 'gold' ? 8 : 4);
  sfx.levelup();
  if (c.tier === 'gold') {
    upgradeQueue.push(true);
    upgradeQueue.push(true);
    for (let i = 0; i < 5; i++) spawnPickup('echoLarge', c.x + rand(-30, 30), c.y + rand(-30, 30));
    spawnPickup('heart', c.x, c.y);
    spawnPickup('magnet', c.x + 18, c.y + 6);
    player.rerolls += 1;
  } else {
    upgradeQueue.push(true);
    for (let i = 0; i < 3; i++) spawnPickup('echoMed', c.x + rand(-20, 20), c.y + rand(-20, 20));
    if (Math.random() < 0.4) spawnPickup('heart', c.x, c.y);
  }
  if (!levelUpOpen) showLevelUp();
}

// ============================================================
// Game state
// ============================================================
const game = {
  running: false,
  paused: false,
  time: 0,
  realTime: 0,
  kills: 0,
  echoes: 0,
  hunter: 'hunter',
  spawnAcc: 0,
  bossSpawned: { 1: false, 2: false },
  victoryAt: 15 * 60, // 15 minutes
  lanternCd: 35,
  gemMergeCd: 0,
  eliteCd: 60,
  potCd: 0,
};

// ============================================================
// Combat helpers
// ============================================================
function hitEnemy(e, dmg, fromX, fromY, knock = 60) {
  const crit = Math.random() < 0.08;
  const final = dmg * (crit ? 1.7 : 1);
  e.hp -= final;
  e.flash = 0.12;
  spawnDamageNumber(e.x, e.y - e.r, final, crit);
  if (knock > 0) {
    const a = angleTo(fromX, fromY, e.x, e.y);
    e.knockX += Math.cos(a) * knock;
    e.knockY += Math.sin(a) * knock;
  }
  emitBlood(e.x, e.y, 4 + (crit ? 4 : 0), angleTo(fromX, fromY, e.x, e.y), crit ? 1.4 : 1);
  if (e.hp <= 0) killEnemy(e);
  else if (crit) sfx.hitBig(); else sfx.hit();
}

function killEnemy(e) {
  e.hp = 0;
  game.kills++;
  spawnSplat(e.x, e.y, 10 + e.r * 0.6);
  emitBlood(e.x, e.y, 12, null, 1.5);
  if (e.def.xp) {
    let xpType = e.def.xp;
    if (xpType === 'echoSmall' && Math.random() < 0.04) xpType = 'echoMed';
    if (xpType === 'echoMed'   && Math.random() < 0.05) xpType = 'echoLarge';
    spawnPickup(xpType, e.x, e.y);
  }
  const r = Math.random();
  if (e.boss) {
    // Bosses drop a gold reward chest plus echoes — biggest payout in the run.
    spawnChest(e.x, e.y, 'gold');
    spawnPickup('echoLarge', e.x + 24, e.y);
    spawnPickup('echoLarge', e.x - 24, e.y);
    shakeScreen(14);
    sfx.hitBig();
    sfx.victory();
  } else if (e.elite) {
    // Elites (cleric beasts and promoted regulars) drop a silver chest.
    spawnChest(e.x, e.y, 'silver');
    spawnPickup('echoMed', e.x, e.y);
    if (e.promoted) shakeScreen(5);
  } else {
    if (r < 0.004)       spawnPickup('heart',  e.x, e.y);
    else if (r < 0.0065) spawnPickup('magnet', e.x, e.y);
    else if (r < 0.008)  spawnPickup('bomb',   e.x, e.y);
  }
}

function shieldState() {
  const w = player.weapons.find(w => w.id === 'bulwark');
  return (w && w.state.active) ? w.state : null;
}

function damagePlayer(amount) {
  if (player.iframes > 0) return;
  if (shieldState()) {
    // Bulwark grants full immunity while raised. Brief iframes so a single
    // crowd hit doesn't spam shield pings.
    player.iframes = 0.25;
    emitSpark(player.x, player.y, 6, '#f5e6c0');
    sfx.swing();
    return;
  }
  player.hp -= amount;
  player.hitFlash = 0.3;
  player.iframes = 0.6;
  shakeScreen(6);
  emitBlood(player.x, player.y, 8);
  sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    onPlayerDeath();
  }
}

// ============================================================
// Spawning system
// ============================================================
function spawnDirector(dt) {
  const t = game.time;
  // ~50% slower spawn ramp than before — fewer but tougher enemies overall.
  let rate = 0.6 + Math.min(t / 18, 7);
  rate *= 1 + Math.min(t / 300, 0.6);
  game.spawnAcc += rate * dt;
  while (game.spawnAcc >= 1) {
    game.spawnAcc -= 1;
    spawnByTime(t);
  }
  if (!game.bossSpawned[1] && t >= 7 * 60) {
    game.bossSpawned[1] = true;
    spawnEnemyAroundPlayer('bloodletting', 320, 360);
    sfx.boss();
    shakeScreen(16);
  }
  if (!game.bossSpawned[2] && t >= 13 * 60) {
    game.bossSpawned[2] = true;
    spawnEnemyAroundPlayer('moonPresence', 320, 360);
    sfx.boss();
    shakeScreen(20);
  }
  if (t > 3 * 60) {
    game.eliteCd -= dt;
    if (game.eliteCd <= 0) {
      game.eliteCd = Math.max(60, 100 - (t - 180) / 25);
      spawnEnemyAroundPlayer('cleric', 380, 460);
    }
  }
  if (t >= game.victoryAt && game.running) {
    onVictory();
  }
}

// Weighted spawn tables — common rabble dominates, dangerous units stay rare.
const SPAWN_TABLES = [
  [60,        [['townsfolk', 1]]],
  [150,       [['townsfolk', 6], ['scourge', 1], ['rats', 0.5]]],
  [240,       [['townsfolk', 5], ['scourge', 2], ['rats', 0.7], ['crow', 0.6]]],
  [360,       [['townsfolk', 4], ['scourge', 3], ['rats', 0.8], ['crow', 1], ['bloodlicker', 0.4], ['brickTroll', 0.2]]],
  [480,       [['townsfolk', 3], ['scourge', 3], ['rats', 0.8], ['crow', 1.4], ['bloodlicker', 0.7], ['brickTroll', 0.3]]],
  [600,       [['townsfolk', 2], ['scourge', 3], ['rats', 0.6], ['crow', 1.6], ['bloodlicker', 1.0], ['brickTroll', 0.5]]],
  [Infinity,  [['townsfolk', 1.5], ['scourge', 3], ['rats', 0.5], ['crow', 1.6], ['bloodlicker', 1.4], ['brickTroll', 0.7]]],
];

function weightedPick(table) {
  let total = 0;
  for (const e of table) total += e[1];
  let r = Math.random() * total;
  for (const e of table) {
    if (r < e[1]) return e[0];
    r -= e[1];
  }
  return table[table.length - 1][0];
}

function spawnByTime(t) {
  let table;
  for (const e of SPAWN_TABLES) {
    if (t < e[0]) { table = e[1]; break; }
  }
  const id = weightedPick(table);
  if (id === 'rats') {
    // Rat swarm — smaller groups than before so they don't overwhelm the table.
    const a = Math.random() * TAU;
    const r = Math.max(W, H) * 0.62 + rand(40, 100);
    const cx = player.x + Math.cos(a) * r;
    const cy = player.y + Math.sin(a) * r;
    const n = randi(3, 6);
    for (let i = 0; i < n; i++) {
      spawnEnemy('plagueRat', cx + rand(-30, 30), cy + rand(-30, 30));
    }
    return;
  }
  const a = Math.random() * TAU;
  const r = Math.max(W, H) * 0.62 + rand(20, 80);
  spawnEnemy(id, player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
}

// ============================================================
// Update
// ============================================================
function update(dt) {
  readKeyboard();
  updatePlayer(dt);
  updateWeapons(dt);
  updateProjectiles(dt);
  updateEnemyShots(dt);
  updateAoes(dt);
  updateEnemies(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateLanterns(dt);
  updatePots(dt);
  updateChests(dt);
  mergeGems(dt);
  spawnDirector(dt);
  cam.x = lerp(cam.x, player.x, 0.18);
  cam.y = lerp(cam.y, player.y, 0.18);
}

function mergeGems(dt) {
  game.gemMergeCd -= dt;
  if (game.gemMergeCd > 0) return;
  game.gemMergeCd = 0.6;
  if (pickups.length < 60) return;

  function tryMerge(type, upType) {
    const candidates = [];
    for (const p of pickups) if (p.type === type && !p.attracted) candidates.push(p);
    if (candidates.length < 5) return;
    const used = new Set();
    const merges = [];
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];
      if (used.has(a)) continue;
      const cluster = [a];
      for (let j = i + 1; j < candidates.length && cluster.length < 5; j++) {
        const b = candidates[j];
        if (used.has(b)) continue;
        if (dist2(a.x, a.y, b.x, b.y) < 90 * 90) cluster.push(b);
      }
      if (cluster.length === 5) {
        for (const c of cluster) used.add(c);
        merges.push(cluster);
      }
    }
    if (merges.length === 0) return;
    // Drop merged pickups in a single pass
    for (let k = pickups.length - 1; k >= 0; k--) {
      if (used.has(pickups[k])) pickups.splice(k, 1);
    }
    for (const cluster of merges) {
      let cx = 0, cy = 0;
      for (const c of cluster) { cx += c.x; cy += c.y; }
      cx /= cluster.length; cy /= cluster.length;
      spawnPickup(upType, cx, cy);
      emitSpark(cx, cy, 6, PICKUP_TYPES[upType].glow);
    }
  }

  tryMerge('echoSmall', 'echoMed');
  tryMerge('echoMed', 'echoLarge');
  tryMerge('echoLarge', 'echoCrest');
}

function updatePlayer(dt) {
  let ax = input.ax, ay = input.ay;
  // smooth velocity
  const targetVx = ax * player.speed;
  const targetVy = ay * player.speed;
  player.vx = lerp(player.vx, targetVx, 0.25);
  player.vy = lerp(player.vy, targetVy, 0.25);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (Math.abs(player.vx) > 8) player.faceDir = player.vx > 0 ? 1 : -1;
  player.iframes = Math.max(0, player.iframes - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  if (player.regen > 0 && player.hp < player.maxHp) {
    player.hpRegenAcc += player.regen * dt;
    if (player.hpRegenAcc >= 1) {
      const h = Math.floor(player.hpRegenAcc);
      player.hpRegenAcc -= h;
      player.hp = Math.min(player.maxHp, player.hp + h);
    }
  }
}

function updateWeapons(dt) {
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (!w.iid) w.iid = nextWeaponInstance++;
    if (def.update) def.update(dt, w);
    if (def.perFrame) def.perFrame(dt, w);
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind === 'bullet') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      p.trail.push({ x: p.x, y: p.y, a: 1 });
      if (p.trail.length > 6) p.trail.shift();
      // collision
      for (const e of enemies) {
        if (e.hp <= 0 || p.hitSet.has(e)) continue;
        const rr = (e.r + p.r) * (e.r + p.r);
        if (dist2(p.x, p.y, e.x, e.y) < rr) {
          hitEnemy(e, p.dmg, p.x, p.y, 100);
          p.hitSet.add(e);
          if (p.pierce > 0) p.pierce--;
          else { p.life = 0; break; }
        }
      }
      if (p.life <= 0) projectiles.splice(i, 1);
    } else if (p.kind === 'molotov') {
      p.travel += dt;
      const u = clamp(p.travel / p.max, 0, 1);
      p.x = lerp(p.x0 || (p.x0 = p.x), p.tx, u);
      p.y = lerp(p.y0 || (p.y0 = p.y), p.ty, u);
      p.h = Math.sin(u * Math.PI) * 50;
      if (u >= 1) {
        // create fire pool
        aoes.push({
          kind: 'fire', x: p.tx, y: p.ty, r: p.radius,
          life: p.dur, max: p.dur, dps: p.dmg, tick: 0,
        });
        emitSpark(p.tx, p.ty, 16, '#ff6020');
        emitSmoke(p.tx, p.ty, 6, 'rgba(60,30,28,0.55)');
        sfx.hitBig();
        shakeScreen(2);
        projectiles.splice(i, 1);
      }
    }
  }
}

function updateAoes(dt) {
  for (let i = aoes.length - 1; i >= 0; i--) {
    const a = aoes[i];
    a.life -= dt;
    if (a.life <= 0) { aoes.splice(i, 1); continue; }
    a.tick -= dt;
    if (a.tick <= 0) {
      a.tick = 0.5 * player.cdMul;
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (dist2(a.x, a.y, e.x, e.y) < a.r * a.r) {
          hitEnemy(e, a.dps, a.x, a.y, 0);
        }
      }
    }
    // flicker particles (must run in update so they pause cleanly)
    if (a.kind === 'fire' && Math.random() < 0.6) {
      const ang = Math.random() * TAU;
      const r = Math.random() * a.r;
      particles.push({ type: 'spark',
        x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r,
        vx: rand(-10, 10), vy: rand(-50, -20),
        life: 0.3, max: 0.3, size: 1.5, color: '#ff8030' });
    }
  }
}

function updateEnemyShots(dt) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.life -= dt;
    // Shield catches bullets at a wider radius than the player body.
    const shield = shieldState();
    const catchR = shield ? 26 : (10 + s.r);
    if (dist2(s.x, s.y, player.x, player.y) < catchR * catchR) {
      if (shield) {
        emitSpark(s.x, s.y, 8, '#f5e6c0');
        sfx.swing();
        if (shield.deflect) {
          // turn the bullet into a player projectile aimed back at the nearest enemy
          const tgt = nearestEnemy(s.x, s.y, 500);
          if (tgt) {
            const a = angleTo(s.x, s.y, tgt.x, tgt.y);
            const sp = 360;
            projectiles.push({
              kind: 'bullet',
              x: s.x, y: s.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1.4, dmg: s.dmg * 2.5,
              pierce: 0, hitSet: new Set(),
              r: 4, color: '#f5e6c0',
              trail: [], angle: a,
            });
          }
        }
      } else {
        damagePlayer(s.dmg);
      }
      enemyShots.splice(i, 1);
      continue;
    }
    if (s.life <= 0) enemyShots.splice(i, 1);
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp <= 0) { enemies.splice(i, 1); continue; }
    e.flash = Math.max(0, e.flash - dt);
    // movement towards player
    let speed = e.speed;
    if (e.slowUntil && game.time < e.slowUntil) speed *= 0.55;
    const a = angleTo(e.x, e.y, player.x, player.y);
    let vx = Math.cos(a) * speed;
    let vy = Math.sin(a) * speed;
    // bloodlicker charges
    if (e.def.explode) {
      if (dist2(e.x, e.y, player.x, player.y) < 36 * 36) {
        // explode
        damagePlayer(e.dmg);
        emitBlood(e.x, e.y, 18, null, 2);
        emitSpark(e.x, e.y, 10, '#ff4060');
        shakeScreen(5);
        sfx.hitBig();
        e.hp = 0;
        continue;
      }
      vx *= 1.05; vy *= 1.05;
    }
    // ranged crows kite
    if (e.def.ranged) {
      const dd = dist2(e.x, e.y, player.x, player.y);
      const ideal = 240;
      if (dd < ideal * ideal) { vx = -vx * 0.6; vy = -vy * 0.6; }
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = e.def.fireRate;
        const aa = a + e.aimNoise;
        const sp = e.def.projSpeed;
        enemyShots.push({
          x: e.x, y: e.y,
          vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
          life: 2.4, dmg: e.def.projDmg, r: 4,
        });
        sfx.shot();
      }
    }
    // separation: tiny push to avoid total stacking
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const o = enemies[j];
      const dx = e.x - o.x, dy = e.y - o.y;
      const d2 = dx * dx + dy * dy;
      const minR = e.r + o.r;
      if (d2 < minR * minR && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = (minR - d) / minR * 60;
        vx += (dx / d) * f;
        vy += (dy / d) * f;
      }
    }
    // persist velocity so renderers can read it for animation
    e.vx = vx; e.vy = vy;
    // knockback
    e.x += (vx + e.knockX) * dt;
    e.y += (vy + e.knockY) * dt;
    e.knockX *= Math.pow(0.001, dt);
    e.knockY *= Math.pow(0.001, dt);
    // contact damage to player
    const minR = e.r + 11;
    if (dist2(e.x, e.y, player.x, player.y) < minR * minR) {
      damagePlayer(e.dmg);
    }
    // despawn far away non-bosses
    if (!e.boss && dist2(e.x, e.y, player.x, player.y) > 1200 * 1200) {
      enemies.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  const pr2 = player.pickupRadius * player.pickupRadius;
  const grab2 = 18 * 18;
  // Top-down view: no gravity. Heavy uniform friction so pickups pop and settle.
  const fric = Math.pow(0.0008, dt);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= fric;
    p.vy *= fric;
    if (!p.attracted && Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1) {
      p.vx = 0; p.vy = 0;
    }
    const d2 = dist2(p.x, p.y, player.x, player.y);
    if (p.attracted || d2 < pr2) {
      p.attracted = true;
      const a = angleTo(p.x, p.y, player.x, player.y);
      const sp = 420;
      p.vx = lerp(p.vx, Math.cos(a) * sp, 0.35);
      p.vy = lerp(p.vy, Math.sin(a) * sp, 0.35);
    }
    if (d2 < grab2) {
      collectPickup(p);
      pickups.splice(i, 1);
    }
  }
}

function collectPickup(p) {
  const def = PICKUP_TYPES[p.type];
  if (def.xp) {
    grantXp(def.xp);
    if (p.type === 'echoLarge') sfx.pickupBig(); else sfx.pickup();
    game.echoes += def.xp;
  } else if (def.heal) {
    player.hp = Math.min(player.maxHp, player.hp + def.heal * player.maxHp);
    sfx.pickupBig();
    emitSpark(player.x, player.y, 8, '#ff4060');
  } else if (def.magnet) {
    for (const o of pickups) {
      const odef = PICKUP_TYPES[o.type];
      if (odef.xp) o.attracted = true;
    }
    sfx.pickupBig();
  } else if (def.bomb) {
    // damage all on screen
    for (const e of enemies) {
      if (e.hp <= 0 || e.boss) continue;
      const sd2 = dist2(e.x, e.y, player.x, player.y);
      if (sd2 < 600 * 600) hitEnemy(e, 80 + game.time * 0.6, player.x, player.y, 200);
    }
    shakeScreen(10);
    emitSpark(player.x, player.y, 30, '#ff8030');
    sfx.hitBig();
  }
}

function grantXp(n) {
  player.xp += n;
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = Math.floor(5 + player.level * 3 + Math.pow(player.level, 1.55));
    triggerLevelUp();
  }
}

// ============================================================
// Level-up upgrade picker
// ============================================================
const upgradeQueue = [];
let levelUpOpen = false;

function triggerLevelUp() {
  upgradeQueue.push(true);
  if (!levelUpOpen) showLevelUp();
}

function buildUpgradeChoices() {
  const all = [];
  // existing weapon upgrades
  for (const w of player.weapons) {
    if (w.level < WEAPONS[w.id].max) {
      all.push({ kind: 'weaponUp', id: w.id, level: w.level + 1 });
    }
  }
  // existing passive upgrades
  for (const p of player.passives) {
    if (p.level < PASSIVES[p.id].max) {
      all.push({ kind: 'passiveUp', id: p.id, level: p.level + 1 });
    }
  }
  // new weapons (max 6 weapons)
  if (player.weapons.length < 6) {
    for (const id in WEAPONS) {
      if (!player.weapons.find(w => w.id === id)) {
        all.push({ kind: 'weaponNew', id, level: 1 });
      }
    }
  }
  // new passives (max 6 passives)
  if (player.passives.length < 6) {
    for (const id in PASSIVES) {
      if (!player.passives.find(p => p.id === id)) {
        all.push({ kind: 'passiveNew', id, level: 1 });
      }
    }
  }
  // shuffle and pick 3
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  if (all.length === 0) {
    // fallback: heal
    return [{ kind: 'heal' }];
  }
  return all.slice(0, 3);
}

// Apply selected upgrade
function applyUpgrade(choice) {
  if (choice.kind === 'weaponUp') {
    const w = player.weapons.find(w => w.id === choice.id);
    w.level++;
  } else if (choice.kind === 'weaponNew') {
    player.weapons.push({ id: choice.id, level: 1, cd: 0, state: {} });
  } else if (choice.kind === 'passiveUp') {
    const p = player.passives.find(p => p.id === choice.id);
    p.level++;
    recomputeStats();
  } else if (choice.kind === 'passiveNew') {
    player.passives.push({ id: choice.id, level: 1 });
    recomputeStats();
  } else if (choice.kind === 'heal') {
    player.hp = Math.min(player.maxHp, player.hp + 20);
  }
  sfx.levelup();
}

// ============================================================
// Rendering
// ============================================================
function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawWorldBg();

  ctx.save();
  camApply();

  drawSplats();
  drawAoes();
  drawLanterns();
  drawPots();
  drawChests();
  drawPickups();
  drawEnemies();
  drawPlayer();
  drawProjectiles();
  drawEnemyShots();
  drawWeaponEffects();
  drawParticles();
  drawDamageNumbers();

  ctx.restore();
  drawFog();
  drawVignette();
  drawLanternWaypoints();
  drawGrain();
}

function drawPots() {
  // Pots are static scenery — no wobble, cool palette to separate from
  // warm-toned enemies, smaller silhouettes than any mob.
  for (const p of pots) {
    ctx.save();
    ctx.translate(p.x, p.y);
    // flat ground shadow (wider than tall — reads as a sitting object)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 7, 8, 2.5, 0, 0, TAU); ctx.fill();

    if (p.type === 'urn') {
      // Stone amphora — cool grey, distinct from any enemy in the game.
      ctx.fillStyle = '#5a564c';
      ctx.strokeStyle = '#2a2620';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5, -7);
      ctx.bezierCurveTo(-8, -3, -7, 4, -3, 6);
      ctx.lineTo(3, 6);
      ctx.bezierCurveTo(7, 4, 8, -3, 5, -7);
      ctx.lineTo(4, -9);
      ctx.lineTo(-4, -9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // dark mouth (top opening)
      ctx.fillStyle = '#15120e';
      ctx.beginPath();
      ctx.ellipse(0, -9, 4, 1.4, 0, 0, TAU);
      ctx.fill();
      // pale stone bands
      ctx.fillStyle = '#7c7468';
      ctx.fillRect(-5.5, -3, 11, 1);
      ctx.fillRect(-5.5, 1, 11, 0.7);
      // gleam highlight (inanimate cue)
      ctx.fillStyle = 'rgba(220,210,190,0.45)';
      ctx.fillRect(-3, -6, 1.2, 2);
    } else if (p.type === 'crate') {
      // Wooden crate with brass corner caps and visible plank seams.
      ctx.fillStyle = '#6a4220';
      ctx.strokeStyle = '#1a0e08';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(-7, -7, 14, 13);
      ctx.fill(); ctx.stroke();
      // vertical plank seams
      ctx.strokeStyle = '#3a1e0c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-2.5, -7); ctx.lineTo(-2.5, 6);
      ctx.moveTo(2.5, -7);  ctx.lineTo(2.5, 6);
      ctx.stroke();
      // horizontal lid seam
      ctx.beginPath();
      ctx.moveTo(-7, -2); ctx.lineTo(7, -2);
      ctx.stroke();
      // brass corner reinforcements — strong inanimate signal
      ctx.fillStyle = '#a07a3c';
      ctx.strokeStyle = '#5a3a14';
      ctx.lineWidth = 0.8;
      const corners = [[-7, -7], [5, -7], [-7, 4], [5, 4]];
      for (const [cx, cy] of corners) {
        ctx.beginPath(); ctx.rect(cx, cy, 2, 2);
        ctx.fill(); ctx.stroke();
      }
      // top gleam
      ctx.fillStyle = 'rgba(245,220,180,0.4)';
      ctx.fillRect(-5, -6, 3, 0.8);
    }
    ctx.restore();
  }
}

function drawChests() {
  for (const c of chests) {
    const flicker = 1 + Math.sin(c.pulse * 4) * 0.06;
    const float = Math.sin(c.pulse * 2) * 0.8;
    ctx.save();
    ctx.translate(c.x, c.y);
    // halo
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const haloColor = c.tier === 'gold' ? 'rgba(245,217,138,0.55)' : 'rgba(180,180,200,0.4)';
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 70 * flicker);
    grad.addColorStop(0, haloColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-70, -70, 140, 140);
    ctx.restore();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 8, 14, 4.5, 0, 0, TAU); ctx.fill();
    ctx.translate(0, float);
    // body
    ctx.beginPath(); ctx.rect(-12, -1, 24, 12);
    ctx.fillStyle = '#1a0e08'; ctx.fill();
    ctx.strokeStyle = c.tier === 'gold' ? '#f5d98a' : '#c0c0c8'; ctx.lineWidth = 1.5; ctx.stroke();
    // banding
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(-12, 4, 24, 1.2);
    // lid
    ctx.beginPath();
    ctx.moveTo(-12, -1);
    ctx.bezierCurveTo(-12, -10, 12, -10, 12, -1);
    ctx.closePath();
    ctx.fillStyle = '#241410'; ctx.fill(); ctx.stroke();
    // metal trim on lid
    ctx.beginPath();
    ctx.moveTo(-12, -1);
    ctx.bezierCurveTo(-12, -10, 12, -10, 12, -1);
    ctx.strokeStyle = c.tier === 'gold' ? '#f5d98a' : '#c0c0c8';
    ctx.stroke();
    // lock
    ctx.fillStyle = c.tier === 'gold' ? '#f5d98a' : '#c0c0c8';
    ctx.fillRect(-2, -2, 4, 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(-1, 0, 2, 2);
    // glint
    ctx.shadowColor = c.tier === 'gold' ? '#f5d98a' : '#fff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = c.tier === 'gold' ? '#fff5cc' : '#fff';
    ctx.fillRect(8, -3, 1.5, 1.5);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawLanterns() {
  for (const l of lanterns) {
    const flicker = 1 + Math.sin(l.pulse * 8 + l.bornAt * 3) * 0.08;
    // beacon halo
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createRadialGradient(l.x, l.y - 8, 0, l.x, l.y - 8, 110 * flicker);
    grad.addColorStop(0, 'rgba(255,210,120,0.45)');
    grad.addColorStop(0.4, 'rgba(245,180,90,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(l.x, l.y - 8, 110 * flicker, 0, TAU); ctx.fill();
    ctx.restore();

    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(l.x, l.y + 18, 12, 4, 0, 0, TAU); ctx.fill();

    // post
    ctx.fillStyle = '#1a0e0a';
    ctx.fillRect(l.x - 1.5, l.y - 4, 3, 22);
    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1;
    ctx.strokeRect(l.x - 1.5, l.y - 4, 3, 22);

    // lamp body
    ctx.beginPath();
    ctx.rect(l.x - 7, l.y - 18, 14, 16);
    ctx.fillStyle = '#3a2818';
    ctx.fill();
    ctx.strokeStyle = '#a07a48'; ctx.lineWidth = 1.4;
    ctx.stroke();
    // glass panes
    ctx.strokeStyle = '#7a5a40';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 18); ctx.lineTo(l.x, l.y - 2);
    ctx.moveTo(l.x - 7, l.y - 10); ctx.lineTo(l.x + 7, l.y - 10);
    ctx.stroke();
    // flame
    ctx.fillStyle = `rgba(255,210,${Math.floor(120 + Math.sin(l.pulse * 12) * 30)},0.9)`;
    ctx.beginPath(); ctx.ellipse(l.x, l.y - 9, 3 * flicker, 5 * flicker, 0, 0, TAU); ctx.fill();
    ctx.shadowColor = '#f5d98a'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff5cc';
    ctx.beginPath(); ctx.ellipse(l.x, l.y - 9, 1 * flicker, 2 * flicker, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // expiry warning
    const tLeft = (l.expires - game.time) / LANTERN_LIFETIME;
    if (tLeft < 0.3 && Math.floor(game.time * 6) % 2) {
      ctx.fillStyle = 'rgba(255,80,80,0.6)';
      ctx.fillRect(l.x - 8, l.y - 22, 16, 2);
    }
  }
}

function drawLanternWaypoints() {
  for (const l of lanterns) {
    const wx = (l.x - cam.x) + W / 2;
    const wy = (l.y - cam.y) + H / 2;
    const margin = 56;
    if (wx > margin && wx < W - margin && wy > margin && wy < H - margin) continue;
    const dx = l.x - player.x, dy = l.y - player.y;
    const ang = Math.atan2(dy, dx);
    const sx = clamp(wx, margin, W - margin);
    const sy = clamp(wy, margin, H - margin);
    const pulse = 0.7 + Math.sin(game.time * 4) * 0.3;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    ctx.fillStyle = `rgba(245,217,138,${pulse})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // distance label
    ctx.font = '700 10px Cinzel, serif';
    ctx.textAlign = 'center';
    const text = Math.round(Math.hypot(dx, dy) / 10) + 'm';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.fillStyle = '#f5d98a';
    ctx.strokeText(text, sx, sy + 22);
    ctx.fillText(text, sx, sy + 22);
    ctx.textAlign = 'left';
  }
}

function drawSplats() {
  for (const s of splats) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = `rgba(80,8,12,${s.a})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s.r, s.r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(160,16,28,${s.a * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s.r * 0.55, s.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawAoes() {
  for (const a of aoes) {
    if (a.kind === 'fire') {
      const u = a.life / a.max;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r);
      grad.addColorStop(0, `rgba(255,140,40,${0.6 * u})`);
      grad.addColorStop(0.5, `rgba(196,30,58,${0.25 * u})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

function drawPickups() {
  for (const p of pickups) {
    const def = PICKUP_TYPES[p.type];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = def.glow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    if (def.xp) {
      const r = def.size;
      if (def.shape === 'star') {
        // Six-pointed star — distinct silhouette for top-tier echoes,
        // plus a slow rotation so the rarity reads at a glance.
        const r2 = r * 0.45;
        const spin = game.time * 0.6;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU - Math.PI / 2 + spin;
          const rr = i % 2 === 0 ? r : r2;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = def.glow;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // bright core
        ctx.fillStyle = def.glow;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill();
      } else {
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = def.glow;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (def.heal) {
      // heart
      const r = def.size;
      ctx.moveTo(0, r);
      ctx.bezierCurveTo(r * 1.4, 0, r * 0.7, -r, 0, -r * 0.4);
      ctx.bezierCurveTo(-r * 0.7, -r, -r * 1.4, 0, 0, r);
      ctx.fill();
    } else if (def.magnet) {
      ctx.fillStyle = '#c9a961';
      ctx.fillRect(-def.size, -def.size, def.size * 2, def.size * 2);
      ctx.fillStyle = '#0a0608';
      ctx.fillRect(-def.size * 0.4, -def.size, def.size * 0.8, def.size * 0.8);
    } else if (def.bomb) {
      ctx.beginPath(); ctx.arc(0, 0, def.size, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff6020';
      ctx.fillRect(-1, -def.size - 4, 2, 4);
    }
    ctx.restore();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    if (p.kind === 'bullet') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // trail
      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i];
        const u = i / p.trail.length;
        ctx.fillStyle = `rgba(245,230,192,${u * 0.5})`;
        ctx.beginPath();
        ctx.arc(t.x - p.x, t.y - p.y, 2 * u, 0, TAU);
        ctx.fill();
      }
      ctx.shadowColor = '#f5e6c0';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fff8e0';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'molotov') {
      ctx.save();
      ctx.translate(p.x, p.y - p.h);
      ctx.fillStyle = '#3a2818';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffaa30';
      ctx.beginPath(); ctx.arc(0, -6, 3, 0, TAU); ctx.fill();
      ctx.restore();
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 3, 0, 0, TAU); ctx.fill();
    }
  }
}

function drawEnemyShots() {
  for (const s of enemyShots) {
    ctx.save();
    ctx.shadowColor = '#c0c8d8';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#d8e0f0';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawWeaponEffects() {
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (def.draw) def.draw(w);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    drawEnemy(e);
  }
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.flash > 0;

  // walking animation — bob for upright shapes, sway for low ones, float for lurkers
  const moving = (e.vx * e.vx + e.vy * e.vy) > 25;
  let bob = 0, sway = 0;
  if (moving) {
    const phase = game.time * 9 + e.walkPhase;
    if (e.def.shape === 'beast' || e.def.shape === 'rat') {
      sway = Math.sin(phase * 1.2) * 1.1;
    } else if (e.def.shape === 'lurker') {
      bob = Math.sin(phase * 0.7) * 2;
    } else if (e.def.shape === 'troll' || e.def.shape === 'cleric' || e.def.shape === 'boss' || e.def.shape === 'moon') {
      bob = Math.abs(Math.sin(phase * 0.7)) * 1.3;  // heavy slow lurch
    } else {
      bob = Math.abs(Math.sin(phase)) * 1.5;
    }
  }

  // warm halo to lift the silhouette off the dark cobbles (anchored)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 1.6);
  halo.addColorStop(0, e.def.halo || 'rgba(60,30,15,0.3)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-e.r * 1.8, -e.r * 1.8, e.r * 3.6, e.r * 3.6);
  ctx.restore();

  // contact shadow (anchored to ground, doesn't bob)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r * 0.85, e.r * 0.32, 0, 0, TAU); ctx.fill();

  // Elite ring drawn under the body
  if (e.promoted) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245,217,138,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -game.time * 14;
    ctx.beginPath(); ctx.arc(0, e.r * 0.7, e.r * 1.2, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // body parts ride the bob/sway
  ctx.translate(sway, -bob);

  const fillBody = flash ? '#fff' : e.def.color;
  const fillAcc  = flash ? '#fff' : e.def.accent;
  const stroke   = flash ? '#fff' : e.def.rim;

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;

  if (e.def.shape === 'humanoid') {
    // body
    ctx.beginPath();
    ctx.rect(-e.r * 0.55, -e.r * 0.4, e.r * 1.1, e.r * 1.4);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // hood drape
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.55, -e.r * 0.2);
    ctx.lineTo(0, -e.r * 0.85);
    ctx.lineTo(e.r * 0.55, -e.r * 0.2);
    ctx.closePath();
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(0, -e.r * 0.55, e.r * 0.42, 0, TAU);
    ctx.fillStyle = flash ? '#fff' : '#1a0c08'; ctx.fill(); ctx.stroke();
    // glowing eyes
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 6;
      ctx.fillStyle = e.def.eye;
      ctx.fillRect(-e.r * 0.28, -e.r * 0.6, 2.5, 2.5);
      ctx.fillRect(e.r * 0.16, -e.r * 0.6, 2.5, 2.5);
      ctx.shadowBlur = 0;
    }
  } else if (e.def.shape === 'beast') {
    // hunched body
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.2, e.r * 0.7, 0, 0, TAU);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // head/maw
    ctx.beginPath(); ctx.arc(e.r * 0.75, -e.r * 0.2, e.r * 0.5, 0, TAU);
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // ear/horn
    ctx.beginPath();
    ctx.moveTo(e.r * 0.55, -e.r * 0.55);
    ctx.lineTo(e.r * 0.85, -e.r * 0.95);
    ctx.lineTo(e.r * 0.95, -e.r * 0.5);
    ctx.closePath();
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 6;
      ctx.fillStyle = e.def.eye;
      ctx.fillRect(e.r * 0.95, -e.r * 0.32, 3, 2);
      ctx.shadowBlur = 0;
      // teeth
      ctx.fillStyle = '#d8d0c0';
      ctx.fillRect(e.r * 1.1, -e.r * 0.05, 2, 4);
    }
  } else if (e.def.shape === 'crow') {
    // long coat
    ctx.beginPath(); ctx.rect(-e.r * 0.5, -e.r * 0.3, e.r, e.r * 1.2);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // shoulders
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.7, -e.r * 0.15);
    ctx.lineTo(0, -e.r * 0.45);
    ctx.lineTo(e.r * 0.7, -e.r * 0.15);
    ctx.lineTo(e.r * 0.5, -e.r * 0.3);
    ctx.lineTo(-e.r * 0.5, -e.r * 0.3);
    ctx.closePath();
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // top hat
    ctx.beginPath();
    ctx.rect(-e.r * 0.55, -e.r * 1.05, e.r * 1.1, e.r * 0.18);
    ctx.rect(-e.r * 0.4, -e.r * 1.45, e.r * 0.8, e.r * 0.42);
    ctx.fillStyle = flash ? '#fff' : '#0a0a14'; ctx.fill(); ctx.stroke();
    // pale mask + beak
    ctx.beginPath(); ctx.arc(0, -e.r * 0.55, e.r * 0.36, 0, TAU);
    ctx.fillStyle = flash ? '#fff' : '#d8d4c8'; ctx.fill(); ctx.stroke();
    if (!flash) {
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 0.55);
      ctx.lineTo(e.r * 0.55, -e.r * 0.4);
      ctx.lineTo(0, -e.r * 0.35);
      ctx.closePath();
      ctx.fillStyle = '#a89878'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.def.eye;
      ctx.fillRect(-e.r * 0.18, -e.r * 0.62, 2, 2);
      ctx.fillRect(e.r * 0.06, -e.r * 0.62, 2, 2);
    }
  } else if (e.def.shape === 'troll') {
    // hulking body
    ctx.beginPath();
    ctx.rect(-e.r * 0.7, -e.r * 0.3, e.r * 1.4, e.r * 1.5);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // shoulders / boulder pack
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.7, -e.r * 0.3);
    ctx.lineTo(-e.r * 0.95, -e.r * 0.6);
    ctx.lineTo(-e.r * 0.5, -e.r * 0.75);
    ctx.lineTo(e.r * 0.5, -e.r * 0.75);
    ctx.lineTo(e.r * 0.95, -e.r * 0.6);
    ctx.lineTo(e.r * 0.7, -e.r * 0.3);
    ctx.closePath();
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // small head
    ctx.beginPath(); ctx.arc(0, -e.r * 0.5, e.r * 0.3, 0, TAU);
    ctx.fillStyle = flash ? '#fff' : '#1a0e08'; ctx.fill(); ctx.stroke();
    // brick fragments embedded
    ctx.fillStyle = fillAcc;
    ctx.fillRect(-e.r * 0.45, e.r * 0.35, 5, 5);
    ctx.fillRect(e.r * 0.25, e.r * 0.55, 4, 4);
    ctx.strokeRect(-e.r * 0.45, e.r * 0.35, 5, 5);
    ctx.strokeRect(e.r * 0.25, e.r * 0.55, 4, 4);
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 5;
      ctx.fillStyle = e.def.eye;
      ctx.fillRect(-e.r * 0.16, -e.r * 0.55, 2.5, 2.5);
      ctx.fillRect(e.r * 0.04, -e.r * 0.55, 2.5, 2.5);
      ctx.shadowBlur = 0;
    }
  } else if (e.def.shape === 'rat') {
    // long horizontal body
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.4, e.r * 0.6, 0, 0, TAU);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(e.r * 0.85, -e.r * 0.05, e.r * 0.45, 0, TAU);
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // ear
    ctx.beginPath(); ctx.arc(e.r * 0.6, -e.r * 0.55, e.r * 0.22, 0, TAU);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // tail (curving line)
    ctx.strokeStyle = fillBody;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.2, e.r * 0.05);
    ctx.bezierCurveTo(-e.r * 1.7, -e.r * 0.5, -e.r * 2.0, e.r * 0.6, -e.r * 2.3, 0);
    ctx.stroke();
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 4;
      ctx.fillStyle = e.def.eye;
      ctx.fillRect(e.r * 1.05, -e.r * 0.18, 2, 2);
      ctx.shadowBlur = 0;
    }
  } else if (e.def.shape === 'lurker') {
    // pulsing body
    const pulse = 1 + Math.sin(game.time * 6 + e.bornAt * 3) * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, e.r * pulse, 0, TAU);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // tendrils
    ctx.strokeStyle = fillAcc;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + game.time * 1.6;
      const x0 = Math.cos(a) * e.r * 0.85;
      const y0 = Math.sin(a) * e.r * 0.85;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * 5, y0 + Math.sin(a) * 5);
    }
    ctx.stroke();
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 8;
      ctx.fillStyle = e.def.eye;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.32, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else { // cleric, boss, moon
    // body
    ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 1.1, 0, 0, TAU);
    ctx.fillStyle = fillBody; ctx.fill(); ctx.stroke();
    // hunched shoulders
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.6, -e.r * 0.3, e.r * 0.4, e.r * 0.55, 0.4, 0, TAU);
    ctx.ellipse(e.r * 0.6, -e.r * 0.3, e.r * 0.4, e.r * 0.55, -0.4, 0, TAU);
    ctx.fillStyle = fillAcc; ctx.fill(); ctx.stroke();
    // skull head
    ctx.beginPath(); ctx.arc(0, -e.r * 0.7, e.r * 0.5, 0, TAU);
    ctx.fillStyle = flash ? '#fff' : '#241410'; ctx.fill(); ctx.stroke();
    if (!flash) {
      ctx.shadowColor = e.def.eye; ctx.shadowBlur = 14;
      ctx.fillStyle = e.def.eye;
      const eyeY = -e.r * 0.72;
      ctx.fillRect(-e.r * 0.26, eyeY, 4.5, 4.5);
      ctx.fillRect(e.r * 0.1,  eyeY, 4.5, 4.5);
      ctx.shadowBlur = 0;
      // jaw
      ctx.fillStyle = '#0a0608';
      ctx.fillRect(-e.r * 0.2, -e.r * 0.55, e.r * 0.4, e.r * 0.12);
    }
    if (e.def.shape === 'moon') {
      ctx.strokeStyle = 'rgba(240,224,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -e.r * 0.7, e.r * 0.95, 0, TAU); ctx.stroke();
    }
  }
  ctx.restore();

  // hp bar (bosses + elites)
  if (e.boss || e.elite) {
    const w = e.boss ? 100 : 54;
    const u = clamp(e.hp / e.maxHp, 0, 1);
    const bx = e.x - w / 2, by = e.y - e.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 5);
    ctx.fillStyle = '#3a0608';
    ctx.fillRect(bx, by, w, 3);
    ctx.fillStyle = '#d6182e';
    ctx.fillRect(bx, by, w * u, 3);
  }
}

function drawPlayer() {
  const art = HUNTER_ART[game.hunter] || HUNTER_ART.hunter;
  // Walk bob keyed on velocity magnitude.
  const speedMag = Math.hypot(player.vx, player.vy);
  const moving = speedMag > 30;
  const walkPhase = game.time * 14;
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.6 : 0;
  const lean = moving ? Math.sin(walkPhase) * 0.05 : 0;

  ctx.save();
  ctx.translate(player.x, player.y);

  // gold halo (anchored, no bob)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
  halo.addColorStop(0, 'rgba(201,169,97,0.22)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-28, -28, 56, 56);
  ctx.restore();

  // contact shadow (anchored to ground)
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.ellipse(0, 11, 9, 4, 0, 0, TAU); ctx.fill();

  // I-frames blink
  if (player.iframes > 0 && Math.floor(player.iframes * 24) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Body parts ride the bob
  ctx.translate(0, -bob);
  ctx.rotate(lean);

  const flash = player.hitFlash > 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = flash ? '#fff' : '#5a3a2a';

  // long coat
  ctx.beginPath(); ctx.rect(-7, -2, 14, 14);
  ctx.fillStyle = flash ? '#fff' : art.coat; ctx.fill(); ctx.stroke();
  // coat trim
  ctx.beginPath(); ctx.rect(-7, -2, 14, 2);
  ctx.fillStyle = flash ? '#fff' : art.trim; ctx.fill(); ctx.stroke();
  // hunter-specific coat detail
  if (art.accent === 'scarf') {
    // Hunter: red scarf trailing
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(3, 0);
    ctx.lineTo(4, 5);
    ctx.lineTo(-1, 6);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : '#8b0000'; ctx.fill(); ctx.stroke();
  } else if (art.accent === 'pistol') {
    // Foreigner: silver pistol on belt
    ctx.beginPath(); ctx.rect(3, 4, 6, 2.5);
    ctx.fillStyle = flash ? '#fff' : '#aaa8a0'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#3a2818';
    ctx.fillRect(2.5, 5, 2, 3);
  }
  // head
  ctx.beginPath(); ctx.arc(0, -7, 5, 0, TAU);
  ctx.fillStyle = flash ? '#fff' : art.skin; ctx.fill(); ctx.stroke();

  // hat
  if (art.hat === 'tricorne') {
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.lineTo(9, -10);
    ctx.lineTo(6, -13);  ctx.lineTo(-6, -13);
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : art.hatColor; ctx.fill(); ctx.stroke();
  } else if (art.hat === 'tophat') {
    ctx.beginPath();
    ctx.rect(-7, -10.5, 14, 1.5);  // brim
    ctx.fillStyle = flash ? '#fff' : art.hatColor; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.rect(-4.5, -16, 9, 5.5);   // crown
    ctx.fillStyle = flash ? '#fff' : art.hatColor; ctx.fill(); ctx.stroke();
    // ribbon band
    if (!flash) {
      ctx.fillStyle = '#3a3458';
      ctx.fillRect(-4.5, -12.5, 9, 1.2);
    }
  } else if (art.hat === 'hood') {
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.bezierCurveTo(-8, -14, 8, -14, 7, -8);
    ctx.lineTo(7, -6);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : art.hatColor; ctx.fill(); ctx.stroke();
  }

  // eye glow — colour-keyed per hunter
  if (!flash) {
    ctx.shadowColor = art.eye; ctx.shadowBlur = 5;
    ctx.fillStyle = art.eye;
    ctx.fillRect(-2.5, -7, 1.5, 1.5);
    ctx.fillRect(1, -7, 1.5, 1.5);
    ctx.shadowBlur = 0;
  }

  // Executioner: greatsword strapped to the back
  if (art.accent === 'greatsword' && !flash) {
    ctx.save();
    ctx.translate(-1, 1);
    ctx.rotate(-0.32);
    ctx.fillStyle = '#3a3a40'; ctx.strokeStyle = '#1a1010';
    ctx.beginPath(); ctx.rect(-1.5, -14, 3, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(-3, -14, 6, 1.5);
    ctx.fillStyle = '#7a6240';
    ctx.fillRect(-1, 2, 2, 4);
    ctx.restore();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const u = p.life / p.max;
    if (p.type === 'blood') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = u;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    } else if (p.type === 'spark') {
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = u;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.type === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = u * 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawDamageNumbers() {
  ctx.font = '700 13px Cinzel, serif';
  ctx.textAlign = 'center';
  for (const d of damageNumbers) {
    const u = d.life / d.max;
    ctx.globalAlpha = clamp(u * 1.3, 0, 1);
    ctx.fillStyle = d.crit ? '#ffea88' : '#f5e6c0';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(d.text, d.x, d.y);
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ============================================================
// HUD updates
// ============================================================
const ui = {
  hud: document.getElementById('hud'),
  hpFill: document.getElementById('hpFill'),
  hpText: document.getElementById('hpText'),
  xpFill: document.getElementById('xpFill'),
  timer: document.getElementById('timer'),
  lvlText: document.getElementById('lvlText'),
  killText: document.getElementById('killText'),
  echoText: document.getElementById('echoText'),
  weaponSlots: document.getElementById('weaponSlots'),
  passiveSlots: document.getElementById('passiveSlots'),
  title: document.getElementById('title'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  pauseMenu: document.getElementById('pauseMenu'),
  resumeBtn: document.getElementById('resumeBtn'),
  quitBtn: document.getElementById('quitBtn'),
  pauseTime: document.getElementById('pauseTime'),
  pauseLevel: document.getElementById('pauseLevel'),
  pauseKills: document.getElementById('pauseKills'),
  levelUp: document.getElementById('levelUp'),
  upgradeChoices: document.getElementById('upgradeChoices'),
  rerollBtn: document.getElementById('rerollBtn'),
  rerollCount: document.getElementById('rerollCount'),
  gameOver: document.getElementById('gameOver'),
  retryBtn: document.getElementById('retryBtn'),
  goTime: document.getElementById('goTime'),
  goLevel: document.getElementById('goLevel'),
  goKills: document.getElementById('goKills'),
  goEcho: document.getElementById('goEcho'),
  victory: document.getElementById('victory'),
  victoryBtn: document.getElementById('victoryBtn'),
  vTime: document.getElementById('vTime'),
  vLevel: document.getElementById('vLevel'),
  vKills: document.getElementById('vKills'),
  vEcho: document.getElementById('vEcho'),
  dreamPanel: document.getElementById('dreamPanel'),
  dreamEchoes: document.getElementById('dreamEchoes'),
  dreamPerks: document.getElementById('dreamPerks'),
};

function renderDreamPanel() {
  if (!ui.dreamEchoes) return;
  ui.dreamEchoes.textContent = meta.totalEchoes;
  const html = Object.entries(META_DEFS).map(([id, def]) => {
    const lv = meta.perks[id];
    const maxed = lv >= def.max;
    const cost = maxed ? null : perkCost(id);
    const canAfford = !maxed && meta.totalEchoes >= cost;
    const pips = Array.from({ length: def.max }, (_, i) =>
      `<span class="dream-perk-pip${i < lv ? ' filled' : ''}"></span>`).join('');
    return `<button class="dream-perk${canAfford ? ' affordable' : ''}" data-id="${id}" ${maxed || !canAfford ? 'disabled' : ''}>
      <div class="dream-perk-icon">${def.icon}</div>
      <div class="dream-perk-info">
        <div class="dream-perk-name">${def.name}</div>
        <div class="dream-perk-desc">${def.desc}</div>
        <div class="dream-perk-pips">${pips}</div>
      </div>
      <div class="dream-perk-cost">${maxed ? 'MAX' : '◈ ' + cost}</div>
    </button>`;
  }).join('');
  ui.dreamPerks.innerHTML = html;
  ui.dreamPerks.querySelectorAll('.dream-perk').forEach(b => {
    b.addEventListener('click', () => buyPerk(b.dataset.id));
  });
}

loadMeta();
renderDreamPanel();

function updateHud() {
  if (!game.running) return;
  const hpU = clamp(player.hp / player.maxHp, 0, 1);
  ui.hpFill.style.width = (hpU * 100).toFixed(1) + '%';
  ui.hpText.textContent = Math.ceil(player.hp) + ' / ' + Math.ceil(player.maxHp);
  ui.xpFill.style.width = clamp(player.xp / player.xpNeed, 0, 1) * 100 + '%';
  ui.timer.textContent = fmtTime(game.time);
  ui.lvlText.textContent = player.level;
  ui.killText.textContent = game.kills;
  ui.echoText.textContent = game.echoes;
  // slots
  const wHtml = [];
  for (let i = 0; i < 6; i++) {
    const w = player.weapons[i];
    if (w) {
      const def = WEAPONS[w.id];
      wHtml.push(`<div class="slot"><span class="slot-icon">${def.icon}</span><span class="slot-lvl">${w.level}</span></div>`);
    } else {
      wHtml.push(`<div class="slot slot-empty"></div>`);
    }
  }
  ui.weaponSlots.innerHTML = wHtml.join('');
  const pHtml = [];
  for (let i = 0; i < 6; i++) {
    const p = player.passives[i];
    if (p) {
      const def = PASSIVES[p.id];
      pHtml.push(`<div class="slot passive"><span class="slot-icon">${def.icon}</span><span class="slot-lvl">${p.level}</span></div>`);
    } else {
      pHtml.push(`<div class="slot passive slot-empty"></div>`);
    }
  }
  ui.passiveSlots.innerHTML = pHtml.join('');
}

function showLevelUp() {
  if (upgradeQueue.length === 0) { levelUpOpen = false; return; }
  upgradeQueue.shift();
  const choices = buildUpgradeChoices();
  // When everything is maxed, the only choice is the fallback heal —
  // auto-apply it without breaking flow with a modal.
  if (choices.length === 1 && choices[0].kind === 'heal') {
    applyUpgrade(choices[0]);
    if (upgradeQueue.length > 0) setTimeout(showLevelUp, 50);
    else { levelUpOpen = false; game.paused = false; }
    return;
  }
  levelUpOpen = true;
  game.paused = true;
  renderUpgradeChoices(choices);
  ui.levelUp.classList.remove('hidden');
}

function renderUpgradeChoices(choices) {
  const html = choices.map((c, i) => {
    let icon, name, desc, tag, isNew;
    if (c.kind === 'weaponNew') {
      const d = WEAPONS[c.id]; icon = d.icon; name = d.name; desc = d.desc; tag = d.tag || 'New'; isNew = true;
    } else if (c.kind === 'weaponUp') {
      const d = WEAPONS[c.id]; icon = d.icon; name = d.name; desc = d.levels[c.level - 1].desc; tag = 'Lv ' + c.level; isNew = false;
    } else if (c.kind === 'passiveNew') {
      const d = PASSIVES[c.id]; icon = d.icon; name = d.name; desc = d.desc; tag = 'New'; isNew = true;
    } else if (c.kind === 'passiveUp') {
      const d = PASSIVES[c.id]; icon = d.icon; name = d.name; desc = d.levelDesc(c.level); tag = 'Lv ' + c.level; isNew = false;
    } else {
      icon = '✚'; name = 'Mend Wounds'; desc = 'Restore 20 HP.'; tag = ''; isNew = false;
    }
    return `<button class="upgrade-card${isNew ? ' new' : ''}" data-i="${i}">
      <div class="upgrade-icon">${icon}</div>
      <div class="upgrade-info">
        <div class="upgrade-name">${name} <span class="upgrade-tag${isNew ? '' : ' lvl'}">${tag}</span></div>
        <div class="upgrade-desc">${desc}</div>
      </div>
    </button>`;
  }).join('');
  ui.upgradeChoices.innerHTML = html;
  ui.upgradeChoices.querySelectorAll('.upgrade-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = +card.dataset.i;
      applyUpgrade(choices[i]);
      ui.levelUp.classList.add('hidden');
      // process additional level-ups in queue
      if (upgradeQueue.length > 0) {
        setTimeout(() => showLevelUp(), 50);
      } else {
        levelUpOpen = false;
        game.paused = false;
      }
    }, { once: true });
  });
  ui.rerollCount.textContent = player.rerolls;
  ui.rerollBtn.disabled = player.rerolls <= 0;
  ui.rerollBtn.onclick = () => {
    if (player.rerolls <= 0) return;
    player.rerolls--;
    renderUpgradeChoices(buildUpgradeChoices());
  };
}

// ============================================================
// Title screen, pause, game over, victory
// ============================================================
let selectedHunter = 'hunter';
document.querySelectorAll('.hunter-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.hunter-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedHunter = card.dataset.hunter;
    ensureAudio();
    sfx.pickup();
  });
});

ui.startBtn.addEventListener('click', () => {
  ensureAudio();
  startGame(selectedHunter);
});

function startGame(hunterId) {
  game.hunter = hunterId;
  resetPlayer(hunterId);
  applyMetaPerks();
  recomputeStats();
  game.running = true;
  game.paused = false;
  game.time = 0;
  game.kills = 0;
  game.echoes = 0;
  game.spawnAcc = 0;
  game.bossSpawned = { 1: false, 2: false };
  game.eliteCd = 60;
  game.lanternCd = 35;
  game.gemMergeCd = 0;
  enemies.length = 0;
  projectiles.length = 0;
  enemyShots.length = 0;
  aoes.length = 0;
  particles.length = 0;
  damageNumbers.length = 0;
  pickups.length = 0;
  splats.length = 0;
  lanterns.length = 0;
  pots.length = 0;
  chests.length = 0;
  game.potCd = 0;
  spawnPotsInitial();
  upgradeQueue.length = 0;
  levelUpOpen = false;
  cam.x = 0; cam.y = 0;
  ui.title.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
  ui.victory.classList.add('hidden');
  ui.levelUp.classList.add('hidden');
  ui.pauseMenu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
}

function togglePause() {
  if (!game.running) return;
  if (levelUpOpen) return;
  if (game.paused) {
    game.paused = false;
    ui.pauseMenu.classList.add('hidden');
  } else {
    game.paused = true;
    ui.pauseTime.textContent = fmtTime(game.time);
    ui.pauseLevel.textContent = player.level;
    ui.pauseKills.textContent = game.kills;
    ui.pauseMenu.classList.remove('hidden');
  }
}
ui.pauseBtn.addEventListener('click', togglePause);
ui.resumeBtn.addEventListener('click', togglePause);
ui.quitBtn.addEventListener('click', () => {
  game.running = false;
  game.paused = false;
  ui.pauseMenu.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.title.classList.remove('hidden');
});

function onPlayerDeath() {
  game.running = false;
  awardEchoes();
  sfx.death();
  ui.goTime.textContent = fmtTime(game.time);
  ui.goLevel.textContent = player.level;
  ui.goKills.textContent = game.kills;
  ui.goEcho.textContent = game.echoes;
  ui.hud.classList.add('hidden');
  ui.gameOver.classList.remove('hidden');
}
ui.retryBtn.addEventListener('click', () => {
  ui.gameOver.classList.add('hidden');
  renderDreamPanel();
  ui.title.classList.remove('hidden');
});

function onVictory() {
  game.running = false;
  awardEchoes();
  sfx.victory();
  ui.vTime.textContent = fmtTime(game.time);
  ui.vLevel.textContent = player.level;
  ui.vKills.textContent = game.kills;
  ui.vEcho.textContent = game.echoes;
  ui.hud.classList.add('hidden');
  ui.victory.classList.remove('hidden');
}
ui.victoryBtn.addEventListener('click', () => {
  ui.victory.classList.add('hidden');
  renderDreamPanel();
  ui.title.classList.remove('hidden');
});

// ============================================================
// Main loop
// ============================================================
let last = performance.now();
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 1 / 30);
  last = ts;
  fogTime += dt;
  if (game.running && !game.paused) {
    update(dt);
    game.time += dt;
  }
  game.realTime += dt;
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 60);
  render();
  updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

