// Bosses: deterministic attack definitions (every client draws & resolves them from the same
// compact record), leader-side AI with stagger/finisher + elite modifiers, and the boss views (rigged GLTF models).
import * as THREE from 'three';
import { R, rng, ARENAS } from './arenas.js';
import { Actor, modelReady, loadModel } from './models.js';

export const BOSS_BASE_HP = 1600, BOSS_PER_PLAYER = 0.55, BOSS_RADIUS = 3.0;
export const STAGGER_BASE = 100, STAGGER_TIME = 5;
const clampR = (x, z, r) => { const d = Math.hypot(x, z); return d > r ? [x / d * r, z / d * r] : [x, z]; };

// ---------- attacks ----------
// a = {id, t, e(elapsed s), ox, oz, tx, tz, sd(seed), sp(speed mult), ph}
// hits() pushes [subKey, damage, unblockable]
const SZ = a => a.sz || 1;
const T = a => ({ slam: 1.2, sweep: 1.05, charge: 1.0, volley: 0.8, meteors: 1.35, roar: 0.95 })[a.t] / a.sp;
function chargeEnd(a) {
  const dx = a.tx - a.ox, dz = a.tz - a.oz, d = Math.hypot(dx, dz) || 1, L = Math.min(18 * (a.vs || 1), d + 5);
  return clampR(a.ox + dx / d * L, a.oz + dz / d * L, R - 3);
}
function volleyCfg(a) { return { waves: a.ph >= 3 ? 3 : 2, n: a.ph >= 3 ? 14 : 10, speed: 10 * (a.vs || 1) }; }
function meteorList(a) {
  const r = rng(a.sd), n = a.ph >= 3 ? 10 : 7, out = [];
  for (let i = 0; i < n; i++) {
    let x, z;
    if (i === 0) { x = a.tx; z = a.tz; }
    else if (i < n / 2) { const ang = r() * 6.28, d = 3 + r() * 7; x = a.tx + Math.cos(ang) * d; z = a.tz + Math.sin(ang) * d; }
    else { const ang = r() * 6.28, d = r() * (R - 2); x = Math.cos(ang) * d; z = Math.sin(ang) * d; }
    [x, z] = clampR(x, z, R - 1);
    out.push({ x, z, t: T(a) + i * 0.17 });
  }
  return out;
}
export const ATK = {
  slam: {
    dur: a => T(a) + 0.8,
    pos(a, e) { const t = T(a), k = Math.min(1, Math.max(0, (e - t * 0.35) / (t * 0.65))), s = k * k * (3 - 2 * k), dx = a.tx - a.ox, dz = a.tz - a.oz, d = Math.hypot(dx, dz) || 1, stop = Math.max(0, d - 3) / d; return { x: a.ox + dx * stop * s, z: a.oz + dz * stop * s, y: Math.sin(k * Math.PI) * 5 }; },
    hazards(a, e, out) { const t = T(a); if (e < t + 0.15) out.push({ k: 'circle', x: a.tx, z: a.tz, r: 4.4 * SZ(a), p: Math.min(1, e / t), live: e >= t }); },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e0 < t && e1 >= t && Math.hypot(px - a.tx, pz - a.tz) < 4.4 * SZ(a)) out.push([0, 26, false]); },
    impacts(a, e0, e1, cb) { const t = T(a); if (e0 < t && e1 >= t) cb(a.tx, a.tz, 1.4); },
    end(a) { return this.pos(a, 99); },
  },
  sweep: {
    dur: a => T(a) + 0.8,
    hazards(a, e, out) { const t = T(a); if (e < t + 0.15) out.push({ k: 'circle', x: a.ox, z: a.oz, r: 8 * SZ(a), p: Math.min(1, e / t), live: e >= t }); },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e0 < t && e1 >= t && Math.hypot(px - a.ox, pz - a.oz) < 8 * SZ(a)) out.push([0, 20, false]); },
    impacts(a, e0, e1, cb) { const t = T(a); if (e0 < t && e1 >= t) cb(a.ox, a.oz, 0.9); },
  },
  charge: {
    dur: a => T(a) + 0.5 + 0.7,
    pos(a, e) { const t = T(a), [ex, ez] = chargeEnd(a), k = Math.min(1, Math.max(0, (e - t) / 0.5)); return { x: a.ox + (ex - a.ox) * k, z: a.oz + (ez - a.oz) * k, y: 0 }; },
    hazards(a, e, out) { const t = T(a); if (e < t + 0.5) { const [ex, ez] = chargeEnd(a); out.push({ k: 'rect', x0: a.ox, z0: a.oz, x1: ex, z1: ez, w: 4.4 * SZ(a), p: Math.min(1, e / t), live: e >= t, u: true }); } },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e1 >= t && e0 <= t + 0.5) { const p = this.pos(a, e1); if (Math.hypot(px - p.x, pz - p.z) < 3.3 * SZ(a)) out.push([0, 30, true]); } },
    end: a => { const [x, z] = chargeEnd(a); return { x, z }; },
  },
  volley: {
    dur: a => { const c = volleyCfg(a); return T(a) + 0.55 * (c.waves - 1) + 3.2; },
    bolts(a, e, cb) {
      const c = volleyCfg(a), t = T(a);
      for (let w = 0; w < c.waves; w++) {
        const age = e - t - w * 0.55; if (age < 0 || age > 3.2) continue;
        for (let i = 0; i < c.n; i++) { const ang = (i + (w % 2) * 0.5) / c.n * 6.283 + (a.sd % 628) / 100; cb(w * 100 + i, a.ox + Math.cos(ang) * (3 + age * c.speed), a.oz + Math.sin(ang) * (3 + age * c.speed)); }
      }
    },
    hazards(a, e, out) { const t = T(a); if (e < t) out.push({ k: 'circle', x: a.ox, z: a.oz, r: 3.5, p: e / t, live: false }); },
    hits(a, e0, e1, px, pz, out) { this.bolts(a, e1, (k, x, z) => { if (Math.hypot(px - x, pz - z) < 1.0) out.push([k + 1, 12, false]); }); },
  },
  meteors: {
    dur: a => { const m = meteorList(a); return m[m.length - 1].t + 0.6; },
    hazards(a, e, out) { for (const m of meteorList(a)) if (e < m.t + 0.15) out.push({ k: 'circle', x: m.x, z: m.z, r: 2.8 * SZ(a), p: Math.min(1, e / m.t), live: e >= m.t, meteor: (e - (m.t - 0.55)) / 0.55, u: true }); },
    hits(a, e0, e1, px, pz, out) { meteorList(a).forEach((m, i) => { if (e0 < m.t && e1 >= m.t && Math.hypot(px - m.x, pz - m.z) < 2.8 * SZ(a)) out.push([i, 22, true]); }); },
    impacts(a, e0, e1, cb) { for (const m of meteorList(a)) if (e0 < m.t && e1 >= m.t) cb(m.x, m.z, 0.6); },
  },
  roar: {
    dur: () => 2.8,
    ring(a, e) { const t = T(a); return e < t || e > t + 1.6 ? null : 2 + 16 * (e - t); },
    hazards(a, e, out) { const t = T(a); if (e < t) out.push({ k: 'circle', x: a.ox, z: a.oz, r: 4, p: e / t, live: false, u: true }); const rr = this.ring(a, e); if (rr) out.push({ k: 'ring', x: a.ox, z: a.oz, r: rr, u: true }); },
    hits(a, e0, e1, px, pz, out) { const rr = this.ring(a, e1); if (rr && Math.abs(Math.hypot(px - a.ox, pz - a.oz) - rr) < 1.0) out.push([0, 18, true]); },
  },
};
export const atkTele = T;

