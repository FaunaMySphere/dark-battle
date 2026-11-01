// Bosses: deterministic attack definitions (every client draws & resolves them from the same
// compact record), leader-side AI with stagger/finisher, and four procedural giant models.
import * as THREE from 'three';
import { R, rng } from './arenas.js';

export const BOSS_BASE_HP = 1600, BOSS_PER_PLAYER = 0.55, BOSS_RADIUS = 3.0;
export const STAGGER_BASE = 100, STAGGER_TIME = 5;
const clampR = (x, z, r) => { const d = Math.hypot(x, z); return d > r ? [x / d * r, z / d * r] : [x, z]; };

// ---------- attacks ----------
// a = {id, t, e(elapsed s), ox, oz, tx, tz, sd(seed), sp(speed mult), ph}
// hits() pushes [subKey, damage, unblockable]
const T = a => ({ slam: 1.2, sweep: 1.05, charge: 1.0, volley: 0.8, meteors: 1.35, roar: 0.95 })[a.t] / a.sp;
function chargeEnd(a) {
  const dx = a.tx - a.ox, dz = a.tz - a.oz, d = Math.hypot(dx, dz) || 1, L = Math.min(18, d + 5);
  return clampR(a.ox + dx / d * L, a.oz + dz / d * L, R - 3);
}
function volleyCfg(a) { return { waves: a.ph >= 3 ? 3 : 2, n: a.ph >= 3 ? 14 : 10, speed: 10 }; }
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
    hazards(a, e, out) { const t = T(a); if (e < t + 0.15) out.push({ k: 'circle', x: a.tx, z: a.tz, r: 4.4, p: Math.min(1, e / t), live: e >= t }); },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e0 < t && e1 >= t && Math.hypot(px - a.tx, pz - a.tz) < 4.4) out.push([0, 26, false]); },
    impacts(a, e0, e1, cb) { const t = T(a); if (e0 < t && e1 >= t) cb(a.tx, a.tz, 1.4); },
    end(a) { return this.pos(a, 99); },
  },
  sweep: {
    dur: a => T(a) + 0.8,
    hazards(a, e, out) { const t = T(a); if (e < t + 0.15) out.push({ k: 'circle', x: a.ox, z: a.oz, r: 8, p: Math.min(1, e / t), live: e >= t }); },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e0 < t && e1 >= t && Math.hypot(px - a.ox, pz - a.oz) < 8) out.push([0, 20, false]); },
    impacts(a, e0, e1, cb) { const t = T(a); if (e0 < t && e1 >= t) cb(a.ox, a.oz, 0.9); },
  },
  charge: {
    dur: a => T(a) + 0.5 + 0.7,
    pos(a, e) { const t = T(a), [ex, ez] = chargeEnd(a), k = Math.min(1, Math.max(0, (e - t) / 0.5)); return { x: a.ox + (ex - a.ox) * k, z: a.oz + (ez - a.oz) * k, y: 0 }; },
    hazards(a, e, out) { const t = T(a); if (e < t + 0.5) { const [ex, ez] = chargeEnd(a); out.push({ k: 'rect', x0: a.ox, z0: a.oz, x1: ex, z1: ez, w: 4.4, p: Math.min(1, e / t), live: e >= t, u: true }); } },
    hits(a, e0, e1, px, pz, out) { const t = T(a); if (e1 >= t && e0 <= t + 0.5) { const p = this.pos(a, e1); if (Math.hypot(px - p.x, pz - p.z) < 3.3) out.push([0, 30, true]); } },
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
    hazards(a, e, out) { for (const m of meteorList(a)) if (e < m.t + 0.15) out.push({ k: 'circle', x: m.x, z: m.z, r: 2.8, p: Math.min(1, e / m.t), live: e >= m.t, meteor: (e - (m.t - 0.55)) / 0.55, u: true }); },
    hits(a, e0, e1, px, pz, out) { meteorList(a).forEach((m, i) => { if (e0 < m.t && e1 >= m.t && Math.hypot(px - m.x, pz - m.z) < 2.8) out.push([i, 22, true]); }); },
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
export const lvlDmg = lvl => 1 + 0.1 * (lvl - 1);
export function newFight(fid, lvl, nPlayers) {
  return { fid, lvl, ar: (lvl - 1) % 4, st: 'intro', se: 0, mx: lvlHp(lvl, nPlayers), dmg: {}, stg: {}, sgBase: 0, sgMax: STAGGER_BASE, sgi: 0, sg: null, x: 0, z: -8, ry: 0, ph: 1, a: null, nid: 1, cd: 2.2, tgt: null, last: null, wipeT: 0 };
}
export function bossHp(b) { return Math.max(0, b.mx - sum(b.dmg)); }
export function staggerVal(b) { return b.sg ? 1 : Math.min(1, Math.max(0, (sum(b.stg) - b.sgBase) / b.sgMax)); }
export function phaseOf(b) { const r = bossHp(b) / b.mx; return r > 0.66 ? 1 : r > 0.33 ? 2 : 3; }

// players: [{id, x, z, dead, fin}] active players; pushes event names into ev
export function stepBoss(b, dt, players, ev) {
  b.se += dt;
  const alive = players.filter(p => !p.dead && !p.hid), living = players.filter(p => !p.dead);
  const want = lvlHp(b.lvl, players.length), L = b.lvl - 1;
  if (b.st !== 'win' && want > b.mx) b.mx = want;
  b.sgMax = Math.round(STAGGER_BASE * (1 + 0.35 * Math.max(0, players.length - 1)));
  if (b.st === 'intro') { if (b.se > 3.2) { b.st = 'fight'; b.se = 0; } return; }
  if (b.st === 'win') return; // world advances the level
  if (b.st === 'wipe') { if (b.se > 7) { Object.assign(b, newFight(b.fid + 1, b.lvl, players.length)); ev.push('newfight'); } return; }
  if (bossHp(b) <= 0) { b.st = 'win'; b.se = 0; b.a = null; b.sg = null; ev.push('win'); return; }
  if (players.length && !living.length) { b.wipeT += dt; if (b.wipeT > 2.5) { b.st = 'wipe'; b.se = 0; b.a = null; b.sg = null; ev.push('wipe'); return; } } else b.wipeT = 0;
  // stagger
  if (b.sg) {
    b.sg.t += dt;
    if (b.sg.t > STAGGER_TIME || players.some(p => p.fin === b.sgi)) { b.sg = null; b.sgBase = sum(b.stg); b.cd = 1.2; ev.push('recover'); }
    return;
  }
  if (sum(b.stg) - b.sgBase >= b.sgMax) { b.sgi++; b.sg = { t: 0 }; b.a = null; ev.push('stagger'); return; }
  const ph = phaseOf(b), sp = (ph === 1 ? 1 : ph === 2 ? 1.12 : 1.28) * Math.min(1.5, 1 + 0.07 * L), cdm = Math.max(0.5, 1 - 0.07 * L);
  if (b.a) {
    b.a.e += dt;
    const A = ATK[b.a.t];
    if (b.a.e >= A.dur(b.a)) { if (A.end) { const p = A.end(b.a); b.x = p.x; b.z = p.z; } b.a = null; b.cd = ((ph === 1 ? 1.35 : ph === 2 ? 1.0 : 0.7) + Math.random() * 0.4) * cdm; }
    return;
  }
  if (ph > b.ph) { b.ph = ph; b.a = { id: b.nid++, t: 'roar', e: 0, ox: b.x, oz: b.z, tx: b.x, tz: b.z, sd: (Math.random() * 1e6) | 0, sp, ph: Math.min(3, ph + (L >= 2 ? 1 : 0)) }; ev.push('phase'); return; }
  let tgt = alive.find(p => p.id === b.tgt);
  if (!tgt || Math.random() < dt * 0.12) { const s = alive.slice().sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z)); tgt = s[Math.random() < 0.7 ? 0 : (Math.random() * s.length) | 0]; b.tgt = tgt && tgt.id; }
  if (!tgt) { b.ry += dt * 0.3; return; }
  const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
  b.ry = Math.atan2(dx, dz); b.cd -= dt;
  if (d > 6) { const v = (ph === 3 ? 4.2 : 3.2) * dt; b.x += dx / d * v; b.z += dz / d * v; [b.x, b.z] = clampR(b.x, b.z, R - 3); }
  if (b.cd <= 0) {
    let pool = d < 8.5 ? ['sweep', 'slam', 'slam'] : ['charge', 'slam'];
    if (ph >= 2 || L >= 1) pool = pool.concat(d < 8.5 ? ['volley'] : ['volley', 'meteors']);
    if (ph >= 2 && d >= 8.5) pool.push('meteors');
    if (ph >= 3 || L >= 2) pool.push('meteors', 'charge');
    pool = pool.filter(t => t !== b.last); const t = pool[(Math.random() * pool.length) | 0]; b.last = t;
    b.a = { id: b.nid++, t, e: 0, ox: b.x, oz: b.z, tx: tgt.x, tz: tgt.z, sd: (Math.random() * 1e6) | 0, sp, ph: Math.min(3, ph + (L >= 2 ? 1 : 0)) };
    ev.push('attack');
  }
}

