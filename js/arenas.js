// Four procedural arenas. Everything is built from primitives + canvas textures.
import * as THREE from 'three';
export const R = 22; // playable radius

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function speckle(g, s, n, colors, rmin, rmax, r) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(r() * colors.length) | 0]; g.globalAlpha = 0.25 + r() * 0.5; const x = r() * s, y = r() * s, rad = rmin + r() * (rmax - rmin); g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
function cracks(g, s, n, color, width, r) {
  g.strokeStyle = color; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = r() * s, y = r() * s, a = r() * 6.28; g.lineWidth = width * (0.5 + r()); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { a += (r() - 0.5) * 1.4; x += Math.cos(a) * s * 0.05; y += Math.sin(a) * s * 0.05; g.lineTo(x, y); }
    g.stroke();
  }
}
function tiles(g, s, n, base, line, r) {
  g.fillStyle = base; g.fillRect(0, 0, s, s); const w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = (r() - 0.5) * 24; g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.08)`; g.fillRect(i * w + 2, j * w + 2, w - 4, w - 4); }
  g.strokeStyle = line; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.stroke(); g.beginPath(); g.moveTo(0, i * w); g.lineTo(s, i * w); g.stroke(); }
}
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function ringFloor(group, tex, emissiveTex, emissive) {
  const m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: emissiveTex || null, emissive: emissiveTex ? new THREE.Color(emissive) : new THREE.Color(0) });
  const f = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 72), m); f.rotation.x = -Math.PI / 2; group.add(f);
  // rim stones
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 0.35, 6, 72), lam(0x2a2a30)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; group.add(rim);
  return f;
}

// Animated lava surface (cheap shader)
function lavaMat(c1, c2) {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float t;uniform vec3 c1,c2;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vUv*.18;float v=n(p+vec2(t*.05,t*.03))*.6+n(p*2.3-vec2(t*.08,0.))*.4;v=smoothstep(.25,.85,v);
      gl_FragColor=vec4(mix(c1,c2,v)*(1.+v*.8),1.);}`
  });
}