// ---------- leader-side AI ----------
// Boss HP = mx - sum of every player's cumulative damage this fight (players report totals,
// so dropped/duplicated packets can't desync it). Stagger works the same way.
const sum = o => { let s = 0; for (const k in o) s += o[k]; return s; };
export const lvlHp = (lvl, n) => Math.round(BOSS_BASE_HP * (1 + 0.45 * (lvl - 1)) * (1 + BOSS_PER_PLAYER * Math.max(0, n - 1)));
export const lvlDmg = lvl => 1 + 0.08 * (lvl - 1);
// Elite modifiers: one more every 4 levels (max 4), picked from the fight seed so every client agrees.
export const MODS = {
  enraged: { n: 'Enraged', ic: '🔥', d: 'faster attacks' }, armored: { n: 'Armored', ic: '🛡', d: '+35% HP, harder to stagger' },
  regen: { n: 'Regenerating', ic: '💚', d: 'heals over time' }, volatile: { n: 'Volatile', ic: '☄', d: 'extra projectiles' },
  colossal: { n: 'Colossal', ic: '⛰', d: 'bigger, harder hits' }, swift: { n: 'Swift', ic: '💨', d: 'fast projectiles & charges' },
};
const MOD_KEYS = Object.keys(MODS);
export function pickMods(lvl, seed) {
  const n = Math.min(4, Math.floor((lvl - 1) / 4)), r = rng(seed * 31 + 7), pool = MOD_KEYS.slice(), out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice((r() * pool.length) | 0, 1)[0]);
  return out;
}
const has = (b, m) => b.mods && b.mods.includes(m);
const maxHp = (b, n) => Math.round(lvlHp(b.lvl, n) * (has(b, 'armored') ? 1.35 : 1));
export function newFight(fid, lvl, nPlayers) {
  const b = { fid, lvl, ar: (lvl - 1) % ARENAS.length, mods: pickMods(lvl, lvl * 7919 + fid), st: 'intro', se: 0, mx: 0, hl: 0, dmg: {}, stg: {}, sgBase: 0, sgMax: STAGGER_BASE, sgi: 0, sg: null, x: 0, z: -8, ry: 0, ph: 1, a: null, nid: 1, cd: 2.2, tgt: null, last: null, wipeT: 0 };
  b.mx = maxHp(b, nPlayers); return b;
}
export function bossHp(b) { return Math.max(0, b.mx - sum(b.dmg) + (b.hl || 0)); }
export function staggerVal(b) { return b.sg ? 1 : Math.min(1, Math.max(0, (sum(b.stg) - b.sgBase) / b.sgMax)); }
export function phaseOf(b) { const r = bossHp(b) / b.mx; return r > 0.66 ? 1 : r > 0.33 ? 2 : 3; }
function atkMods(b) { return { sz: has(b, 'colossal') ? 1.25 : 1, dm: has(b, 'colossal') ? 1.15 : 1, vs: has(b, 'swift') ? 1.35 : 1 }; }

