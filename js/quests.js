// Quests: every stage (sky hub, then the arena before the boss wakes) rolls a random set of quests from the level
// seed. All are simulated by the room leader inside the shared world record W, so everyone sees the same state.
import { R, rng } from './arenas.js';
import { ATK, MINI_SPECS } from './boss.js';

export const RUNE_N = 5, RUNE_R = 6.5, PLATE_R = 1.3, ESCORT_NEAR = 5.5, DEFEND_R = 4, DEFEND_TIME = 20, HUNT_TIME = 45, WISP_R = 1.6;
export const QUEST_INFO = {
  shrines: { ic: '⛩', n: 'Awaken the shrines' }, orbs: { ic: '🔹', n: 'Gather the sky-orbs' }, relics: { ic: '💠', n: 'Claim the relics' },
  runes: { ic: '🔣', n: 'Rune lock' }, escort: { ic: '🏮', n: 'Escort the Lantern Spirit' }, defend: { ic: '🛡', n: 'Hold the ward circle' },
  hunt: { ic: '✨', n: 'Wisp hunt' }, minib: { ic: '💀', n: 'Slay the elite' },
};
const pick = (r, pool, n) => { const p = pool.slice(), out = []; for (let i = 0; i < n && p.length; i++) out.push(p.splice((r() * p.length) | 0, 1)[0]); return out; };
export const runePos = i => { const a = i / RUNE_N * Math.PI * 2 + 0.31; return { x: Math.cos(a) * RUNE_R, z: Math.sin(a) * RUNE_R }; };
export function escortPos(q, p = q.p) {
  const ax = Math.cos(q.a) * (R - 3), az = Math.sin(q.a) * (R - 3), cx = -Math.sin(q.a) * q.off, cz = Math.cos(q.a) * q.off, u = 1 - p;
  return { x: u * u * ax + 2 * u * p * cx - p * p * ax, z: u * u * az + 2 * u * p * cz - p * p * az };
}
export function wispPos(q, i) {
  const s = R - 5, x = Math.sin(q.c * (0.23 + 0.05 * (i % 3)) + i * 2.1 + q.sd) * s, z = Math.sin(q.c * (0.17 + 0.04 * (i % 4)) + i * 1.3 + q.sd * 0.7) * s;
  return { x, z, y: 1.3 + Math.sin(q.c * 2 + i) * 0.4 };
}
export const miniHp = q => Math.max(0, q.mx - Object.values(q.dmg).reduce((a, b) => a + b, 0));