// ---------- models ----------
const add = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
function mats(theme) {
  return {
    skin: new THREE.MeshLambertMaterial({ color: theme.body, emissive: new THREE.Color(0) }),
    armor: new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.body).multiplyScalar(1.9), emissive: new THREE.Color(0) }),
    glow: new THREE.MeshBasicMaterial({ color: theme.accent }),
    eye: new THREE.MeshBasicMaterial({ color: theme.eye }),
  };
}
export function buildBossModel(theme) { return theme.kind === 'serpent' ? buildSerpent(theme) : buildHumanoid(theme); }

function buildHumanoid(theme) {
  const k = theme.kind, M = mats(theme), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const legs = [];
  for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(0.7 * s, 2.0, 0); body.add(hip); add(hip, new THREE.CylinderGeometry(0.45, 0.34, 2.0, 7), M.skin, 0, -1.0, 0); add(hip, new THREE.BoxGeometry(0.85, 0.38, 1.15), M.armor, 0, -1.95, 0.15); legs.push(hip); }
  const torso = new THREE.Group(); torso.position.y = 2.1; body.add(torso);
  add(torso, new THREE.CylinderGeometry(k === 'giant' ? 1.45 : 1.25, 0.85, 2.3, 8), M.skin, 0, 1.15, 0);
  const core = add(torso, new THREE.IcosahedronGeometry(0.42, 0), M.glow, 0, 1.4, k === 'giant' ? 1.1 : 0.95);
  add(torso, new THREE.BoxGeometry(3.0, 0.5, 1.35), M.armor, 0, 2.25, 0);
  const head = new THREE.Group(); head.position.y = 2.75; torso.add(head);
  add(head, new THREE.BoxGeometry(0.95, 0.9, 0.95), M.skin, 0, 0.45, 0.05);
  add(head, new THREE.BoxGeometry(0.8, 0.13, 0.2), M.eye, 0, 0.55, 0.53);
  if (k === 'demon') {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const sp = add(torso, new THREE.ConeGeometry(0.16, 0.9 - i * 0.15, 5), M.glow, s * (1.05 + i * 0.22), 2.75 - i * 0.12, -0.1); sp.rotation.z = -s * (0.35 + i * 0.25); }
    for (const s of [-1, 1]) { const h = add(head, new THREE.ConeGeometry(0.17, 1.5, 6), M.armor, s * 0.45, 1.15, 0); h.rotation.z = -s * 0.55; const h2 = add(head, new THREE.ConeGeometry(0.1, 0.7, 5), M.glow, s * 0.9, 1.75, 0); h2.rotation.z = -s * 1.1; }
    for (let i = 0; i < 5; i++) { const w = add(torso, new THREE.ConeGeometry(0.25, 1.6 + i * 0.2, 4), M.armor, (i - 2) * 0.5, 1.8, -0.9); w.rotation.x = -0.9; }
  } else if (k === 'giant') {
    const beard = add(head, new THREE.ConeGeometry(0.55, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0xd8e8f4 }), 0, -0.25, 0.4); beard.rotation.x = Math.PI + 0.25;
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, c = add(head, new THREE.OctahedronGeometry(0.22, 0), M.glow, Math.cos(a) * 0.5, 1.05, Math.sin(a) * 0.5); c.scale.y = 2.2; }
    for (const s of [-1, 1]) add(torso, new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshLambertMaterial({ color: 0x9fb8cc }), s * 1.5, 2.4, 0).scale.y = 0.7;
  } else { // titan
    const halo = add(head, new THREE.TorusGeometry(1.1, 0.07, 6, 28), M.glow, 0, 0.9, -0.5);
    halo.userData.spin = true;
    for (let i = 0; i < 5; i++) { const sp = add(head, new THREE.ConeGeometry(0.1, 0.8, 4), M.armor, (i - 2) * 0.2, 1.1 + (2 - Math.abs(i - 2)) * 0.12, 0); }
    for (const s of [-1, 1]) { const pad = add(torso, new THREE.BoxGeometry(1.2, 0.35, 1.5), M.armor, s * 1.7, 2.6, 0); pad.rotation.z = -s * 0.3; }
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(1.6 * s, 2.0, 0); torso.add(sh);
    add(sh, new THREE.SphereGeometry(0.55, 8, 6), M.armor, 0, 0, 0);
    add(sh, new THREE.CylinderGeometry(0.36, 0.3, 1.3, 7), M.skin, 0, -0.65, 0);
    const el = new THREE.Group(); el.position.y = -1.3; sh.add(el);
    add(el, new THREE.CylinderGeometry(0.32, 0.45, 1.3, 7), M.skin, 0, -0.65, 0);
    add(el, new THREE.DodecahedronGeometry(0.58, 0), M.armor, 0, -1.45, 0);
    if (k === 'titan' && s > 0) { // giant hammer
      add(el, new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), M.armor, 0, -1.5, 0.6).rotation.x = Math.PI / 2;
      add(el, new THREE.BoxGeometry(1.4, 1.0, 1.0), M.armor, 0, -1.5, 2.2);
      add(el, new THREE.BoxGeometry(1.5, 0.15, 1.1), M.glow, 0, -1.5, 2.2);
    } else if (k === 'giant' && s > 0) { // ice club
      const c = add(el, new THREE.OctahedronGeometry(0.7, 0), M.glow, 0, -2.6, 0); c.scale.y = 2.4;
    } else for (let i = 0; i < 3; i++) { const c = add(el, new THREE.ConeGeometry(0.08, 0.6, 4), M.glow, (i - 1) * 0.22, -1.95, 0.2); c.rotation.x = Math.PI; }
    arms.push({ sh, el });
  }
  const light = new THREE.PointLight(theme.accent, 30, 22, 1.5); light.position.set(0, 5, 2); root.add(light);
  const scale = k === 'giant' ? 2.0 : k === 'titan' ? 1.95 : 1.8;
  body.scale.setScalar(scale);
  return { kind: k, root, body, torso, head, arms, legs, core, skin: M.skin, armor: M.armor, light, scale, chestY: 3.6 * scale };
}