// players: [{id, x, z, dead, fin}] active players; pushes event names into ev
export function stepBoss(b, dt, players, ev) {
  b.se += dt;
  const alive = players.filter(p => !p.dead && !p.hid), living = players.filter(p => !p.dead);
  const want = maxHp(b, players.length), L = b.lvl - 1;
  if (b.st !== 'win' && want > b.mx) b.mx = want;
  b.sgMax = Math.round(STAGGER_BASE * (1 + 0.35 * Math.max(0, players.length - 1)) * (has(b, 'armored') ? 1.3 : 1) * (1 + 0.04 * L));
  if (b.st === 'intro') { if (b.se > 3.2) { b.st = 'fight'; b.se = 0; } return; }
  if (b.st === 'win') return; // world advances the level
  if (b.st === 'wipe') { if (b.se > 7) { Object.assign(b, newFight(b.fid + 1, b.lvl, players.length)); ev.push('newfight'); } return; }
  if (bossHp(b) <= 0) { b.st = 'win'; b.se = 0; b.a = null; b.sg = null; ev.push('win'); return; }
  if (players.length && !living.length) { b.wipeT += dt; if (b.wipeT > 2.5) { b.st = 'wipe'; b.se = 0; b.a = null; b.sg = null; ev.push('wipe'); return; } } else b.wipeT = 0;
  if (has(b, 'regen') && !b.sg) b.hl = Math.min(sum(b.dmg), (b.hl || 0) + dt * b.mx * 0.0035);
  // stagger
  if (b.sg) {
    b.sg.t += dt;
    if (b.sg.t > STAGGER_TIME || players.some(p => p.fin === b.sgi)) { b.sg = null; b.sgBase = sum(b.stg); b.cd = 1.2; ev.push('recover'); }
    return;
  }
  if (sum(b.stg) - b.sgBase >= b.sgMax) { b.sgi++; b.sg = { t: 0 }; b.a = null; ev.push('stagger'); return; }
  const ph = phaseOf(b), en = has(b, 'enraged'), sp = (ph === 1 ? 1 : ph === 2 ? 1.12 : 1.28) * Math.min(1.5, 1 + 0.05 * L) * (en ? 1.15 : 1), cdm = Math.max(0.45, 1 - 0.05 * L) * (en ? 0.75 : 1), xph = (L >= 2 ? 1 : 0) + (has(b, 'volatile') ? 1 : 0), am = atkMods(b);
  if (b.a) {
    b.a.e += dt;
    const A = ATK[b.a.t];
    if (b.a.e >= A.dur(b.a)) { if (A.end) { const p = A.end(b.a); b.x = p.x; b.z = p.z; } b.a = null; b.cd = ((ph === 1 ? 1.35 : ph === 2 ? 1.0 : 0.7) + Math.random() * 0.4) * cdm; }
    return;
  }
  if (ph > b.ph) { b.ph = ph; b.a = { id: b.nid++, t: 'roar', e: 0, ox: b.x, oz: b.z, tx: b.x, tz: b.z, sd: (Math.random() * 1e6) | 0, sp, ph: Math.min(3, ph + xph), ...am }; ev.push('phase'); return; }
  let tgt = alive.find(p => p.id === b.tgt);
  if (!tgt || Math.random() < dt * 0.12) { const s = alive.slice().sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z)); tgt = s[Math.random() < 0.7 ? 0 : (Math.random() * s.length) | 0]; b.tgt = tgt && tgt.id; }
  if (!tgt) { b.ry += dt * 0.3; return; }
  const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
  b.ry = Math.atan2(dx, dz); b.cd -= dt;
  if (d > 6) { const v = (ph === 3 ? 4.2 : 3.2) * (en ? 1.2 : 1) * dt; b.x += dx / d * v; b.z += dz / d * v; [b.x, b.z] = clampR(b.x, b.z, R - 3); }
  if (b.cd <= 0) {
    let pool = d < 8.5 ? ['sweep', 'slam', 'slam'] : ['charge', 'slam'];
    if (ph >= 2 || L >= 1) pool = pool.concat(d < 8.5 ? ['volley'] : ['volley', 'meteors']);
    if (ph >= 2 && d >= 8.5) pool.push('meteors');
    if (ph >= 3 || L >= 2) pool.push('meteors', 'charge');
    pool = pool.filter(t => t !== b.last); const t = pool[(Math.random() * pool.length) | 0]; b.last = t;
    b.a = { id: b.nid++, t, e: 0, ox: b.x, oz: b.z, tx: tgt.x, tz: tgt.z, sd: (Math.random() * 1e6) | 0, sp, ph: Math.min(3, ph + xph), ...am };
    ev.push('attack');
  }
}

