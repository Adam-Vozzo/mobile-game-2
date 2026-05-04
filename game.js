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
  echoSmall:  { color: '#7ec8ff', glow: '#8edcff', xp: 1,  size: 4 },
  echoMed:    { color: '#3a8fe6', glow: '#5fb0ff', xp: 5,  size: 5 },
  echoLarge:  { color: '#a560ff', glow: '#c98aff', xp: 25, size: 7 },
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
  player.dmgMul = h.bonus.dmg;
  player.areaMul = h.bonus.area;
  player.cdMul = 1;
  player.projSpeedMul = 1;
  player.durationMul = 1;
  player.regen = 0;
  player.pickupRadius = 60;
  let speedMul = h.bonus.speed;
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
  const newMax = HUNTERS[game.hunter].hp + maxHpBonus;
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
    name: 'Yharnamite', hp: 8, speed: 42, dmg: 8, r: 11, xp: 'echoSmall',
    color: '#3a2418', accent: '#5a3a28', rim: '#7a5238', halo: 'rgba(80,40,20,0.28)',
    eye: '#ff3850', shape: 'humanoid',
  },
  scourge: {
    name: 'Scourge Beast', hp: 22, speed: 78, dmg: 14, r: 13, xp: 'echoSmall',
    color: '#241a14', accent: '#3a2820', rim: '#5a4030', halo: 'rgba(60,30,15,0.3)',
    eye: '#ffb840', shape: 'beast',
  },
  crow: {
    name: 'Crow Hunter', hp: 30, speed: 55, dmg: 16, r: 12, xp: 'echoMed',
    color: '#1a1a2a', accent: '#5a5a6a', rim: '#7a7a8a', halo: 'rgba(40,40,70,0.3)',
    eye: '#d8e0f0', shape: 'crow', ranged: true, fireRate: 2.4, projSpeed: 220, projDmg: 12,
  },
  bloodlicker: {
    name: 'Bloodlicker', hp: 14, speed: 95, dmg: 22, r: 12, xp: 'echoSmall',
    color: '#5a0810', accent: '#8a1018', rim: '#b8202c', halo: 'rgba(140,20,30,0.4)',
    eye: '#ff4060', shape: 'lurker', explode: true, explodeR: 50,
  },
  cleric: {
    name: 'Cleric Beast', hp: 200, speed: 52, dmg: 28, r: 24, xp: 'echoLarge',
    color: '#3a1a14', accent: '#5a2818', rim: '#8a3820', halo: 'rgba(110,30,15,0.45)',
    eye: '#ff3030', shape: 'cleric', elite: true,
  },
  bloodletting: {
    name: 'Bloodletting Beast', hp: 1400, speed: 48, dmg: 36, r: 38, xp: 'echoLarge',
    color: '#3a0c10', accent: '#8a1018', rim: '#c82030', halo: 'rgba(160,15,25,0.55)',
    eye: '#ff2020', shape: 'boss', boss: true,
  },
  moonPresence: {
    name: 'Moon Presence', hp: 4500, speed: 56, dmg: 50, r: 44, xp: 'echoLarge',
    color: '#3a3045', accent: '#604858', rim: '#9080a0', halo: 'rgba(180,160,210,0.35)',
    eye: '#f0e0ff', shape: 'moon', boss: true,
  },
};

