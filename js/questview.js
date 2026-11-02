// 3D visuals for the quests (rune plates, lantern spirit, ward circle + shades, wisps, elite mini-boss).
import * as THREE from 'three';
import { RUNE_N, PLATE_R, ESCORT_NEAR, DEFEND_R, runePos, escortPos, wispPos, miniPos, miniHp } from './quests.js';
import { createMiniView, MINI_SPECS } from './boss.js';
import { ATK } from './boss.js';

const GLYPHS = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ'], GCOL = ['#ff7a5a', '#ffd45a', '#6aff8a', '#5ac8ff', '#c07aff'];
const glow = (c, i = 2.5) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(c), emissiveIntensity: i });
const stone = () => new THREE.MeshStandardMaterial({ color: 0x4a4650, roughness: 0.85, metalness: 0.05 });
function glyphTex(ch, col, bg = null) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 128, 128); }
  g.font = 'bold 92px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function hpBar() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.set(3, 0.56, 1); s.renderOrder = 11; s.userData = { c, tex, k: '' }; return s;
}
function drawBar(s, name, f) {
  const k = name + Math.round(f * 50); if (s.userData.k === k) return; s.userData.k = k; const g = s.userData.c.getContext('2d'); g.clearRect(0, 0, 256, 48);
  g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd0a0'; g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeText(name, 128, 18); g.fillText(name, 128, 18);
  g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(20, 28, 216, 14); g.fillStyle = '#e0402a'; g.fillRect(22, 30, 212 * f, 10); s.userData.tex.needsUpdate = true;
}
const disposeObj = o => o.traverse(c => { if (c.userData.shared) return; if (c.geometry) c.geometry.dispose(); if (c.material) { const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });

function buildShade() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: 0x0a0810, roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(0x200830), emissiveIntensity: 1 });
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.5, 10, 1, true), body); b.position.y = 0.8; b.rotation.x = Math.PI; b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), body); h.position.y = 1.65; h.castShadow = true; g.add(h);
  const em = glow(0xff4070, 6); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), em); e.position.set(s * 0.12, 1.7, 0.27); g.add(e); }
  return g;
}