// ---------- boss views ----------
// Each boss is a rigged, animated GLTF model (see vendor/LICENSES.md) scaled to giant size, with PBR materials,
// a Fresnel rim in the arena accent colour and a few procedural attachments. Attack clips are posed by hand
// so the impact frame lands exactly when the telegraph completes.
const CA = { idle: 'Idle', walk: 'Walk', charge: 'Run', slam: ['Sword_Slash', 0.45], sweep: ['Kick_Right', 0.45], volley: ['Punch_Right', 0.4], meteors: ['Interact', 0.5], roar: ['Interact', 0.45], stagger: ['HitRecieve', 0.5], dead: 'Death' };
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0, ...(o.e != null ? { emissive: new THREE.Color(o.e), emissiveIntensity: o.ei ?? 2 } : {}) });
function attachTo(actor, names, obj, mult = 1) {
  const b = actor.bone(...names); if (!b) return null;
  actor.model.updateMatrixWorld(true); const s = new THREE.Vector3(); b.getWorldScale(s);
  obj.scale.set(obj.scale.x * mult / s.x, obj.scale.y * mult / s.y, obj.scale.z * mult / s.z);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  b.add(obj); return obj;
}
export { attachTo };
function iceClub(theme) { const g = new THREE.Group(), ice = std(0xbff4ff, { r: 0.1, e: theme.accent, ei: 0.9 }); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), ice); c.scale.set(1, 3.2, 1); c.position.y = 0.55; g.add(c); g.rotation.x = Math.PI / 2; for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), ice); s.scale.y = 2.2; s.position.set(Math.cos(i * 1.57) * 0.16, 0.85, Math.sin(i * 1.57) * 0.16); s.rotation.z = Math.cos(i * 1.57) * 0.6; s.rotation.x = -Math.sin(i * 1.57) * 0.6; g.add(s); } return g; }
function stormHammer(theme) { const g = new THREE.Group(), metal = std(0x5a5068, { r: 0.3, m: 1 }), gl = std(0x000000, { e: theme.accent, ei: 3 }); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.2, 8), std(0x3a2a20, { r: 0.8 })); h.position.y = 0.3; g.add(h); const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), metal); head.position.y = 0.9; g.add(head); const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.28), gl); band.position.y = 0.9; g.add(band); g.rotation.x = Math.PI / 2; h.position.y = 0.2; return g; }
function crown(theme) { const g = new THREE.Group(), gold = std(0xc8a050, { r: 0.3, m: 1 }); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), gold); ring.rotation.x = Math.PI / 2; g.add(ring); for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), gold); s.position.set(Math.cos(i * 1.047) * 0.13, 0.06, Math.sin(i * 1.047) * 0.13); g.add(s); } const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), std(0, { e: theme.accent, ei: 4 })); gem.position.set(0, 0.03, 0.14); g.add(gem); return g; }
function eyes(theme, sep = 0.05, size = 0.022, z = 0.1, y = 0.05) { const g = new THREE.Group(), m = std(0, { e: theme.eye, ei: 6 }); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), m); e.position.set(s * sep, y, z); g.add(e); } return g; }