export const ARENAS = [
  {
    key: 'lava', name: 'Molten Caldera', boss: { name: 'Kharvoth, the Cinder Fiend', kind: 'demon', body: 0x241410, accent: 0xff5a1a, eye: 0xffd040 },
    bg: 0x1a0805, fog: [0x2a0c06, 22, 70], hemi: [0xff8a50, 0x200805, 0.75], key: [0xff9a60, 1.1], fill: 0xff4010, drone: 46,
    particles: 'embers',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#2b211e'; c.fillRect(0, 0, s, s); speckle(c, s, 900, ['#3a2b26', '#1a1311', '#46342c'], 2, 9, r); cracks(c, s, 26, '#120a08', 5, r); }, 4);
      const emis = canvasTex(512, (c, s) => { c.fillStyle = '#000'; c.fillRect(0, 0, s, s); c.shadowColor = '#ff6a00'; c.shadowBlur = 12; cracks(c, s, 22, '#ff7a20', 3, r); }, 4);
      ringFloor(g, floorTex, emis, 0xffffff);
      const lava = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, 90, 64, 1), lavaMat(0x8a1500, 0xffa020)); lava.rotation.x = -Math.PI / 2; lava.position.y = -0.4; g.add(lava);
      this._lava = lava.material;
      const rock = lam(0x1d1512), glowRock = lam(0x1d1512, { emissive: new THREE.Color(0x3a0c00) });
      for (let i = 0; i < 26; i++) {
        const a = r() * 6.28, d = R + 4 + r() * 22, h = 3 + r() * 11;
        const m = new THREE.Mesh(new THREE.ConeGeometry(1 + r() * 2.5, h, 5 + (r() * 3 | 0)), r() < 0.5 ? rock : glowRock);
        m.position.set(Math.cos(a) * d, h / 2 - 0.6, Math.sin(a) * d); m.rotation.y = r() * 6; m.rotation.z = (r() - 0.5) * 0.3; g.add(m);
      }
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28 + 0.2, m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + r() * 0.7, 0), rock); m.position.set(Math.cos(a) * (R - 0.6), 0.3, Math.sin(a) * (R - 0.6)); m.rotation.set(r() * 3, r() * 3, 0); g.add(m); }
    },
    update(t) { if (this._lava) this._lava.uniforms.t.value = t; },
  },
  {
    key: 'ice', name: 'Frozen Ruins', boss: { name: 'Jorvald, the Frost Colossus', kind: 'giant', body: 0x2a3a4c, accent: 0x6fe3ff, eye: 0xd8f8ff },
    bg: 0x0b1522, fog: [0x1a2c40, 20, 75], hemi: [0xbfe4ff, 0x15202c, 0.95], key: [0xcfe8ff, 1.0], fill: 0x5ab8ff, drone: 55,
    particles: 'snow',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 6, '#9fb3c4', '#6d8294', r); speckle(c, s, 700, ['#ffffff', '#dbe8f2', '#c4d6e4'], 3, 14, r); cracks(c, s, 14, 'rgba(70,95,120,.6)', 2, r); }, 3);
      ringFloor(g, floorTex);
      const snow = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, 90, 64, 1), lam(0xc8d8e6)); snow.rotation.x = -Math.PI / 2; snow.position.y = -0.05; g.add(snow);
      const stone = lam(0x7d8a96), ice = new THREE.MeshLambertMaterial({ color: 0x8fe6ff, emissive: new THREE.Color(0x0b4a66), transparent: true, opacity: 0.85 });
      for (let i = 0; i < 12; i++) { // ring of ruined pillars
        const a = i / 12 * 6.28, h = r() < 0.35 ? 1 + r() * 2 : 5 + r() * 4;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, h, 8), stone); p.position.set(Math.cos(a) * (R + 2.2), h / 2, Math.sin(a) * (R + 2.2)); g.add(p);
        if (h > 4 && r() < 0.6) { const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.2), stone); cap.position.set(p.position.x, h + 0.3, p.position.z); g.add(cap); }
      }
      for (let i = 0; i < 5; i++) { const a = r() * 6.28, d = R + 6 + r() * 10, f = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 7, 8), stone); f.rotation.z = Math.PI / 2; f.rotation.y = r() * 6; f.position.set(Math.cos(a) * d, 0.7, Math.sin(a) * d); g.add(f); }
      for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = R + 3 + r() * 25, s = 1 + r() * 3.5, m = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), ice); m.scale.y = 1.8 + r(); m.position.set(Math.cos(a) * d, s * 0.9, Math.sin(a) * d); m.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5); g.add(m); }
      for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = 4 + r() * (R - 7), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 + r() * 0.3, 0), ice); m.scale.y = 2; m.position.set(Math.cos(a) * d, 0.6, Math.sin(a) * d); g.add(m); }
    },
  },
  {
    key: 'grave', name: "Serpent's Barrow", boss: { name: 'Vessrath, the Grave Serpent', kind: 'serpent', body: 0x1c2620, accent: 0x6bff9a, eye: 0xb8ffcf },
    bg: 0x050a08, fog: [0x0c1a12, 16, 60], hemi: [0x7fb0a0, 0x050805, 0.6], key: [0xa8c8ff, 0.8], fill: 0x40ff90, drone: 41,
    particles: 'wisps',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#1e2a1c'; c.fillRect(0, 0, s, s); speckle(c, s, 1400, ['#2c3b25', '#151d12', '#36301f', '#26331f'], 2, 10, r); }, 4);
      ringFloor(g, floorTex);
      const ground = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, 90, 64, 1), lam(0x141c12)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; g.add(ground);
      const stone = lam(0x5a605c), wood = lam(0x2a2018), iron = lam(0x1a1a1a);
      for (let i = 0; i < 34; i++) { // graves
        const a = r() * 6.28, d = R + 2 + r() * 14, gr = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4 + r() * 0.6, 0.25), stone); slab.position.y = 0.7; gr.add(slab);
        if (r() < 0.4) { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 10, 1, false, 0, Math.PI), stone); top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.position.y = 1.45; gr.add(top); }
        if (r() < 0.3) { const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.22), stone); cross.position.y = 1.1; gr.add(cross); }
        gr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); gr.rotation.y = -a + Math.PI / 2 + (r() - 0.5) * 0.4; gr.rotation.z = (r() - 0.5) * 0.25; g.add(gr);
      }
      for (let i = 0; i < 14; i++) { // dead trees
        const a = r() * 6.28, d = R + 8 + r() * 18, tr = new THREE.Group(), h = 5 + r() * 5;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, h, 6), wood); trunk.position.y = h / 2; tr.add(trunk);
        for (let k = 0; k < 4; k++) { const bl = 1.5 + r() * 2.5, b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, bl, 5), wood); const by = h * (0.5 + r() * 0.45), ba = r() * 6.28; b.position.set(Math.cos(ba) * bl * 0.4, by, Math.sin(ba) * bl * 0.4); b.rotation.set(Math.sin(ba) * 0.9, 0, -Math.cos(ba) * 0.9); tr.add(b); }
        tr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(tr);
      }
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28; if (i % 12 === 0) continue; const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), iron); p.position.set(Math.cos(a) * (R + 1.4), 0.8, Math.sin(a) * (R + 1.4)); g.add(p); }
      const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 1.4, 0.05, 4, 96), iron); rail.rotation.x = Math.PI / 2; rail.position.y = 1.4; g.add(rail);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 12), new THREE.MeshBasicMaterial({ color: 0xdfe8d0, fog: false })); moon.position.set(-40, 38, -60); g.add(moon);
    },
  },
  {
    key: 'storm', name: 'Stormspire Rooftop', boss: { name: 'Aurunax, the Storm Titan', kind: 'titan', body: 0x2a2436, accent: 0xb07cff, eye: 0xe8d8ff },
    bg: 0x0a0814, fog: [0x1a1530, 22, 80], hemi: [0x9a90d0, 0x0a0810, 0.7], key: [0xb8b0ff, 0.9], fill: 0x9060ff, drone: 49,
    particles: 'rain',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 8, '#4a4652', '#26232c', r); speckle(c, s, 500, ['#5a5664', '#34313c'], 2, 8, r); cracks(c, s, 10, 'rgba(20,18,24,.7)', 2, r); }, 3);
      ringFloor(g, floorTex);
      const stone = lam(0x4a4652), dark = lam(0x2a2730), roof = lam(0x2b2440);
      // octagonal parapet with crenellations
      for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28, h = i % 2 ? 1.0 : 1.7, b = new THREE.Mesh(new THREE.BoxGeometry(2.9, h, 0.8), stone); b.position.set(Math.cos(a) * (R + 1.2), h / 2, Math.sin(a) * (R + 1.2)); b.rotation.y = -a + Math.PI / 2; g.add(b); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 4, 30, 40, 1, true), dark); base.position.y = -15; g.add(base);
      for (let i = 0; i < 6; i++) { // distant towers
        const a = i / 6 * 6.28 + r() * 0.5, d = 38 + r() * 18, h = 14 + r() * 18, tw = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, h, 10), stone); body.position.y = h / 2 - 12; tw.add(body);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 6, 10), roof); cone.position.y = h - 12 + 3; tw.add(cone);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), new THREE.MeshBasicMaterial({ color: 0xffc070 })); win.position.set(0, h - 15, 2.45); win.lookAt(0, h - 15, 10); tw.add(win);
        tw.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); tw.lookAt(0, 0, 0); g.add(tw);
      }
      for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 0.4, p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 8), stone); p.position.set(Math.cos(a) * (R + 2.8), 3.5, Math.sin(a) * (R + 2.8)); g.add(p); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc8a8ff })); orb.position.set(p.position.x, 7.4, p.position.z); g.add(orb); }
      this._flash = 0;
    },
  },
];