function buildSerpent(theme) {
  const M = mats(theme), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bone = new THREE.MeshLambertMaterial({ color: 0xcfc7aa, emissive: new THREE.Color(0) });
  const segs = [], N = 22;
  for (let i = 0; i < N; i++) {
    const r = 1.25 * (1 - i / N * 0.7), g = new THREE.Group();
    add(g, new THREE.SphereGeometry(r, 9, 7), i % 2 ? M.skin : bone, 0, 0, 0);
    const sp = add(g, new THREE.ConeGeometry(r * 0.3, r * 1.2, 4), M.glow, 0, r * 0.9, 0);
    body.add(g); segs.push(g);
  }
  const head = new THREE.Group(); body.add(head);
  add(head, new THREE.BoxGeometry(1.6, 1.1, 2.6), bone, 0, 0, 0.6);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.45, -0.3); head.add(jaw);
  add(jaw, new THREE.BoxGeometry(1.4, 0.35, 2.4), M.skin, 0, 0, 0.9);
  for (const s of [-1, 1]) { add(head, new THREE.SphereGeometry(0.2, 6, 5), M.eye, s * 0.62, 0.35, 1.3); const h = add(head, new THREE.ConeGeometry(0.2, 1.6, 5), M.glow, s * 0.55, 0.7, -0.4); h.rotation.x = -1.0; h.rotation.z = -s * 0.3; }
  for (let i = 0; i < 4; i++) { const f = add(head, new THREE.ConeGeometry(0.09, 0.5, 4), M.eye, -0.5 + i * 0.33, -0.6, 1.7); f.rotation.x = Math.PI; }
  const core = segs[3].children[0];
  const light = new THREE.PointLight(theme.accent, 30, 22, 1.5); light.position.set(0, 5, 2); root.add(light);
  return { kind: 'serpent', root, body, head, jaw, segs, core: head, skin: M.skin, armor: bone, light, scale: 1, chestY: 6, headPos: new THREE.Vector3() };
}