export function makeQuests(W, stage) {
  const r = rng(W.seed * 13 + W.lvl * 101 + (stage === 'hub' ? 1 : 2)), L = W.lvl, list = [];
  W.qid = W.qid || 1;
  const add = t => { const q = { id: W.qid++, t, done: 0 }; init(q, r, W); list.push(q); };
  if (stage === 'hub') { add('shrines'); if (L === 1) add('orbs'); else pick(r, ['orbs', 'runes', 'escort', 'hunt', 'defend'], L >= 6 ? 3 : L >= 3 ? 2 : 1).forEach(add); }
  else { if (L === 1) add('relics'); else pick(r, ['relics', 'defend', 'minib', 'hunt', 'escort', 'runes'], L >= 7 ? 3 : L >= 4 ? 2 : 1).forEach(add); }
  return list;
}
function init(q, r, W) {
  const L = W.lvl;
  if (q.t === 'runes') { const o = [0, 1, 2, 3, 4]; for (let i = 4; i > 0; i--) { const j = (r() * (i + 1)) | 0; [o[i], o[j]] = [o[j], o[i]]; } Object.assign(q, { ord: o, k: 0, occ: 0, err: 0 }); }
  else if (q.t === 'escort') Object.assign(q, { a: r() * 6.283, off: (r() - 0.5) * 16, p: 0 });
  else if (q.t === 'defend') { const a = [0.52, 2.62, 4.71][(r() * 3) | 0], d = 9 + r() * 3; Object.assign(q, { x: +(Math.cos(a) * d).toFixed(2), z: +(Math.sin(a) * d).toFixed(2), p: 0, m: [], nid: 1, cd: 2 }); }
  else if (q.t === 'hunt') Object.assign(q, { n: Math.min(9, 4 + Math.floor(L / 2)), got: 0, tm: HUNT_TIME, c: 0, sd: +(r() * 6).toFixed(2) });
  else if (q.t === 'minib') { const kinds = Object.keys(MINI_SPECS), a = r() * 6.283; Object.assign(q, { kind: kinds[(r() * kinds.length) | 0], x: Math.cos(a) * 11, z: Math.sin(a) * 11, ry: 0, mx: 0, dmg: {}, a: null, cd: 3, nid: 1, dt: -1 }); }
}
export function questLabel(q, W, cnt) {
  const I = QUEST_INFO[q.t]; let txt = I.n, p = 0;
  if (q.t === 'shrines') { const n = W.sh.filter(v => v >= 1).length; txt += ` (${n}/3)`; p = W.sh.reduce((a, b) => a + b, 0) / 3; }
  else if (q.t === 'orbs' || q.t === 'relics') { const [g, n] = cnt(q.t); txt += ` (${g}/${n})`; p = g / n; }
  else if (q.t === 'runes') { txt += ` — step on plates in the tablet's order (${q.k}/${RUNE_N})`; p = q.k / RUNE_N; if (q.err > 0) txt = '❌ Wrong rune — sequence reset'; }
  else if (q.t === 'escort') { txt += ` — stay near it (${Math.round(q.p * 100)}%)`; p = q.p; }
  else if (q.t === 'defend') { txt += ` vs shades (${Math.round(q.p * 100)}%)`; p = q.p; }
  else if (q.t === 'hunt') { const g = bits(q.got); txt += ` ${g}/${q.n} · ${Math.ceil(q.tm)}s`; p = g / q.n; }
  else if (q.t === 'minib') { txt = `Slay ${MINI_SPECS[q.kind].name}` + (q.mx ? ` (${Math.round(miniHp(q) / q.mx * 100)}% HP)` : ''); p = q.mx ? 1 - miniHp(q) / q.mx : 0; }
  return { ic: I.ic, txt, p: q.done ? 1 : p, done: !!q.done };
}
export const bits = n => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };

// leader-side simulation; players: [{id,x,z,dead,kl:[minion ids], qd:{qid:dmg}}]
export function stepQuests(W, dt, players, ev, eaPrev) {
  const live = players.filter(p => !p.dead), L = W.lvl;
  for (const q of W.q) {
    if (q.done) continue;
    if (q.t === 'runes') {
      q.err = Math.max(0, q.err - dt); let occ = 0;
      for (let i = 0; i < RUNE_N; i++) { const s = runePos(i); if (live.some(p => Math.hypot(p.x - s.x, p.z - s.z) < PLATE_R)) occ |= 1 << i; }
      const rise = occ & ~q.occ; q.occ = occ;
      if (q.err <= 0) for (let i = 0; i < RUNE_N; i++) if (rise & (1 << i)) {
        if (i === q.ord[q.k]) { q.k++; ev.push('rune'); if (q.k >= RUNE_N) { q.done = 1; ev.push('quest'); } }
        else if (!q.ord.slice(0, q.k).includes(i)) { q.k = 0; q.err = 1.5; ev.push('runeFail'); }
      }
    } else if (q.t === 'escort') {
      const s = escortPos(q);
      if (live.some(p => Math.hypot(p.x - s.x, p.z - s.z) < ESCORT_NEAR)) q.p = Math.min(1, q.p + dt / 32);
      if (W.ea && ATK[W.ea.t] && ATK[W.ea.t].impacts) ATK[W.ea.t].impacts(W.ea, eaPrev, W.ea.e, (x, z) => { if (Math.hypot(x - s.x, z - s.z) < 3) { q.p = Math.max(0, q.p - 0.08); ev.push('escortHit'); } });
      if (q.p >= 1) { q.done = 1; ev.push('quest'); }
    } else if (q.t === 'defend') {
      const kill = new Set(); for (const p of players) for (const id of p.kl || []) kill.add(id);
      q.m = q.m.filter(m => !kill.has(m.id));
      const inZone = live.some(p => Math.hypot(p.x - q.x, p.z - q.z) < DEFEND_R);
      let drain = 0;
      for (const m of q.m) {
        let tx = q.x, tz = q.z, best = 4;
        for (const p of live) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < best) { best = d; tx = p.x; tz = p.z; } }
        const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
        if (d > 0.9) { m.x += dx / d * 2.2 * dt; m.z += dz / d * 2.2 * dt; }
        m.x = +m.x.toFixed(2); m.z = +m.z.toFixed(2);
        if (Math.hypot(m.x - q.x, m.z - q.z) < DEFEND_R) drain++;
      }
      if (inZone && !drain) q.p = Math.min(1, q.p + dt / DEFEND_TIME);
      q.p = Math.max(0, q.p - drain * 0.02 * dt);
      q.cd -= dt;
      if (q.cd <= 0 && q.m.length < 6 && live.length) { const a = Math.random() * 6.283; q.m.push({ id: q.id * 1000 + q.nid++, x: +(Math.cos(a) * (R - 1)).toFixed(2), z: +(Math.sin(a) * (R - 1)).toFixed(2), hp: 25 + 5 * L }); q.cd = Math.max(1.5, 3.5 - 0.1 * L); }
      if (q.p >= 1) { q.done = 1; q.m = []; ev.push('quest'); }
    } else if (q.t === 'hunt') {
      q.c += dt; if (live.length) q.tm -= dt;
      for (let i = 0; i < q.n; i++) { if (q.got & (1 << i)) continue; const w = wispPos(q, i); if (live.some(p => Math.hypot(p.x - w.x, p.z - w.z) < WISP_R)) { q.got |= 1 << i; ev.push('wisp'); } }
      if (bits(q.got) >= q.n) { q.done = 1; ev.push('quest'); }
      else if (q.tm <= 0) { q.got = 0; q.tm = HUNT_TIME; ev.push('huntFail'); }
    } else if (q.t === 'minib') {
      if (!q.mx) q.mx = Math.round(260 * (1 + 0.4 * (L - 1)) * (1 + 0.5 * Math.max(0, players.length - 1)));
      for (const p of players) { const d = p.qd && p.qd[q.id]; if (d) q.dmg[p.id] = Math.max(q.dmg[p.id] || 0, d); }
      if (q.dt >= 0) { q.dt += dt; if (q.dt > 2.5) { q.done = 1; ev.push('quest'); } continue; }
      if (miniHp(q) <= 0) { q.dt = 0; q.a = null; ev.push('miniDown'); continue; }
      if (q.a) {
        q.a.e += dt; const A = ATK[q.a.t];
        if (q.a.e >= A.dur(q.a)) { if (A.end) { const e = A.end(q.a); q.x = e.x; q.z = e.z; } q.a = null; q.cd = Math.max(1.2, 2.6 - 0.08 * L); }
        continue;
      }
      let tgt = null, bd = 1e9; for (const p of live) { if (p.hid) continue; const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; tgt = p; } }
      if (!tgt) continue;
      const dx = tgt.x - q.x, dz = tgt.z - q.z; q.ry = Math.atan2(dx, dz);
      if (bd > 2.2) { q.x += dx / bd * 3.2 * dt; q.z += dz / bd * 3.2 * dt; }
      q.cd -= dt;
      if (q.cd <= 0 && bd < 6) { q.a = { id: q.nid++, t: bd < 3 ? 'sweep' : 'slam', e: 0, ox: q.x, oz: q.z, tx: tgt.x, tz: tgt.z, sd: 0, sp: 1.2, ph: 1, sz: 0.55, dm: 0.6 }; ev.push('miniAtk'); }
    }
  }
}
// replica-side timers between leader snapshots
export function advanceQuests(W, dt) { for (const q of W.q || []) { if (q.done) continue; if (q.t === 'hunt') { q.c += dt; q.tm -= dt; } if (q.t === 'minib') { if (q.a) q.a.e += dt; if (q.dt >= 0) q.dt += dt; } if (q.t === 'runes') q.err = Math.max(0, q.err - dt); } }
// position of the elite (accounts for its leap while slamming)
export function miniPos(q) { if (q.a && ATK[q.a.t].pos) { const p = ATK[q.a.t].pos(q.a, q.a.e); return { x: p.x, z: p.z, y: p.y }; } return { x: q.x, z: q.z, y: 0 }; }
