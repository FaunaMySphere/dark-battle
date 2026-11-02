// Eight procedural arenas + the hub. PBR materials, canvas-derived normal maps, displaced terrain,
// instanced props, per-arena sky / fog / grading. Everything is generated at runtime (no texture downloads).
import * as THREE from 'three';
export const R = 22; // playable radius

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- texture helpers ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// Sobel normal map from a colour canvas (darker = deeper)
function normalFrom(tex, strength = 2.5, invert = false) {
  const src = tex.image, s = src.width, d = src.getContext('2d').getImageData(0, 0, s, s).data;
  const L = new Float32Array(s * s); for (let i = 0; i < s * s; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255 * (invert ? -1 : 1);
  const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), out = g.createImageData(s, s), o = out.data;
  const at = (x, y) => L[((y + s) % s) * s + ((x + s) % s)];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * s + x) * 4; o[i] = (nx * 0.5 + 0.5) * 255; o[i + 1] = (ny * 0.5 + 0.5) * 255; o[i + 2] = (nz * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(tex.repeat); t.anisotropy = 8; return t;
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
function tiles(g, s, n, base, line, r, jitter = 24) {
  g.fillStyle = base; g.fillRect(0, 0, s, s); const w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = (r() - 0.5) * jitter; g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.12)`; g.fillRect(i * w + 2, j * w + 2, w - 4, w - 4); }
  g.strokeStyle = line; g.lineWidth = 4; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.stroke(); g.beginPath(); g.moveTo(0, i * w); g.lineTo(s, i * w); g.stroke(); }
}
function grain(g, s, r, a = 0.06) { const im = g.getImageData(0, 0, s, s), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 255 * a; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(im, 0, 0); }

// ---------- material helpers ----------
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, ...(o.emissive != null ? { emissive: new THREE.Color(o.emissive), emissiveIntensity: o.ei ?? 1 } : {}), ...(o.extra || {}) });
const glow = (color, i = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: i, roughness: 1 });
function shadowAll(o, cast = true, recv = true) { o.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; }

function ringFloor(group, tex, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: normalFrom(tex, o.bump ?? 2.5, o.invert), roughness: o.rough ?? 0.88, metalness: o.metal ?? 0 });
  m.normalScale.set(1, 1);
  if (o.emissiveMap) { m.emissiveMap = o.emissiveMap; m.emissive = new THREE.Color(o.emissive ?? 0xffffff); m.emissiveIntensity = o.ei ?? 1.5; }
  const f = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 96), m); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; group.add(f);
  if (o.rim !== false) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 0.38, 8, 96), std(o.rimCol ?? 0x2a2a30, { rough: 0.7 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; rim.receiveShadow = true; rim.castShadow = true; group.add(rim); }
  return f;
}

// value noise
function noise2(seed) {
  const r = rng(seed), P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v; };
  return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// outer terrain ring: o = {seed, h, base, low, high, peak?, scale, ridge, tex}
function terrain(group, o) {
  const N = noise2(o.seed || 7), geo = new THREE.RingGeometry(R + 0.7, 150, 160, 36), p = geo.attributes.position, cols = new Float32Array(p.count * 3);
  const cl = new THREE.Color(o.low), ch = new THREE.Color(o.high), cp = new THREE.Color(o.peak ?? o.high), tmp = new THREE.Color();
  const H = (x, y) => {
    const d = Math.hypot(x, y), ramp = smooth(R + 1, R + (o.rampD ?? 18), d);
    let n = N(x * (o.scale ?? 0.045) + 10, y * (o.scale ?? 0.045) + 10, 5);
    if (o.ridge) n = 1 - Math.abs(n * 2 - 1);
    if (o.dunes) n = 0.5 + 0.5 * Math.sin(x * 0.09 + N(x * 0.02, y * 0.02, 2) * 6) * 0.6 + n * 0.4;
    return (o.base ?? 0) + ramp * (n * o.h + (o.lift ?? 0) * smooth(40, 150, d));
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), h = H(x, y);
    p.setZ(i, h);
    const k = Math.max(0, Math.min(1, (h - (o.base ?? 0)) / Math.max(1, o.h * 0.9)));
    tmp.copy(cl).lerp(ch, smooth(0.05, 0.6, k)).lerp(cp, smooth(0.6, 1, k)); const v = 0.9 + N(x * 0.3, y * 0.3, 2) * 0.2; tmp.multiplyScalar(v);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough ?? 0.95, metalness: 0, map: o.tex || null });
  if (o.tex) { o.tex.repeat.set(30, 30); mat.normalMap = normalFrom(o.tex, 2); mat.normalMap.repeat.set(30, 30); }
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; group.add(m);
  m.userData.height = (x, z) => H(x, -z);
  return m;
}
// lumpy rock geometry
function rockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, N = noise2(seed);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + N(x * 1.7 + 5, y * 1.7 + z * 1.3 + 5, 3) * 0.6; p.setXYZ(i, x * k, y * k * 0.8, z * k); }
  g.computeVertexNormals(); return g;
}
// instanced scatter around the ring: o = {n, rmin, rmax, smin, smax, yScale, sink, avoid}
function scatter(group, geo, mat, r, o) {
  const im = new THREE.InstancedMesh(geo, mat, o.n), d = new THREE.Object3D();
  for (let i = 0; i < o.n; i++) {
    const a = r() * 6.28, rad = o.rmin + r() * (o.rmax - o.rmin), s = o.smin + r() * (o.smax - o.smin);
    d.position.set(Math.cos(a) * rad, (o.y ?? 0) + (o.hf ? o.hf(Math.cos(a) * rad, Math.sin(a) * rad) : 0) - s * (o.sink ?? 0.3), Math.sin(a) * rad);
    d.rotation.set((r() - 0.5) * (o.tilt ?? 0.5), r() * 6.28, (r() - 0.5) * (o.tilt ?? 0.5)); d.scale.set(s * (0.8 + r() * 0.4), s * (o.yScale ?? 1) * (0.8 + r() * 0.5), s * (0.8 + r() * 0.4));
    d.updateMatrix(); im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; group.add(im); return im;
}

// Animated lava (HDR emissive so it blooms)
function lavaMat(c1, c2) {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float t;uniform vec3 c1,c2;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vUv*.16;float v=n(p+vec2(t*.05,t*.03))*.55+n(p*2.3-vec2(t*.08,0.))*.3+n(p*5.1+vec2(0.,t*.12))*.15;v=smoothstep(.3,.8,v);
      vec3 col=mix(c1*.35,c2*2.6,v*v)+c1*.25;gl_FragColor=vec4(col,1.);}`
  });
}
function crystal(mat, s) { const g = new THREE.OctahedronGeometry(s, 0); const m = new THREE.Mesh(g, mat); m.scale.y = 2.2; return m; }
function deadTree(wood, r, h) {
  const tr = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * h / 6, 0.6 * h / 6, h, 7), wood); trunk.position.y = h / 2; tr.add(trunk);
  for (let k = 0; k < 5; k++) { const bl = 1.2 + r() * 2.8, b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.18, bl, 5), wood); const by = h * (0.45 + r() * 0.5), ba = r() * 6.28; b.position.set(Math.cos(ba) * bl * 0.4, by, Math.sin(ba) * bl * 0.4); b.rotation.set(Math.sin(ba) * 0.9, 0, -Math.cos(ba) * 0.9); tr.add(b); }
  return shadowAll(tr);
}
function pine(r, h, leaf, wood) {
  const t = new THREE.Group(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, h * 0.4, 6), wood); tr.position.y = h * 0.2; t.add(tr);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28 * (1 - i * 0.18), h * 0.36, 8), leaf); c.position.y = h * (0.32 + i * 0.17); c.rotation.y = r() * 3; t.add(c); }
  return shadowAll(t);
}