export const BOSS_SPECS = {
  wyrm: { model: 'dragon', height: 7.5, hover: 2.2, chestY: 6, rim: 0xffb060, rimS: 0.35, mul: 0xffe0d0, clips: { idle: 'Flying', walk: 'Flying', charge: 'Flying', chargeSpeed: 2.2, slam: ['Attack', 0.5], sweep: ['Attack2', 0.5], volley: ['Attack2', 0.45], meteors: ['Attack', 0.5], roar: ['Hit', 0.5], stagger: ['Hit', 0.55], dead: 'Death' } },
  giant: { model: 'adventurer', height: 10, chestY: 7, rim: 0x6fe3ff, rimS: 0.45, mul: 0x6a8cb0, clips: CA, extra: (a, th) => attachTo(a, ['WristR', 'HandR'], iceClub(th), 10 / 1.8) },
  titan: { model: 'king', height: 11, chestY: 7.6, rim: 0xb07cff, rimS: 0.6, mul: 0xc0b0e0, metal: 0.5, clips: CA, extra: (a, th) => attachTo(a, ['WristR', 'HandR'], stormHammer(th), 11 / 1.8) },
  tyrant: { model: 'trex', height: 7.5, chestY: 5, rim: 0xffb030, rimS: 0.45, mul: 0xd8b888, clips: { idle: 'Idle', walk: 'Walk', charge: 'Run', slam: ['Jump', 0.6], sweep: ['Attack', 0.5], volley: ['Attack', 0.5], meteors: ['Attack', 0.5], roar: ['Attack', 0.4], stagger: ['Death', 0.18], dead: 'Death' } },
  spider: { model: 'spider', height: 4.6, chestY: 3, rim: 0xb6ff4a, rimS: 0.5, mul: 0x8a8a90, clips: { idle: 'Idle', walk: 'Walk', charge: 'Walk', chargeSpeed: 2.6, slam: ['Jump', 0.6], sweep: ['Attack', 0.5], volley: ['Attack', 0.5], meteors: ['Jump', 0.5], roar: ['Attack', 0.5], stagger: ['Death', 0.25], dead: 'Death' } },
  wolf: { model: 'wolf', height: 6.8, chestY: 4.5, rim: 0xff3040, rimS: 0.4, mul: 0x8a8090, clips: { idle: 'Idle', walk: 'Walk', charge: 'Gallop', chargeSpeed: 1.4, slam: ['Gallop_Jump', 0.55], sweep: ['Attack', 0.5], volley: ['Idle_2_HeadLow', 0.5], meteors: ['Idle_2_HeadLow', 0.5], roar: ['Idle_2_HeadLow', 0.5], stagger: ['Idle_HitReact_Left', 0.5], dead: 'Death' } },
  lich: { model: 'skeleton', height: 9, chestY: 6.5, rim: 0x50ffb0, rimS: 0.4, mul: 0xe8e0c8, clips: { idle: 'Idle', walk: 'Walk', charge: 'Run', slam: ['Sword', 0.5], sweep: ['Sword', 0.5], volley: ['Punch', 0.45], meteors: ['Punch', 0.45], roar: ['Jump', 0.4], stagger: ['HitReact', 0.5], dead: 'Death' }, extra: (a, th) => { attachTo(a, ['Head'], crown(th), 9 / 1.8); } },
};
// elite mini-bosses used by the "minib" quest
export const MINI_SPECS = {
  ghoul: { name: 'Gravecaller Ghoul', model: 'zombie', height: 2.9, chestY: 2, rim: 0x80ff60, rimS: 0.6, mul: 0x90a880, clips: { idle: 'Idle', walk: 'Run', charge: 'Run', slam: ['Punch', 0.5], sweep: ['Punch', 0.5], stagger: ['HitReact', 0.5], dead: 'Death' } },
  reaver: { name: 'Bone Reaver', model: 'skeleton', height: 3.1, chestY: 2.2, rim: 0x60c0ff, rimS: 0.6, mul: 0xd0d0e0, clips: { idle: 'Idle', walk: 'Run', charge: 'Run', slam: ['Sword', 0.5], sweep: ['Sword', 0.5], stagger: ['HitReact', 0.5], dead: 'Death' } },
  stalker: { name: 'Dire Stalker', model: 'wolf', height: 2.6, chestY: 1.6, rim: 0xffa040, rimS: 0.6, mul: 0x8a7a6a, clips: { idle: 'Idle', walk: 'Gallop', charge: 'Gallop', slam: ['Gallop_Jump', 0.55], sweep: ['Attack', 0.5], stagger: ['Idle_HitReact_Left', 0.5], dead: 'Death' } },
};
export const bossModelName = kind => (BOSS_SPECS[kind] || {}).model || null;
export const bossViewReady = kind => kind === 'serpent' || modelReady(bossModelName(kind));