// The shared hub: a floating cloud realm at twilight where the group completes tasks.
export const HUB = {
  key: 'hub', name: 'Cloudhold Sanctum', boss: null,
  bg: 0x2a2346, fog: [0x3a3060, 30, 110], hemi: [0xffd8a8, 0x3a2a5a, 1.05], key: [0xffc890, 1.0], drone: 0,
  particles: 'motes',
  build(g, r) {
    const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 5, '#cfc4b0', '#9a8e7a', r); speckle(c, s, 500, ['#e8dfcc', '#b8ab94'], 2, 9, r); }, 3);
    ringFloor(g, floorTex);
    const rock = lam(0x6a5a78), cloud = new THREE.MeshLambertMaterial({ color: 0xf2e8ff, emissive: new THREE.Color(0x3a2a50) });
    const under = new THREE.Mesh(new THREE.ConeGeometry(R + 0.6, 16, 24, 1), rock); under.rotation.x = Math.PI; under.position.y = -8.1; g.add(under);
    for (let i = 0; i < 40; i++) { // cloud puffs around and below
      const a = r() * 6.28, d = R + 4 + r() * 40, y = -10 + r() * 14, cl = new THREE.Group();
      for (let k = 0; k < 4; k++) { const s = 2 + r() * 4, m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloud); m.position.set((r() - .5) * 8, (r() - .5) * 2, (r() - .5) * 8); m.scale.y = 0.6; cl.add(m); }
      cl.position.set(Math.cos(a) * d, y, Math.sin(a) * d); g.add(cl);
    }
    for (let i = 0; i < 7; i++) { // small floating islets
      const a = r() * 6.28, d = R + 10 + r() * 25, isl = new THREE.Mesh(new THREE.ConeGeometry(2 + r() * 3, 4 + r() * 4, 7), rock); isl.rotation.x = Math.PI; isl.position.set(Math.cos(a) * d, 2 + r() * 8, Math.sin(a) * d); g.add(isl);
    }
    const arch = lam(0xe8dcc4);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + 0.39, p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6, 8), arch); p.position.set(Math.cos(a) * (R + 1.5), 3, Math.sin(a) * (R + 1.5)); g.add(p); }
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe6c0, fog: false })); moon.position.set(50, 30, -70); g.add(moon);
  },
};
