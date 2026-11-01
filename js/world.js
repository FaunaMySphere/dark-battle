// The shared world loop (leader-simulated, replicated to everyone):
//   hub (cloud realm tasks) -> relics (collect in the arena) -> boss fight -> next level hub
import { R, rng } from './arenas.js';
import { newFight, stepBoss } from './boss.js';

export const SHRINE_TIME = 4;      // seconds of one player standing on a shrine (more players = faster)
export const SHRINE_R = 2.6, ORB_R = 1.6, RELIC_R = 1.8, PORTAL_TIME = 4;
export const shrinePos = i => { const a = Math.PI / 2 + i * Math.PI * 2 / 3; return { x: Math.cos(a) * 14, z: Math.sin(a) * 14 }; };
export const orbCount = lvl => Math.min(8, 4 + lvl);
export const relicCount = lvl => Math.min(10, 4 + lvl);
export function orbPos(seed, i) { const r = rng(seed * 97 + i * 13 + 5); const a = r() * 6.28, d = 6 + r() * (R - 8); return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 1.2 + r() * 1.2 }; }
export function relicPos(seed, i) { const r = rng(seed * 53 + i * 29 + 11); const a = r() * 6.28, d = 5 + r() * (R - 7); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }

export function newWorld(lvl, fid) { return { lvl, fid, mode: 'hub', se: 0, seed: lvl * 7919 + fid, sh: [0, 0, 0], orbs: 0, rel: 0, ea: null, eid: 1, ecd: 4, b: null }; }
const bits = n => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
export const orbsGot = W => bits(W.orbs), relicsGot = W => bits(W.rel);
export const hubDone = W => W.sh.every(v => v >= 1) && orbsGot(W) >= orbCount(W.lvl);

// players: [{id,x,z,dead,hid,fin}] ; ev: event names out
export function stepWorld(W, dt, players, ev) {
  W.se += dt;
  const live = players.filter(p => !p.dead);
  if (W.mode === 'hub') {
    for (let i = 0; i < 3; i++) {
      if (W.sh[i] >= 1) continue;
      const s = shrinePos(i), on = live.filter(p => Math.hypot(p.x - s.x, p.z - s.z) < SHRINE_R).length;
      if (on) { W.sh[i] = Math.min(1, W.sh[i] + dt * (1 + 0.5 * (on - 1)) / SHRINE_TIME); if (W.sh[i] >= 1) ev.push('shrine'); }
    }
    for (let i = 0; i < orbCount(W.lvl); i++) {
      if (W.orbs & (1 << i)) continue;
      const o = orbPos(W.seed, i);
      if (live.some(p => Math.hypot(p.x - o.x, p.z - o.z) < ORB_R)) { W.orbs |= 1 << i; ev.push('orb'); }
    }
    if (hubDone(W)) { if (W.portal == null) { W.portal = 0; ev.push('portal'); } W.portal += dt; if (W.portal >= PORTAL_TIME) { W.mode = 'relics'; W.se = 0; W.portal = null; W.ecd = 5; ev.push('toArena'); } }
    return;
  }
  if (W.mode === 'relics') {
    const n = relicCount(W.lvl);
    for (let i = 0; i < n; i++) {
      if (W.rel & (1 << i)) continue;
      const o = relicPos(W.seed, i);
      if (live.some(p => Math.hypot(p.x - o.x, p.z - o.z) < RELIC_R)) { W.rel |= 1 << i; ev.push('relic'); }
    }
    // the dormant giant hurls hazards at relic hunters
    if (W.ea) { W.ea.e += dt; if (W.ea.e > 4) W.ea = null; }
    else { W.ecd -= dt; if (W.ecd <= 0 && live.length) { const t = live[(Math.random() * live.length) | 0]; W.ea = { id: W.eid++, t: 'meteors', e: 0, ox: 0, oz: 0, tx: t.x, tz: t.z, sd: (Math.random() * 1e6) | 0, sp: 1, ph: 1 }; W.ecd = Math.max(2.5, 6 - W.lvl * 0.5); } }
    if (relicsGot(W) >= n) { W.mode = 'boss'; W.se = 0; W.ea = null; W.b = newFight(W.fid, W.lvl, players.length); ev.push('bossSpawn'); }
    return;
  }
  if (W.mode === 'boss') {
    const b = W.b;
    stepBoss(b, dt, players, ev);
    if (b.st === 'win' && b.se > 10) { const nw = newWorld(W.lvl + 1, b.fid + 1); Object.assign(W, nw); ev.push('nextLevel'); }
  }
}
export { bits };