export class ActorBoss {
  constructor(spec, theme) {
    this.spec = spec; this.theme = theme; this.kind = theme.kind;
    this.root = new THREE.Group();
    this.actor = new Actor(spec.model, { height: spec.height, mul: spec.mul, rim: spec.rim, rimS: spec.rimS, rimP: 2.5, metal: spec.metal });
    this.root.add(this.actor.root);
    if (spec.extra) spec.extra(this.actor, theme);
    this.light = new THREE.PointLight(theme.accent, 14, 18, 1.8); this.light.position.set(0, spec.chestY * 0.6, spec.height * 0.45); this.root.add(this.light);
    this.chestY = spec.chestY; this._st = ''; this._dt0 = 0;
  }
  update(dt, t, s) {
    const A = this.actor, C = this.spec.clips;
    if (s.st === 'dead') { if (this._st !== 'dead') this._dt0 = t; A.set(C.dead, (t - this._dt0) * 0.9); }
    else if (s.st === 'stagger') { const [c, f] = C.stagger; A.set(c, A.dur(c) * f + Math.sin(t * 2.5) * 0.04); }
    else if (s.mode === 'charge') { if (s.e < s.T) A.set(C.idle, undefined, 0.5); else A.set(C.charge, undefined, C.chargeSpeed || 1.6); }
    else if (s.mode && C[s.mode]) {
      const [c, h] = C[s.mode], D = A.dur(c), hD = h * D, ts = Math.max(1, hD / Math.max(0.05, s.T)), start = s.T - hD / ts;
      A.set(c, (s.e - start) * ts, 1, 0.12);
    } else if (s.walking) A.set(C.walk, undefined, (C.walkSpeed || 1) * (s.fast ? 1.4 : 1)); else A.set(C.idle);
    this._st = s.st;
    A.update(dt);
    this.actor.root.position.y = this.spec.hover ? this.spec.hover + Math.sin(t * 1.6) * 0.35 : 0;
    A.setRim(null, s.st === 'stagger' ? 1.4 + Math.sin(t * 10) * 0.4 : (this.spec.rimS || 0.6) * (0.85 + (s.phase - 1) * 0.25));
    this.light.intensity = 10 + s.phase * 4 + Math.sin(t * 7) * 2;
  }
  setFlash(v) { this.actor.setFlash(v); }
  dispose() { this.actor.dispose(); }
}