function spawnEnemy(typeId, x, y, mods = {}) {
  const def = ENEMY_TYPES[typeId];
  enemies.push({
    type: typeId, def,
    x, y, vx: 0, vy: 0,
    hp: (def.hp + (game.time * 0.4)) * (mods.hpMul || 1),
    maxHp: (def.hp + (game.time * 0.4)) * (mods.hpMul || 1),
    dmg: def.dmg * (mods.dmgMul || 1),
    r: def.r * (mods.rMul || 1),
    speed: def.speed * (mods.speedMul || 1) * rand(0.92, 1.08),
    flash: 0,
    hitCdById: {},  // weaponInstanceId -> cooldown remaining
    fireCd: def.fireRate ? rand(0, def.fireRate) : 0,
    boss: !!def.boss,
    elite: !!def.elite,
    bornAt: game.time,
    knockX: 0, knockY: 0,
    aimNoise: rand(-0.2, 0.2),
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
        ctx.rotate(0);
        const dir = s.dir;
        ctx.strokeStyle = `rgba(245,230,192,${1 - u})`;
        ctx.lineWidth = 5 - u * 4;
        ctx.beginPath();
        const startA = -s.arc / 2;
        const endA = startA + s.arc * u;
        ctx.arc(0, 0, s.reach, startA, endA, false);
        if (dir < 0) {
          ctx.scale(-1, 1);
        }
        ctx.stroke();
        ctx.strokeStyle = `rgba(196,30,58,${0.6 * (1 - u)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
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
          // pulse: emit ring particles
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU;
            particles.push({ type: 'spark', x: player.x + Math.cos(a) * 10, y: player.y + Math.sin(a) * 10,
              vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.4, max: 0.4, size: 2, color: '#ffaa30' });
          }
        }
      }
    },
    draw(w) {
      if (!w.state.r) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const r = w.state.r;
      const grad = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, r);
      grad.addColorStop(0, 'rgba(255,180,90,0.18)');
      grad.addColorStop(0.6, 'rgba(196,30,58,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(player.x, player.y, r, 0, TAU); ctx.fill();
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
  victoryAt: 30 * 60, // 30 minutes
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
  // drop xp gem (unless already despawned)
  if (e.def.xp) {
    let xpType = e.def.xp;
    // upgrade chance
    if (xpType === 'echoSmall' && Math.random() < 0.04) xpType = 'echoMed';
    if (xpType === 'echoMed' && Math.random() < 0.05) xpType = 'echoLarge';
    spawnPickup(xpType, e.x, e.y);
  }
  // rare drops
  const r = Math.random();
  if (e.boss) {
    spawnPickup('echoLarge', e.x + 20, e.y);
    spawnPickup('echoLarge', e.x - 20, e.y);
    spawnPickup('heart', e.x, e.y - 10);
  } else if (e.elite) {
    spawnPickup('echoMed', e.x, e.y);
    if (r < 0.3) spawnPickup('heart', e.x + 8, e.y - 6);
  } else {
    if (r < 0.012) spawnPickup('heart', e.x, e.y);
    else if (r < 0.02) spawnPickup('magnet', e.x, e.y);
    else if (r < 0.024) spawnPickup('bomb', e.x, e.y);
  }
  if (e.boss) {
    shakeScreen(12);
    sfx.hitBig();
  }
}

function damagePlayer(amount) {
  if (player.iframes > 0) return;
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
  // Spawn rate ramps with time. Cap at ~10/s logical
  let rate = 0.7 + Math.min(t / 30, 9); // 0.7 -> ~10
  rate *= 1 + Math.min(t / 600, 0.6);
  game.spawnAcc += rate * dt;
  while (game.spawnAcc >= 1) {
    game.spawnAcc -= 1;
    spawnByTime(t);
  }
  // Bosses
  if (!game.bossSpawned[1] && t >= 10 * 60) {
    game.bossSpawned[1] = true;
    spawnEnemyAroundPlayer('bloodletting', 320, 360);
    sfx.boss();
    shakeScreen(16);
  }
  if (!game.bossSpawned[2] && t >= 22 * 60) {
    game.bossSpawned[2] = true;
    spawnEnemyAroundPlayer('moonPresence', 320, 360);
    sfx.boss();
    shakeScreen(20);
  }
  // Elite cleric beast every ~90s starting at 5:00
  if (t > 5 * 60) {
    game.eliteCd = (game.eliteCd || 90) - dt;
    if (game.eliteCd <= 0) {
      game.eliteCd = Math.max(45, 90 - (t - 300) / 30);
      spawnEnemyAroundPlayer('cleric', 380, 460);
    }
  }
  // Victory check
  if (t >= game.victoryAt && game.running) {
    onVictory();
  }
}

function spawnByTime(t) {
  // Selection table by elapsed time
  let table;
  if (t < 90) table = ['townsfolk'];
  else if (t < 240) table = ['townsfolk', 'townsfolk', 'scourge'];
  else if (t < 420) table = ['townsfolk', 'scourge', 'scourge', 'crow'];
  else if (t < 600) table = ['scourge', 'crow', 'bloodlicker', 'townsfolk'];
  else if (t < 900) table = ['scourge', 'crow', 'bloodlicker', 'scourge'];
  else table = ['scourge', 'crow', 'bloodlicker', 'crow', 'scourge'];
  const id = pick(table);
  // Spawn just outside the visible area
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
  spawnDirector(dt);
  cam.x = lerp(cam.x, player.x, 0.18);
  cam.y = lerp(cam.y, player.y, 0.18);
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
  }
}

function updateEnemyShots(dt) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.life -= dt;
    if (dist2(s.x, s.y, player.x, player.y) < (10 + s.r) * (10 + s.r)) {
      damagePlayer(s.dmg);
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
  drawGrain();
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
      // flicker dots
      if (Math.random() < 0.6) {
        const ang = Math.random() * TAU;
        const r = Math.random() * a.r;
        particles.push({ type: 'spark',
          x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r,
          vx: rand(-10, 10), vy: rand(-50, -20),
          life: 0.3, max: 0.3, size: 1.5, color: '#ff8030' });
      }
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
      // gem shape
      const r = def.size;
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = def.glow;
      ctx.lineWidth = 1;
      ctx.stroke();
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

  // warm halo to lift the silhouette off the dark cobbles
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 1.6);
  halo.addColorStop(0, e.def.halo || 'rgba(60,30,15,0.3)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-e.r * 1.8, -e.r * 1.8, e.r * 3.6, e.r * 3.6);
  ctx.restore();

  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r * 0.85, e.r * 0.32, 0, 0, TAU); ctx.fill();

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
  ctx.save();
  ctx.translate(player.x, player.y);

  // gold halo so the hunter is always findable
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
  halo.addColorStop(0, 'rgba(201,169,97,0.22)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-28, -28, 56, 56);
  ctx.restore();

  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.ellipse(0, 11, 9, 4, 0, 0, TAU); ctx.fill();

  // I-frames blink
  if (player.iframes > 0 && Math.floor(player.iframes * 24) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  const flash = player.hitFlash > 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = flash ? '#fff' : '#5a3a2a';

  // long coat
  ctx.beginPath(); ctx.rect(-7, -2, 14, 14);
  ctx.fillStyle = flash ? '#fff' : '#241410'; ctx.fill(); ctx.stroke();
  // collar
  ctx.beginPath(); ctx.rect(-7, -2, 14, 2);
  ctx.fillStyle = flash ? '#fff' : '#5a2818'; ctx.fill(); ctx.stroke();
  // head
  ctx.beginPath(); ctx.arc(0, -7, 5, 0, TAU);
  ctx.fillStyle = flash ? '#fff' : '#3a2418'; ctx.fill(); ctx.stroke();
  // tricorne
  ctx.beginPath();
  ctx.moveTo(-9, -10);
  ctx.lineTo(9, -10);
  ctx.lineTo(6, -13);
  ctx.lineTo(-6, -13);
  ctx.closePath();
  ctx.fillStyle = flash ? '#fff' : '#1a0e0a'; ctx.fill(); ctx.stroke();
  // eyes — gold
  if (!flash) {
    ctx.shadowColor = '#f5d98a'; ctx.shadowBlur = 4;
    ctx.fillStyle = '#f5d98a';
    ctx.fillRect(-2.5, -7, 1.5, 1.5);
    ctx.fillRect(1, -7, 1.5, 1.5);
    ctx.shadowBlur = 0;
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
};

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
  levelUpOpen = true;
  game.paused = true;
  const choices = buildUpgradeChoices();
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
  recomputeStats();
  game.running = true;
  game.paused = false;
  game.time = 0;
  game.kills = 0;
  game.echoes = 0;
  game.spawnAcc = 0;
  game.bossSpawned = { 1: false, 2: false };
  game.eliteCd = 90;
  enemies.length = 0;
  projectiles.length = 0;
  enemyShots.length = 0;
  aoes.length = 0;
  particles.length = 0;
  damageNumbers.length = 0;
  pickups.length = 0;
  splats.length = 0;
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
  ui.title.classList.remove('hidden');
});

function onVictory() {
  game.running = false;
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