const DEF_GRADE = { tint: 0xffffff, lift: 0x000000, sat: 1.08, contrast: 1.06, vig: 0.9 };
export const ARENAS = [
  { // 0
    key: 'lava', name: 'Molten Caldera', boss: { name: 'Kharvoth, the Cinder Wyrm', kind: 'wyrm', body: 0x241410, accent: 0xff5a1a, eye: 0xffd040 },
    sky: { top: 0x12060a, hor: 0x6a1e08, bot: 0x2a0804, sun: [0.3, 0.18, -0.9], sunCol: 0xff7a30, sunSize: 0.05, clouds: 0.7, cloudCol: 0x3a1410 },
    fog: [0x4a1608, 30, 120], hemi: [0xff9a60, 0x281008, 0.6], keyL: [0xffb080, 2.6], envI: 0.7, exposure: 0.95, bloom: 0.6,
    grade: { tint: 0xfff0e0, lift: 0x100400, sat: 1.12, contrast: 1.1, vig: 1.0 }, drone: 46, particles: 'embers',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#2b211e'; c.fillRect(0, 0, s, s); speckle(c, s, 1400, ['#3a2b26', '#1a1311', '#46342c', '#251a17'], 2, 10, r); cracks(c, s, 30, '#0a0605', 6, r); grain(c, s, r); }, 4);
      const emis = canvasTex(512, (c, s) => { c.fillStyle = '#000'; c.fillRect(0, 0, s, s); c.shadowColor = '#ff6a00'; c.shadowBlur = 14; cracks(c, s, 22, '#ff7a20', 3, rng(99)); }, 4);
      ringFloor(g, floorTex, { emissiveMap: emis, emissive: 0xff8030, ei: 2.2, rough: 0.8, rimCol: 0x1a1210 });
      const lava = new THREE.Mesh(new THREE.RingGeometry(R + 0.8, 150, 96, 1), lavaMat(0x8a1500, 0xffa020)); lava.rotation.x = -Math.PI / 2; lava.position.y = -0.35; g.add(lava);
      this._lava = lava.material;
      const t = terrain(g, { seed: 11, h: 26, base: -6, low: 0x120c0a, high: 0x2a1e1a, peak: 0x3a2a22, ridge: true, scale: 0.04, rampD: 26, rough: 0.9 });
      const rock = std(0x231a16, { rough: 0.85 }), glowRock = std(0x1d1512, { emissive: 0xff4010, ei: 0.5, rough: 0.9 });
      scatter(g, new THREE.ConeGeometry(1, 1, 6), rock, r, { n: 34, rmin: R + 5, rmax: R + 34, smin: 2, smax: 6, yScale: 3.5, sink: 0.2, y: -1, tilt: 0.3 });
      scatter(g, rockGeo(3), glowRock, r, { n: 20, rmin: R + 2, rmax: R + 14, smin: 0.8, smax: 2.4, sink: 0.4 });
      scatter(g, rockGeo(4), rock, r, { n: 14, rmin: R - 0.8, rmax: R - 0.2, smin: 0.6, smax: 1.3, sink: 0.4 });
      const ob = std(0x0e0a0c, { rough: 0.2, metal: 0.3 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.3, c = crystal(ob, 0.9 + r() * 0.5); c.position.set(Math.cos(a) * (R + 2.5), 1.6, Math.sin(a) * (R + 2.5)); c.rotation.z = (r() - 0.5) * 0.4; c.castShadow = true; g.add(c); }
    },
    update(t) { if (this._lava) this._lava.uniforms.t.value = t; },
  },
  { // 1
    key: 'ice', name: 'Frozen Ruins', boss: { name: 'Jorvald, the Frost Colossus', kind: 'giant', body: 0x2a3a4c, accent: 0x6fe3ff, eye: 0xd8f8ff },
    sky: { top: 0x0a1a38, hor: 0x8fb4d8, bot: 0xa0b8cc, sun: [-0.4, 0.22, -0.8], sunCol: 0xffe8d0, sunSize: 0.025, clouds: 0.5, cloudCol: 0xc8d8ea, stars: 0.3 },
    fog: [0x9ab8d4, 30, 130], hemi: [0xbfe4ff, 0x31414f, 0.55], keyL: [0xfff0e0, 2.6], envI: 1.0, exposure: 1.0, bloom: 0.55,
    grade: { tint: 0xeef6ff, lift: 0x020610, sat: 1.0, contrast: 1.08, vig: 0.85 }, drone: 55, particles: 'snow',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 6, '#9fb3c4', '#5d7284', r); speckle(c, s, 900, ['#ffffff', '#dbe8f2', '#c4d6e4'], 3, 16, r); cracks(c, s, 14, 'rgba(60,85,110,.6)', 2, r); grain(c, s, r, 0.04); }, 3);
      ringFloor(g, floorTex, { rough: 0.55, rimCol: 0x6d7a86 });
      terrain(g, { seed: 21, h: 22, base: -0.2, low: 0xd8e4ee, high: 0xeef4fa, peak: 0xffffff, scale: 0.035, rampD: 22, rough: 0.7 });
      const stone = std(0x7d8a96, { rough: 0.8 }), ice = std(0x9fe8ff, { rough: 0.08, extra: { transparent: true, opacity: 0.82, envMapIntensity: 2 }, emissive: 0x0b4a66, ei: 0.6 });
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.28, h = r() < 0.35 ? 1 + r() * 2 : 5 + r() * 4;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, h, 10), stone); p.position.set(Math.cos(a) * (R + 2.2), h / 2, Math.sin(a) * (R + 2.2)); p.castShadow = p.receiveShadow = true; g.add(p);
        if (h > 4 && r() < 0.6) { const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.2), stone); cap.position.set(p.position.x, h + 0.3, p.position.z); cap.castShadow = true; g.add(cap); }
      }
      scatter(g, new THREE.OctahedronGeometry(1, 0), ice, r, { n: 30, rmin: R + 3, rmax: R + 30, smin: 1, smax: 3.5, yScale: 2.2, sink: 0.2 });
      scatter(g, rockGeo(5), stone, r, { n: 24, rmin: R + 2, rmax: R + 20, smin: 0.6, smax: 2, sink: 0.4 });
      for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = 5 + r() * (R - 8), m = crystal(ice, 0.45 + r() * 0.3); m.position.set(Math.cos(a) * d, 0.7, Math.sin(a) * d); m.castShadow = true; g.add(m); }
    },
  },
  { // 2
    key: 'grave', name: "Serpent's Barrow", boss: { name: 'Vessrath, the Grave Serpent', kind: 'serpent', body: 0x1c2620, accent: 0x6bff9a, eye: 0xb8ffcf },
    sky: { top: 0x020605, hor: 0x1c3328, bot: 0x050806, sun: [-0.45, 0.4, -0.75], sunCol: 0xdfe8d0, sunSize: 0.03, moon: true, stars: 0.9, clouds: 0.4, cloudCol: 0x1a2620 },
    fog: [0x13241b, 16, 75], hemi: [0x7fb0a0, 0x050805, 0.4], keyL: [0xa8c8ff, 1.5], envI: 0.5, exposure: 1.1, bloom: 0.8,
    grade: { tint: 0xe4fff0, lift: 0x000604, sat: 0.92, contrast: 1.1, vig: 1.15 }, drone: 41, particles: 'wisps',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#1e2a1c'; c.fillRect(0, 0, s, s); speckle(c, s, 2000, ['#2c3b25', '#151d12', '#36301f', '#26331f'], 2, 10, r); grain(c, s, r, 0.08); }, 4);
      ringFloor(g, floorTex, { rough: 0.95, rimCol: 0x3a403c });
      const t = terrain(g, { seed: 31, h: 12, base: -0.1, low: 0x141c12, high: 0x232c1e, peak: 0x2e3326, scale: 0.05, rampD: 20 });
      const stone = std(0x5a605c, { rough: 0.9 }), wood = std(0x2a2018, { rough: 1 }), iron = std(0x1a1a1a, { rough: 0.5, metal: 0.8 });
      for (let i = 0; i < 40; i++) {
        const a = r() * 6.28, d = R + 2 + r() * 16, gr = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4 + r() * 0.6, 0.25), stone); slab.position.y = 0.7; gr.add(slab);
        if (r() < 0.4) { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 12, 1, false, 0, Math.PI), stone); top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.position.y = 1.45; gr.add(top); }
        if (r() < 0.3) { const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.22), stone); cross.position.y = 1.1; gr.add(cross); }
        gr.position.set(Math.cos(a) * d, t.userData.height(Math.cos(a) * d, Math.sin(a) * d), Math.sin(a) * d); gr.rotation.y = -a + Math.PI / 2 + (r() - 0.5) * 0.4; gr.rotation.z = (r() - 0.5) * 0.25; g.add(shadowAll(gr));
      }
      for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = R + 8 + r() * 22, tr = deadTree(wood, r, 5 + r() * 6); tr.position.set(Math.cos(a) * d, t.userData.height(Math.cos(a) * d, Math.sin(a) * d) - 0.3, Math.sin(a) * d); g.add(tr); }
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28; if (i % 12 === 0) continue; const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), iron); p.position.set(Math.cos(a) * (R + 1.4), 0.8, Math.sin(a) * (R + 1.4)); p.castShadow = true; g.add(p); }
      const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 1.4, 0.05, 4, 96), iron); rail.rotation.x = Math.PI / 2; rail.position.y = 1.4; g.add(rail);
      for (let i = 0; i < 5; i++) { const a = r() * 6.28, d = R + 3 + r() * 6, gl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), glow(0x6bff9a, 4)); gl.position.set(Math.cos(a) * d, 0.3, Math.sin(a) * d); g.add(gl); }
    },
  },
  { // 3
    key: 'storm', name: 'Stormspire Rooftop', boss: { name: 'Aurunax, the Storm Titan', kind: 'titan', body: 0x2a2436, accent: 0xb07cff, eye: 0xe8d8ff },
    sky: { top: 0x06040c, hor: 0x2a2244, bot: 0x0a0812, sun: [0.2, 0.3, -0.9], sunCol: 0x8a70ff, sunSize: 0.01, clouds: 1.0, cloudCol: 0x2a2440 },
    fog: [0x221c3a, 24, 100], hemi: [0x9a90d0, 0x0a0810, 0.45], keyL: [0xc8c0ff, 1.8], envI: 0.6, exposure: 1.1, bloom: 0.75,
    grade: { tint: 0xeee8ff, lift: 0x04020a, sat: 0.95, contrast: 1.12, vig: 1.05 }, drone: 49, particles: 'rain',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 8, '#4a4652', '#1e1b24', r, 34); speckle(c, s, 600, ['#5a5664', '#34313c'], 2, 8, r); cracks(c, s, 12, 'rgba(20,18,24,.7)', 2, r); grain(c, s, r); }, 3);
      ringFloor(g, floorTex, { rough: 0.35, metal: 0.05, bump: 3 }); // wet stone
      const stone = std(0x4a4652, { rough: 0.6 }), dark = std(0x2a2730, { rough: 0.8 }), roof = std(0x2b2440, { rough: 0.5, metal: 0.4 });
      for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28, h = i % 2 ? 1.0 : 1.7, b = new THREE.Mesh(new THREE.BoxGeometry(2.9, h, 0.8), stone); b.position.set(Math.cos(a) * (R + 1.2), h / 2, Math.sin(a) * (R + 1.2)); b.rotation.y = -a + Math.PI / 2; b.castShadow = b.receiveShadow = true; g.add(b); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 4, 60, 40, 1, true), dark); base.position.y = -30; g.add(base);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * 6.28 + r() * 0.5, d = 40 + r() * 30, h = 14 + r() * 24, tw = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, h + 30, 12), stone); body.position.y = h / 2 - 27; tw.add(body);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 12), roof); cone.position.y = h - 12 + 3.5; tw.add(cone);
        for (let k = 0; k < 3; k++) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), glow(0xffb060, 3)); win.position.set(0, h - 15 - k * 4, 2.5); tw.add(win); }
        tw.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); tw.lookAt(0, 0, 0); g.add(tw);
      }
      for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 0.4, p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 10), stone); p.position.set(Math.cos(a) * (R + 2.8), 3.5, Math.sin(a) * (R + 2.8)); p.castShadow = true; g.add(p); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), glow(0xc8a8ff, 4)); orb.position.set(p.position.x, 7.4, p.position.z); g.add(orb); }
    },
  },
  { // 4
    key: 'dunes', name: 'Sunscorched Dunes', boss: { name: 'Zharkul, the Dune Tyrant', kind: 'tyrant', body: 0x4a3a22, accent: 0xffb030, eye: 0xffe080 },
    sky: { top: 0x2a68b8, hor: 0xf2d2a0, bot: 0xd8b888, sun: [0.5, 0.55, -0.65], sunCol: 0xfff0d0, sunSize: 0.022, clouds: 0.25, cloudCol: 0xfff4e0 },
    fog: [0xe8c898, 35, 160], hemi: [0xbcd8ff, 0x8a6a40, 0.6], keyL: [0xfff0d8, 3.4], envI: 1.0, exposure: 0.95, bloom: 0.4,
    grade: { tint: 0xfff2e0, lift: 0x080400, sat: 1.1, contrast: 1.05, vig: 0.8 }, drone: 44, particles: 'sand',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 5, '#c8a878', '#8a6a44', r, 30); speckle(c, s, 1600, ['#e0c494', '#b8945e', '#d8b886'], 2, 12, r); cracks(c, s, 18, 'rgba(90,60,30,.5)', 2, r); grain(c, s, r); }, 3);
      ringFloor(g, floorTex, { rough: 0.9, rimCol: 0x9a7a50 });
      const sandTex = canvasTex(256, (c, s) => { c.fillStyle = '#d8b888'; c.fillRect(0, 0, s, s); speckle(c, s, 800, ['#e8cc98', '#c09860'], 1, 3, r); });
      const t = terrain(g, { seed: 41, h: 16, base: -0.2, low: 0xcfae7a, high: 0xe2c48e, peak: 0xf0d8a6, dunes: true, scale: 0.03, rampD: 24, tex: sandTex });
      const sand = std(0xc8a070, { rough: 0.85 }), bone = std(0xe8dcc0, { rough: 0.6 });
      for (let i = 0; i < 10; i++) { // ruined sandstone columns
        const a = i / 10 * 6.28 + 0.2, h = r() < 0.4 ? 1.5 + r() * 2 : 5 + r() * 5, p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, h, 10), sand);
        p.position.set(Math.cos(a) * (R + 2.4), h / 2, Math.sin(a) * (R + 2.4)); p.rotation.z = (r() - 0.5) * 0.15; p.castShadow = p.receiveShadow = true; g.add(p);
      }
      for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = R + 14 + r() * 20, h = 10 + r() * 8, ob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.4, h, 4), sand); ob.position.set(Math.cos(a) * d, h / 2 + t.userData.height(Math.cos(a) * d, Math.sin(a) * d) - 1, Math.sin(a) * d); ob.rotation.z = (r() - 0.5) * 0.3; ob.castShadow = true; g.add(ob); }
      for (let i = 0; i < 3; i++) { // half-buried rib cages
        const a = r() * 6.28, d = R + 7 + r() * 10, rib = new THREE.Group();
        for (let k = 0; k < 6; k++) { const tr = new THREE.Mesh(new THREE.TorusGeometry(2.6 - k * 0.2, 0.16, 6, 20, Math.PI), bone); tr.position.z = k * 1.1; rib.add(tr); }
        rib.position.set(Math.cos(a) * d, -0.4, Math.sin(a) * d); rib.rotation.y = r() * 6; g.add(shadowAll(rib));
      }
      scatter(g, rockGeo(6), std(0xa8845a, { rough: 0.9 }), r, { n: 26, rmin: R + 2, rmax: R + 40, smin: 0.6, smax: 2.6, sink: 0.45, hf: t.userData.height });
    },
  },
  { // 5
    key: 'web', name: 'Webwood Hollow', boss: { name: 'Arachnyx, the Web Matriarch', kind: 'spider', body: 0x1a1a1e, accent: 0xb6ff4a, eye: 0xff3030 },
    sky: { top: 0x04060a, hor: 0x1e2a26, bot: 0x060806, sun: [0.1, 0.6, -0.8], sunCol: 0x9adf9a, sunSize: 0.015, stars: 0.4 },
    fog: [0x1a2622, 12, 62], hemi: [0x8ab0a0, 0x080a08, 0.45], keyL: [0xb8e8c8, 1.4], envI: 0.5, exposure: 1.15, bloom: 0.9,
    grade: { tint: 0xeaffe8, lift: 0x020604, sat: 1.05, contrast: 1.1, vig: 1.15 }, drone: 38, particles: 'spores',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#1c2218'; c.fillRect(0, 0, s, s); speckle(c, s, 2200, ['#28331f', '#11160e', '#2e2a1c', '#36452a'], 2, 12, r); c.strokeStyle = 'rgba(220,230,220,.08)'; c.lineWidth = 1; for (let i = 0; i < 30; i++) { c.beginPath(); c.moveTo(r() * s, r() * s); c.lineTo(r() * s, r() * s); c.stroke(); } grain(c, s, r, 0.08); }, 4);
      ringFloor(g, floorTex, { rough: 0.95, rimCol: 0x2a2620 });
      const t = terrain(g, { seed: 51, h: 10, base: -0.1, low: 0x161c12, high: 0x222a1a, scale: 0.06 });
      const bark = std(0x2a221c, { rough: 1 }), silk = new THREE.MeshStandardMaterial({ color: 0xdfe8e0, roughness: 0.6, transparent: true, opacity: 0.85, emissive: new THREE.Color(0x203020), emissiveIntensity: 0.4 });
      const trees = [];
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * 6.28 + (r() - 0.5) * 0.2, d = R + 3 + r() * 10, h = 10 + r() * 10, tr = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.0, h, 8), bark); trunk.position.y = h / 2; trunk.rotation.z = (r() - 0.5) * 0.15; tr.add(trunk);
        for (let k = 0; k < 4; k++) { const bl = 2 + r() * 3, b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, bl, 6), bark), ba = r() * 6.28; b.position.set(Math.cos(ba) * bl * 0.4, h * (0.5 + r() * 0.4), Math.sin(ba) * bl * 0.4); b.rotation.set(Math.sin(ba) * 1.0, 0, -Math.cos(ba) * 1.0); tr.add(b); }
        tr.position.set(Math.cos(a) * d, t.userData.height(Math.cos(a) * d, Math.sin(a) * d) - 0.2, Math.sin(a) * d); g.add(shadowAll(tr)); trees.push([tr.position.x, h, tr.position.z]);
      }
      // web strands between trees and down to the ground
      const pts = [];
      for (let i = 0; i < trees.length; i++) { const A = trees[i], B = trees[(i + 1) % trees.length]; for (let k = 0; k < 3; k++) { const y1 = A[1] * (0.4 + r() * 0.5), y2 = B[1] * (0.4 + r() * 0.5); pts.push(A[0], y1, A[2], B[0], y2, B[2]); } pts.push(A[0], A[1] * 0.6, A[2], A[0] * 0.92, 0, A[2] * 0.92); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xcfe0d0, transparent: true, opacity: 0.35 })));
      for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = R + 2 + r() * 8, c = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), silk); c.scale.set(1, 1.9, 1); c.position.set(Math.cos(a) * d, 2 + r() * 4, Math.sin(a) * d); c.castShadow = true; g.add(c); }
      const cap = glow(0x40ffd0, 2.5), stem = std(0xd8d0c0, { rough: 0.7 });
      for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = R + 1.2 + r() * 8, s = 0.3 + r() * 0.6, m = new THREE.Group(); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s * 3, 0.09 * s * 3, s * 1.4, 6), stem); st.position.y = s * 0.7; m.add(st); const cp = new THREE.Mesh(new THREE.SphereGeometry(s * 0.6, 10, 6, 0, 6.3, 0, 1.4), cap); cp.position.y = s * 1.3; m.add(cp); m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(m); }
    },
  },
  { // 6
    key: 'moon', name: 'Bloodmoon Glade', boss: { name: 'Fenrask, the Moon Devourer', kind: 'wolf', body: 0x24202a, accent: 0xff3040, eye: 0xffd0d0 },
    sky: { top: 0x06030a, hor: 0x3a1018, bot: 0x08040a, sun: [0.15, 0.32, -0.93], sunCol: 0xff3a30, sunSize: 0.06, moon: true, stars: 1.0, clouds: 0.35, cloudCol: 0x2a1016 },
    fog: [0x2a0e14, 20, 95], hemi: [0xc08098, 0x1a0e12, 0.75], keyL: [0xff9a90, 2.1], envI: 0.7, exposure: 1.25, bloom: 0.55,
    grade: { tint: 0xffecec, lift: 0x080002, sat: 1.05, contrast: 1.12, vig: 1.1 }, drone: 37, particles: 'fireflies',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { c.fillStyle = '#1c2216'; c.fillRect(0, 0, s, s); speckle(c, s, 2400, ['#26301c', '#141a0e', '#2e3a22', '#3a2a22'], 1, 8, r); for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(80,70,60,.45)'; c.beginPath(); c.arc(r() * s, r() * s, 14 + r() * 30, 0, 7); c.fill(); } grain(c, s, r, 0.08); }, 4);
      ringFloor(g, floorTex, { rough: 0.95, rim: false });
      const t = terrain(g, { seed: 61, h: 18, base: -0.1, low: 0x141a10, high: 0x1e2618, peak: 0x2a2c26, scale: 0.04, rampD: 24 });
      const leaf = std(0x14201a, { rough: 0.95 }), wood = std(0x2a2018, { rough: 1 }), stone = std(0x6a6a70, { rough: 0.85 });
      for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = R + 4 + r() * 40, h = 7 + r() * 9, p = pine(r, h, leaf, wood); p.position.set(Math.cos(a) * d, t.userData.height(Math.cos(a) * d, Math.sin(a) * d) - 0.2, Math.sin(a) * d); g.add(p); }
      for (let i = 0; i < 12; i++) { // standing-stone circle
        const a = i / 12 * 6.28, h = 2.6 + r() * 1.6, s = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.6), stone); s.position.set(Math.cos(a) * (R + 1.8), h / 2 - 0.1, Math.sin(a) * (R + 1.8)); s.rotation.y = -a + Math.PI / 2; s.rotation.z = (r() - 0.5) * 0.12; s.castShadow = s.receiveShadow = true; g.add(s);
        if (i % 3 === 0) { const lin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.7), stone); const a2 = a + 0.26; lin.position.set(Math.cos(a2) * (R + 1.8), h + 0.15, Math.sin(a2) * (R + 1.8)); lin.rotation.y = -a2 + Math.PI / 2; lin.castShadow = true; g.add(lin); }
      }
      const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 12), stone); altar.position.set(0, 0.25, -R + 4); altar.castShadow = altar.receiveShadow = true; g.add(altar);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), glow(0xff3040, 4)); ember.position.set(0, 0.9, -R + 4); g.add(ember);
      scatter(g, rockGeo(7), stone, r, { n: 20, rmin: R + 2, rmax: R + 20, smin: 0.5, smax: 1.6, sink: 0.4 });
    },
  },
  { // 7
    key: 'ossuary', name: 'Ossuary Depths', boss: { name: 'Skarnek, the Ossuary King', kind: 'lich', body: 0x30281e, accent: 0x50ffb0, eye: 0x90ffd0 },
    sky: { top: 0x020203, hor: 0x0c0a08, bot: 0x040302, sun: [0, 1, 0], sunCol: 0x000000, sunSize: 0.001 },
    fog: [0x0e0b08, 16, 70], hemi: [0x8a7a60, 0x100c08, 0.5], keyL: [0xffc890, 1.4], envI: 0.5, exposure: 1.15, bloom: 0.65,
    grade: { tint: 0xfff4e4, lift: 0x040302, sat: 0.95, contrast: 1.12, vig: 1.2 }, drone: 35, particles: 'ash',
    build(g, r) {
      const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 7, '#6a5e4c', '#2a241c', r, 36); speckle(c, s, 700, ['#7a6c56', '#4a4032', '#8a7c66'], 2, 8, r); for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(220,210,190,.35)'; c.beginPath(); c.ellipse(r() * s, r() * s, 6 + r() * 6, 2 + r() * 2, r() * 3, 0, 7); c.fill(); } grain(c, s, r); }, 3);
      ringFloor(g, floorTex, { rough: 0.8, rimCol: 0x3a3228 });
      const wallTex = canvasTex(512, (c, s) => { c.fillStyle = '#3a3228'; c.fillRect(0, 0, s, s); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const cx = x * 64 + 32, cy = y * 64 + 32; c.fillStyle = '#1a140e'; c.fillRect(cx - 24, cy - 26, 48, 52); c.fillStyle = '#d8ccb0'; c.beginPath(); c.arc(cx, cy - 2, 14, 0, 7); c.fill(); c.fillStyle = '#1a140e'; c.beginPath(); c.arc(cx - 5, cy - 3, 4, 0, 7); c.arc(cx + 5, cy - 3, 4, 0, 7); c.fill(); c.fillStyle = '#c8bca0'; c.fillRect(cx - 7, cy + 9, 14, 6); } grain(c, s, r); });
      wallTex.repeat.set(10, 2);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 9, R + 9, 18, 64, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, normalMap: normalFrom(wallTex, 3), roughness: 0.9, side: THREE.BackSide }));
      wall.material.normalMap.repeat.set(10, 2); wall.position.y = 8; wall.receiveShadow = true; g.add(wall);
      const ceil = new THREE.Mesh(new THREE.CircleGeometry(R + 9, 48), std(0x0c0a08)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 17; g.add(ceil);
      const ground = new THREE.Mesh(new THREE.RingGeometry(R + 0.7, R + 9.5, 64, 2), std(0x2a241c, { rough: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; g.add(ground);
      const stone = std(0x5a5044, { rough: 0.8 }), bone = std(0xd8ccb0, { rough: 0.6 }), gold = std(0xc8a050, { rough: 0.35, metal: 1 });
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 17, 10), stone); p.position.set(Math.cos(a) * (R + 5), 8.5, Math.sin(a) * (R + 5)); p.castShadow = p.receiveShadow = true; g.add(p); }
      scatter(g, new THREE.SphereGeometry(0.5, 8, 6), bone, r, { n: 70, rmin: R + 1, rmax: R + 8, smin: 0.25, smax: 0.6, sink: 0.3 });
      scatter(g, new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5), bone, r, { n: 60, rmin: R + 1, rmax: R + 8, smin: 0.5, smax: 1, sink: 0, tilt: 3 });
      this._fires = [];
      for (let i = 0; i < 4; i++) { // braziers with real lights
        const a = i / 4 * 6.28 + 0.785, x = Math.cos(a) * (R - 1.5), z = Math.sin(a) * (R - 1.5), b = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.4, 0.6, 12), gold); bowl.position.y = 1.6; b.add(bowl);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 8), gold); leg.position.y = 0.7; b.add(leg);
        const fire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 10), glow(0x50ffb0, 5)); fire.position.y = 2.4; b.add(fire);
        const L = new THREE.PointLight(0x60ffb8, 18, 18, 1.6); L.position.y = 2.6; b.add(L);
        b.position.set(x, 0, z); g.add(shadowAll(b)); fire.castShadow = false; this._fires.push([fire, L]);
      }
    },
    update(t) { if (this._fires) this._fires.forEach(([f, L], i) => { const k = 1 + Math.sin(t * 9 + i * 2) * 0.12 + Math.sin(t * 23 + i) * 0.06; f.scale.set(1, k, 1); L.intensity = 16 * k; }); },
  },
];