// Vessrath keeps a procedural (but PBR) bone-serpent body: no rigged serpent model was available.
class SerpentBoss {
  constructor(theme) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const skin = std(theme.body, { r: 0.45, m: 0.1 }), bone = std(0xcfc7aa, { r: 0.55 }), glowM = std(0, { e: theme.accent, ei: 2.5 }), eye = std(0, { e: theme.eye, ei: 5 });
    this.mats = [skin, bone]; const add = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
    const segs = [], N = 26;
    for (let i = 0; i < N; i++) {
      const r = 1.3 * (1 - i / N * 0.72), g = new THREE.Group();
      add(g, new THREE.SphereGeometry(r, 16, 12), i % 2 ? skin : bone, 0, 0, 0);
      for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(r * 0.22, r * 0.9, 5), bone, s * r * 0.75, r * 0.5, 0).rotation.z = -s * 0.7;
      add(g, new THREE.ConeGeometry(r * 0.28, r * 1.1, 5), glowM, 0, r * 0.95, 0);
      body.add(g); segs.push(g);
    }
    const head = new THREE.Group(); body.add(head);
    const skull = add(head, new THREE.SphereGeometry(1, 18, 14), bone, 0, 0.1, 0.5); skull.scale.set(0.95, 0.65, 1.55);
    const snout = add(head, new THREE.BoxGeometry(1.1, 0.5, 1.4), bone, 0, -0.05, 1.7);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.35, -0.2); head.add(jaw);
    const j = add(jaw, new THREE.BoxGeometry(1.2, 0.3, 2.4), skin, 0, 0, 1.2);
    for (const s of [-1, 1]) { add(head, new THREE.SphereGeometry(0.18, 10, 8), eye, s * 0.55, 0.35, 1.25); const h = add(head, new THREE.ConeGeometry(0.2, 1.8, 6), glowM, s * 0.55, 0.75, -0.4); h.rotation.x = -1.0; h.rotation.z = -s * 0.3; }
    for (let i = 0; i < 6; i++) { const f = add(head, new THREE.ConeGeometry(0.07, 0.5, 4), bone, -0.45 + i * 0.18, -0.45, 2.1); f.rotation.x = Math.PI; }
    this.light = new THREE.PointLight(theme.accent, 14, 20, 1.8); this.light.position.set(0, 5, 3); root.add(this.light);
    Object.assign(this, { kind: 'serpent', root, body, head, jaw, segs, chestY: 6, headPos: new THREE.Vector3(0, 7, 2.5) });
  }
  update(dt, t, s) {
    const ease = x => x * x * (3 - 2 * x), k = s.T ? s.e / s.T : 0, after = s.mode ? s.e - s.T : -1, mode = s.mode, st = s.st;
    let hy = 7 + Math.sin(t * 1.6) * 0.6, hz = 2.5, hx = Math.sin(t * 1.1) * 0.8, jaw = 0.15 + Math.sin(t * 3) * 0.05, pitch = 0.2;
    if (st === 'stagger') { hy = 1.6; hz = 5; pitch = 0.6; jaw = 0.5; }
    else if (st === 'dead') { hy = 0.9; hz = 6; pitch = 0.3; jaw = 0.7; }
    else if (mode === 'slam' || mode === 'charge') { const q = ease(Math.min(1, k)); hy = 7 + 3 * q; hz = 1 - 1.5 * q; pitch = -0.4 * q; jaw = 0.6 * q; if (after > 0) { const r = Math.min(1, after / 0.15); hy = 10 - 8.5 * r; hz = -0.5 + 6.5 * r; pitch = 0.9 * r; } }
    else if (mode === 'sweep') { const q = ease(Math.min(1, k)); hy = 4; hx = -4 * q; if (after > 0) hx = -4 + Math.min(1, after / 0.25) * 8; }
    else if (mode) { const q = ease(Math.min(1, k)); hy = 7 + 3 * q; pitch = -0.6 * q; jaw = 0.2 + 0.7 * q; }
    this.headPos.lerp(new THREE.Vector3(hx, hy, hz), Math.min(1, dt * 11));
    this.head.position.copy(this.headPos); this.head.rotation.set(pitch, 0, 0); this.jaw.rotation.x = jaw;
    const N = this.segs.length;
    for (let i = 0; i < N; i++) {
      const u = (i + 1) / N; let x, y, z;
      if (u < 0.45) { const v = u / 0.45; x = this.headPos.x * (1 - v); y = this.headPos.y * (1 - v) + 0.9 * v; z = this.headPos.z * (1 - v) - 0.5 * v; y += Math.sin(v * Math.PI) * 0.8; }
      else { const v = (u - 0.45) / 0.55, ang = v * Math.PI * 1.6 + t * 0.6 * (s.walking ? 2 : 1); x = Math.sin(ang) * (2.5 + v * 2); z = -1 - Math.cos(ang) * (2.5 + v * 2) * 0.7; y = 0.9 - v * 0.3; }
      this.segs[i].position.set(x, y, z);
    }
    this.light.intensity = 10 + s.phase * 4 + Math.sin(t * 7) * 2;
  }
  setFlash(v) { for (const m of this.mats) m.emissive.setRGB(v * 0.5, v * 0.25, v * 0.2); }
  dispose() {}
}
export function createBossView(theme) {
  if (theme.kind === 'serpent') return new SerpentBoss(theme);
  const spec = BOSS_SPECS[theme.kind]; if (!spec) return null; if (!modelReady(spec.model)) { loadModel(spec.model); return null; }
  return new ActorBoss(spec, theme);
}
export function createMiniView(kind) {
  const spec = MINI_SPECS[kind]; if (!spec) return null; if (!modelReady(spec.model)) { loadModel(spec.model); return null; }
  return new ActorBoss(spec, { kind, accent: spec.rim, eye: 0xffffff });
}