// procedural animation. mode: attack type or '' ; k: telegraph progress 0..1 ; after: s since tele ; st: 'stagger'|'dead'|...
export function animateBoss(m, t, mode, k, after, walking, phase, st) {
  if (m.kind === 'serpent') return animateSerpent(m, t, mode, k, after, walking, phase, st);
  const ease = x => x * x * (3 - 2 * x);
  const [L, Rr] = m.arms; let ls = 0.1, rs = 0.1, le = -0.2, re = -0.2, lean = 0, headX = 0, armOut = 0.15, kneel = 0;
  m.body.position.y = Math.sin(t * 2) * 0.1;
  if (walking) { const w = Math.sin(t * 5.5); m.legs[0].rotation.x = w * 0.5; m.legs[1].rotation.x = -w * 0.5; ls = -w * 0.4; rs = w * 0.4; }
  else { m.legs[0].rotation.x *= 0.85; m.legs[1].rotation.x *= 0.85; }
  if (st === 'stagger') { kneel = 1; lean = 0.6; headX = 0.4; ls = rs = 0.5; armOut = 0.6; }
  else if (st === 'dead') { kneel = 1.4; lean = 1.2; headX = 0.7; ls = rs = 1.0; }
  else if (mode === 'slam') { const q = ease(Math.min(1, k)); ls = rs = -2.8 * q; le = re = -0.3; if (after > 0) { const r = Math.min(1, after / 0.15); ls = rs = -2.8 + 3.6 * r; lean = 0.4 * r; } }
  else if (mode === 'sweep') { const q = ease(Math.min(1, k)); m.torso.rotation.y = -1.2 * q; rs = -1.4 * q; armOut = 1.2 * q; if (after > 0) m.torso.rotation.y = -1.2 + Math.min(1, after / 0.2) * 3.4; }
  else if (mode === 'charge') { const q = ease(Math.min(1, k)); lean = 0.55 * q; ls = rs = 0.9 * q; headX = -0.3 * q; }
  else if (mode === 'volley') { const q = ease(Math.min(1, k)); armOut = 1.4 * q; ls = rs = -0.4 * q; }
  else if (mode === 'meteors') { const q = ease(Math.min(1, k)); ls = rs = -3.0 * q; armOut = 0.5 * q; headX = -0.5 * q; }
  else if (mode === 'roar') { const q = ease(Math.min(1, k)); lean = -0.35 * q; headX = -0.6 * q; armOut = 1.1 * q; ls = rs = -0.6 * q; }
  if (mode !== 'sweep') m.torso.rotation.y *= 0.85;
  m.body.position.y -= kneel * 1.6 * m.scale / 2;
  m.legs[0].rotation.x += kneel * -1.2 * 0.3; m.legs[1].rotation.x += kneel * 0.3 * 0.3;
  L.sh.rotation.x += (ls - L.sh.rotation.x) * 0.3; Rr.sh.rotation.x += (rs - Rr.sh.rotation.x) * 0.3;
  L.sh.rotation.z += (armOut - L.sh.rotation.z) * 0.3; Rr.sh.rotation.z += (-armOut - Rr.sh.rotation.z) * 0.3;
  L.el.rotation.x = le; Rr.el.rotation.x = re;
  m.torso.rotation.x += (lean - m.torso.rotation.x) * 0.25; m.head.rotation.x += (headX - m.head.rotation.x) * 0.25;
  const pulse = 1 + Math.sin(t * (phase === 3 ? 10 : 4)) * 0.15 + (phase - 1) * 0.15;
  m.core.scale.setScalar(pulse); m.core.rotation.y = t * 2;
  m.head.traverse(o => { if (o.userData.spin) o.rotation.z = t * 1.5; });
  m.light.intensity = 24 + phase * 6 + Math.sin(t * 7) * 4;
}