// The shared hub: a floating cloud realm at twilight where the group completes quests.
export const HUB = {
  key: 'hub', name: 'Cloudhold Sanctum', boss: null,
  sky: { top: 0x1a2050, hor: 0xffa070, bot: 0x4a3a70, sun: [0.55, 0.12, -0.83], sunCol: 0xffc080, sunSize: 0.035, clouds: 0.8, cloudCol: 0xffd0c0, stars: 0.25 },
  fog: [0x9a7aa8, 40, 160], hemi: [0xffd8a8, 0x3a2a5a, 0.6], keyL: [0xffc890, 2.6], envI: 1.0, exposure: 1.0, bloom: 0.6,
  grade: { tint: 0xfff4ec, lift: 0x06020a, sat: 1.1, contrast: 1.05, vig: 0.85 }, drone: 0, particles: 'motes',
  build(g, r) {
    const floorTex = canvasTex(512, (c, s) => { tiles(c, s, 5, '#cfc4b0', '#8a7e6a', r); speckle(c, s, 600, ['#e8dfcc', '#b8ab94'], 2, 9, r); cracks(c, s, 8, 'rgba(110,96,80,.5)', 2, r); grain(c, s, r, 0.04); }, 3);
    ringFloor(g, floorTex, { rough: 0.6, rimCol: 0xb8a888 });
    const inlay = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 96), std(0xc8a050, { rough: 0.3, metal: 1 })); inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.02; inlay.receiveShadow = true; g.add(inlay);
    const rock = std(0x6a5a78, { rough: 0.9 }), cloud = new THREE.MeshStandardMaterial({ color: 0xfff0f8, roughness: 1, emissive: new THREE.Color(0x4a3050), emissiveIntensity: 0.5 });
    const under = new THREE.Mesh(new THREE.ConeGeometry(R + 0.6, 18, 32, 4), rock); under.rotation.x = Math.PI; under.position.y = -9.1; g.add(under);
    const puff = new THREE.IcosahedronGeometry(1, 2);
    const cl = new THREE.InstancedMesh(puff, cloud, 220), d = new THREE.Object3D();
    for (let i = 0; i < 55; i++) { const a = r() * 6.28, dd = R + 6 + r() * 60, y = -14 + r() * 16; for (let k = 0; k < 4; k++) { const s = 2.5 + r() * 5; d.position.set(Math.cos(a) * dd + (r() - .5) * 9, y + (r() - .5) * 2, Math.sin(a) * dd + (r() - .5) * 9); d.scale.set(s, s * 0.55, s); d.updateMatrix(); cl.setMatrixAt(i * 4 + k, d.matrix); } }
    g.add(cl);
    for (let i = 0; i < 8; i++) { const a = r() * 6.28, dd = R + 14 + r() * 30, s = 2 + r() * 3, isl = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(s, s * 2.2, 8), rock); c.rotation.x = Math.PI; isl.add(c); const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.4, 8), std(0x5a7a4a)); top.position.y = s * 1.1; c.position.y = 0; top.position.y = 1.1 * s - s * 1.1 + 0.2; isl.add(top); isl.position.set(Math.cos(a) * dd, 2 + r() * 10, Math.sin(a) * dd); g.add(shadowAll(isl)); }
    const arch = std(0xe8dcc4, { rough: 0.55 }), gold = std(0xd0a858, { rough: 0.3, metal: 1 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + 0.39, p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6, 12), arch); p.position.set(Math.cos(a) * (R + 1.5), 3, Math.sin(a) * (R + 1.5)); p.castShadow = p.receiveShadow = true; g.add(p); const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.4), gold); cap.position.set(p.position.x, 6.15, p.position.z); cap.castShadow = true; g.add(cap); }
  },
};