export class QuestView {
  constructor(scene) { this.scene = scene; this.items = new Map(); this.root = new THREE.Group(); scene.add(this.root); }
  clear() { for (const it of this.items.values()) this.drop(it); this.items.clear(); }
  drop(it) { this.root.remove(it.g); if (it.mini) it.mini.dispose(); disposeObj(it.g); }
  build(q, accent) {
    const g = new THREE.Group(), it = { g, q: q.id, t: q.t }; this.root.add(g);
    if (q.t === 'runes') {
      it.plates = [];
      for (let i = 0; i < RUNE_N; i++) {
        const p = runePos(i), pg = new THREE.Group(); pg.position.set(p.x, 0, p.z);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R + 0.15, 0.22, 24), stone()); base.position.y = 0.11; base.receiveShadow = true; pg.add(base);
        const top = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R * 0.8, 24), new THREE.MeshStandardMaterial({ map: glyphTex(GLYPHS[i], GCOL[i]), emissiveMap: null, emissive: new THREE.Color(GCOL[i]), emissiveIntensity: 0.3, transparent: true, roughness: 0.6 }));
        top.rotation.x = -Math.PI / 2; top.position.y = 0.23; pg.add(top);
        g.add(pg); it.plates.push(top);
      }
      // tablet showing the order
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#1a1620'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#8a7a5a'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 122);
      x.font = 'bold 80px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      q.ord.forEach((pi, k) => { x.fillStyle = GCOL[pi]; x.shadowColor = GCOL[pi]; x.shadowBlur = 14; x.fillText(GLYPHS[pi], 64 + k * 96, 70); });
      const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
      const tab = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tt, side: THREE.DoubleSide, toneMapped: false })); tab.position.set(0, 3.6, 0); g.add(tab); it.tab = tab;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.1, 8), stone()); post.position.y = 1.55; post.castShadow = true; g.add(post);
    } else if (q.t === 'escort') {
      const sp = new THREE.Group(); g.add(sp); it.sp = sp;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), glow(0xffd890, 5)); core.position.y = 1.6; sp.add(core);
      const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: 0.9, roughness: 0.3, wireframe: true })); cage.position.y = 1.6; sp.add(cage); it.cage = cage;
      const L = new THREE.PointLight(0xffc870, 20, 12, 1.8); L.position.y = 1.8; sp.add(L);
      const ring = new THREE.Mesh(new THREE.RingGeometry(ESCORT_NEAR - 0.12, ESCORT_NEAR, 64), new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; sp.add(ring); it.ring = ring;
      const pts = []; for (let i = 0; i <= 40; i++) { const p = escortPos(q, i / 40); pts.push(new THREE.Vector3(p.x, 0.1, p.z)); }
      const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffd890, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.6 })); path.computeLineDistances(); g.add(path);
      const goal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 32), glow(0xffd890, 3)); const gp = escortPos(q, 1); goal.position.set(gp.x, 1.3, gp.z); g.add(goal); it.goal = goal;
    } else if (q.t === 'defend') {
      const zone = new THREE.Group(); zone.position.set(q.x, 0, q.z); g.add(zone);
      const ring = new THREE.Mesh(new THREE.RingGeometry(DEFEND_R - 0.15, DEFEND_R, 64), new THREE.MeshBasicMaterial({ color: 0x70c8ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.09; zone.add(ring);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(DEFEND_R, 48), new THREE.MeshBasicMaterial({ color: 0x70c8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.08; zone.add(fill); it.fill = fill;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78, ob = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), stone()); ob.position.set(Math.cos(a) * (DEFEND_R + 0.3), 1.2, Math.sin(a) * (DEFEND_R + 0.3)); ob.castShadow = true; zone.add(ob); const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), glow(0x70c8ff, 4)); cr.position.set(ob.position.x, 2.7, ob.position.z); zone.add(cr); }
      it.shades = new Map();
    } else if (q.t === 'hunt') {
      it.wisps = []; for (let i = 0; i < q.n; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), glow(0x9affea, 6)); const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0x5affd0, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); w.add(halo); g.add(w); it.wisps.push(w); }
    } else if (q.t === 'minib') { it.bar = hpBar(); g.add(it.bar); }
    return it;
  }
  sync(W, dt, t, accent) {
    const live = new Set();
    if (W.mode !== 'boss') for (const q of W.q || []) {
      if (q.done && q.t !== 'minib') continue; if (q.t === 'minib' && q.done) continue;
      if (!['runes', 'escort', 'defend', 'hunt', 'minib'].includes(q.t)) continue;
      live.add(q.id); let it = this.items.get(q.id); if (!it) { it = this.build(q, accent); this.items.set(q.id, it); }
      this.update(it, q, dt, t);
    }
    for (const [id, it] of this.items) if (!live.has(id)) { this.drop(it); this.items.delete(id); }
  }
  update(it, q, dt, t) {
    if (q.t === 'runes') {
      it.plates.forEach((p, i) => { const lit = q.ord.slice(0, q.k).includes(i); p.material.emissiveIntensity = q.err > 0 ? 0.1 + 0.5 * (Math.sin(t * 20) > 0) : lit ? 2.2 : 0.25 + 0.1 * Math.sin(t * 2 + i); p.material.emissive.set(q.err > 0 ? '#ff2020' : GCOL[i]); });
      it.tab.rotation.y = t * 0.25;
    } else if (q.t === 'escort') {
      const p = escortPos(q); it.sp.position.x += (p.x - it.sp.position.x) * Math.min(1, dt * 6); it.sp.position.z += (p.z - it.sp.position.z) * Math.min(1, dt * 6);
      it.sp.position.y = Math.sin(t * 2) * 0.15; it.cage.rotation.y = t; it.cage.rotation.x = t * 0.6; it.goal.rotation.y = t * 1.5;
    } else if (q.t === 'defend') {
      it.fill.scale.setScalar(Math.max(0.02, q.p)); it.fill.material.opacity = 0.2 + 0.08 * Math.sin(t * 4);
      const seen = new Set();
      for (const m of q.m) {
        seen.add(m.id); let s = it.shades.get(m.id);
        if (!s) { s = buildShade(); s.position.set(m.x, 0, m.z); it.g.add(s); it.shades.set(m.id, s); }
        const dx = m.x - s.position.x, dz = m.z - s.position.z; s.position.x += dx * Math.min(1, dt * 8); s.position.z += dz * Math.min(1, dt * 8);
        if (Math.hypot(dx, dz) > 0.01) s.rotation.y = Math.atan2(dx, dz); s.position.y = 0.1 + Math.sin(t * 3 + m.id) * 0.12;
      }
      for (const [id, s] of it.shades) if (!seen.has(id)) { it.g.remove(s); disposeObj(s); it.shades.delete(id); }
    } else if (q.t === 'hunt') {
      it.wisps.forEach((w, i) => { const got = q.got & (1 << i); w.visible = !got; if (!got) { const p = wispPos(q, i); w.position.set(p.x, p.y, p.z); } });
    } else if (q.t === 'minib') {
      if (!it.mini) { it.mini = createMiniView(q.kind); if (it.mini) { it.g.add(it.mini.root); it.disp = { x: q.x, z: q.z, ry: q.ry }; } else return; }
      const p = miniPos(q), d = it.disp, k = Math.min(1, dt * 8), ox = d.x, oz = d.z;
      if (q.a && ATK[q.a.t].pos) { d.x = p.x; d.z = p.z; } else { d.x += (p.x - d.x) * k; d.z += (p.z - d.z) * k; }
      const walking = Math.hypot(d.x - ox, d.z - oz) > dt * 0.6;
      d.ry += ((((q.ry - d.ry) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
      it.mini.root.position.set(d.x, p.y || 0, d.z); it.mini.root.rotation.y = d.ry;
      const A = q.a ? ATK[q.a.t] : null, T = q.a ? { slam: 1.2, sweep: 1.05 }[q.a.t] / q.a.sp : 0;
      it.mini.update(dt, t, { mode: q.a ? q.a.t : '', e: q.a ? q.a.e : 0, T, walking, fast: true, phase: 1, st: q.dt >= 0 ? 'dead' : '' });
      it.flash = Math.max(0, (it.flash || 0) - dt); it.mini.setFlash(it.flash > 0 ? 1 : 0);
      it.bar.position.set(d.x, MINI_SPECS[q.kind].height + 0.9, d.z); it.bar.visible = q.dt < 0; drawBar(it.bar, MINI_SPECS[q.kind].name, q.mx ? miniHp(q) / q.mx : 1);
    }
  }
  flashMini(qid) { const it = this.items.get(qid); if (it) it.flash = 0.12; }
  miniDisp(qid) { const it = this.items.get(qid); return it && it.disp; }
  shadePos(qid, mid) { const it = this.items.get(qid); const s = it && it.shades && it.shades.get(mid); return s ? s.position : null; }
}