function animateSerpent(m, t, mode, k, after, walking, phase, st) {
  const ease = x => x * x * (3 - 2 * x);
  // head target in local space (boss faces +z)
  let hy = 7 + Math.sin(t * 1.6) * 0.6, hz = 2.5, hx = Math.sin(t * 1.1) * 0.8, jaw = 0.15 + Math.sin(t * 3) * 0.05, pitch = 0.2;
  if (st === 'stagger') { hy = 1.6; hz = 5; pitch = 0.6; jaw = 0.5; }
  else if (st === 'dead') { hy = 0.9; hz = 6; pitch = 0.3; jaw = 0.7; }
  else if (mode === 'slam' || mode === 'charge') { const q = ease(Math.min(1, k)); hy = 7 + 3 * q; hz = 1 - 1.5 * q; pitch = -0.4 * q; jaw = 0.6 * q; if (after > 0) { const r = Math.min(1, after / 0.15); hy = 10 - 8.5 * r; hz = -0.5 + 6.5 * r; pitch = 0.9 * r; } }
  else if (mode === 'sweep') { const q = ease(Math.min(1, k)); hy = 4; hx = -4 * q; if (after > 0) hx = -4 + Math.min(1, after / 0.25) * 8; }
  else if (mode === 'volley' || mode === 'roar' || mode === 'meteors') { const q = ease(Math.min(1, k)); hy = 7 + 3 * q; pitch = -0.6 * q; jaw = 0.2 + 0.7 * q; }
  m.headPos.lerp(new THREE.Vector3(hx, hy, hz), 0.18);
  m.head.position.copy(m.headPos); m.head.rotation.set(pitch, 0, 0); m.jaw.rotation.x = jaw;
  // body: from head down to ground then coil behind
  const N = m.segs.length;
  for (let i = 0; i < N; i++) {
    const u = (i + 1) / N; let x, y, z;
    if (u < 0.45) { const v = u / 0.45; x = m.headPos.x * (1 - v); y = m.headPos.y * (1 - v) + 0.8 * v; z = m.headPos.z * (1 - v) - 0.5 * v; y += Math.sin(v * Math.PI) * 0.8; }
    else { const v = (u - 0.45) / 0.55, ang = v * Math.PI * 1.6 + t * 0.6 * (walking ? 2 : 1); x = Math.sin(ang) * (2.5 + v * 2); z = -1 - Math.cos(ang) * (2.5 + v * 2) * 0.7; y = 0.8 - v * 0.3; }
    m.segs[i].position.set(x, y, z);
  }
  m.light.intensity = 24 + phase * 6 + Math.sin(t * 7) * 4;
}
