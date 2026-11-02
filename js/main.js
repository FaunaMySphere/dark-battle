// Dark Battle — main game. three.js PWA, co-op boss fight in one shared world.
import * as THREE from 'three';
import { ARENAS, R, rng, HUB } from './arenas.js';
import { ATK, atkTele, bossHp, staggerVal, createBossView, MODS, BOSS_RADIUS, lvlDmg } from './boss.js';
import { hueOf } from './hero.js';
import { FORMS, FORM_KEYS, SWITCH_CD } from './forms.js';
import { Avatar, ANIM_DUR, preloadForms, FORM_ACT } from './avatar.js';
import { newWorld, stepWorld, shrinePos, orbPos, relicPos, orbCount, relicCount, orbsGot, relicsGot, hubDone, hasQ, SHRINE_R, PORTAL_TIME } from './world.js';
import { questLabel, advanceQuests, wispPos } from './quests.js';
import { QuestView } from './questview.js';
import { loadModel, onModel, modelReady } from './models.js';
import { Gfx, Q_LEVELS, skyMaterial, copySky } from './gfx.js';
import { Net } from './net.js';
import { sfx, unlockAudio, setMuted, isMuted, setDrone } from './audio.js';

const VERSION = '2.0.0';
const Q = new URLSearchParams(location.search);
const SOLO = Q.has('solo');
const ROOM = (Q.get('room') || 'world1').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'world1';
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
const now = () => performance.now() / 1000;

// ---------------- renderer / scene ----------------
const canvas = $('c');
const gfx = new Gfx(canvas, IS_TOUCH), renderer = gfx.renderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(-10, 25, 12); scene.add(sun); scene.add(sun.target);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 }); sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
gfx.attach(scene, camera, sun);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), skyMaterial()); skyDome.frustumCulled = false; skyDome.renderOrder = -1; scene.add(skyDome);
function resize() { gfx.resize(); }
addEventListener('resize', resize); resize();

// ---------------- arena ----------------
let sceneKey = null, arena = null, arenaGroup = null, bossModel = null, objGroup = null;
const ambient = { pts: null, vel: null, type: '' };
const AMB_N = IS_TOUCH ? 240 : 480;
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
const AMB = { embers: [0xff7a30, 0.18, 1], snow: [0xffffff, 0.16, 0], wisps: [0x70ffa8, 0.35, 1], rain: [0x9ab0ff, 0.09, 0], motes: [0xffd890, 0.22, 1], sand: [0xe8c890, 0.12, 0], spores: [0xb6ff4a, 0.2, 1], fireflies: [0xffe070, 0.2, 1], ash: [0xa09890, 0.14, 0] };
const FLOATY = t => t === 'wisps' || t === 'motes' || t === 'spores' || t === 'fireflies';
function setScene(key) { // 'hub' or arena index
  if (key === sceneKey) return;
  sceneKey = key; arena = key === 'hub' ? HUB : ARENAS[key];
  if (arenaGroup) { scene.remove(arenaGroup); disposeTree(arenaGroup); }
  if (bossModel) { scene.remove(bossModel.root); bossModel.dispose(); disposeTree(bossModel.root); bossModel = null; }
  qview.clear();
  arenaGroup = new THREE.Group(); arena.build(arenaGroup, rng(1234 + (key === 'hub' ? 99 : key) * 77)); scene.add(arenaGroup);
  copySky(skyDome.material, arena.sky); scene.environment = gfx.buildEnv(arena.sky); scene.environmentIntensity = arena.envI ?? 0.7;
  gfx.setLook(arena);
  { const sd = arena.sky.sun || [0.3, 0.5, -0.8]; sun.position.set(sd[0] * 50, Math.max(0.6, sd[1]) * 50, sd[2] * 50); }
  scene.fog = new THREE.Fog(arena.fog[0], arena.fog[1], arena.fog[2]);
  hemi.color.setHex(arena.hemi[0]); hemi.groundColor.setHex(arena.hemi[1]); hemi.intensity = arena.hemi[2];
  sun.color.setHex(arena.keyL[0]); sun.intensity = arena.keyL[1];
  ensureBossModel();
  if (ambient.pts) { scene.remove(ambient.pts); ambient.pts.geometry.dispose(); ambient.pts.material.dispose(); }
  ambient.type = arena.particles;
  const g = new THREE.BufferGeometry(), p = new Float32Array(AMB_N * 3); ambient.vel = new Float32Array(AMB_N * 3);
  for (let k = 0; k < AMB_N; k++) respawnAmb(p, k, true);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const [col, size, add] = AMB[arena.particles];
  ambient.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: arena.particles === 'rain' ? size : size * 1.6, map: arena.particles === 'rain' ? null : dotTex, transparent: true, opacity: arena.particles === 'rain' ? 0.55 : 0.85, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  scene.add(ambient.pts);
  setDrone(arena.drone);
  objKey = '';
}
let objKey = '';
function ensureBossModel() { if (bossModel || !arena || !arena.boss) return; const v = createBossView(arena.boss); if (v) { bossModel = v; scene.add(v.root); } }
function respawnAmb(p, k, init) {
  const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 34, t = ambient.type;
  p[k * 3] = Math.cos(a) * d; p[k * 3 + 2] = Math.sin(a) * d;
  p[k * 3 + 1] = t === 'embers' ? (init ? Math.random() * 14 : 0) : FLOATY(t) ? 0.5 + Math.random() * 5 : t === 'sand' ? Math.random() * 6 : init ? Math.random() * 22 : 22;
  if (t === 'sand' && !init) p[k * 3] = -38;
  const v = ambient.vel;
  if (t === 'embers') { v[k * 3] = (Math.random() - .5) * .6; v[k * 3 + 1] = 1 + Math.random() * 2; v[k * 3 + 2] = (Math.random() - .5) * .6; }
  else if (t === 'sand') { v[k * 3] = 5 + Math.random() * 4; v[k * 3 + 1] = (Math.random() - .6) * .4; v[k * 3 + 2] = 1 + Math.random(); }
  else if (t === 'ash') { v[k * 3] = .2 + Math.random() * .3; v[k * 3 + 1] = -0.5 - Math.random() * .5; v[k * 3 + 2] = (Math.random() - .5) * .4; }
  else if (t === 'snow') { v[k * 3] = .3 + Math.random() * .4; v[k * 3 + 1] = -1 - Math.random(); v[k * 3 + 2] = (Math.random() - .5) * .5; }
  else if (t === 'rain') { v[k * 3] = 1.5; v[k * 3 + 1] = -22 - Math.random() * 8; v[k * 3 + 2] = .5; }
  else { v[k * 3] = (Math.random() - .5) * .8; v[k * 3 + 1] = (Math.random() - .5) * .3; v[k * 3 + 2] = (Math.random() - .5) * .8; }
}
function updateAmbient(dt, t) {
  if (!ambient.pts) return;
  const p = ambient.pts.geometry.attributes.position.array, v = ambient.vel, ty = ambient.type;
  for (let k = 0; k < AMB_N; k++) {
    const i = k * 3;
    p[i] += v[i] * dt; p[i + 1] += v[i + 1] * dt; p[i + 2] += v[i + 2] * dt;
    if (FLOATY(ty)) { p[i + 1] += Math.sin(t * 1.3 + k) * dt * 0.4; if (Math.random() < dt * 0.05) respawnAmb(p, k, true); }
    if (p[i + 1] < 0 || p[i + 1] > 16 && ty === 'embers' || Math.abs(p[i]) > 40 || Math.abs(p[i + 2]) > 40) respawnAmb(p, k, false);
  }
  ambient.pts.geometry.attributes.position.needsUpdate = true;
}
function disposeTree(o) { o.traverse(c => { if (c.userData.shared) return; if (c.geometry) c.geometry.dispose(); if (c.material) { const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach(m => { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); }); } }); }

// ---------------- FX: telegraphs, projectiles, sparks ----------------
const COL_BLOCK = new THREE.Color(0xffa020), COL_UNBLOCK = new THREE.Color(0xff1a1a), COL_LIVE = new THREE.Color(0xfff2d0);
const ringGeo = new THREE.RingGeometry(0.93, 1, 48), discGeo = new THREE.CircleGeometry(1, 40), planeGeo = new THREE.PlaneGeometry(1, 1);
function mkMat() { return new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }
const tele = [];
function teleItem(i) {
  while (tele.length <= i) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, mkMat()), disc = new THREE.Mesh(discGeo, mkMat()), fillDisc = new THREE.Mesh(discGeo, mkMat());
    const rect = new THREE.Mesh(planeGeo, mkMat()), rectFill = new THREE.Mesh(planeGeo, mkMat());
    [ring, disc, fillDisc, rect, rectFill].forEach(m => { m.rotation.x = -Math.PI / 2; g.add(m); });
    disc.material.opacity = 0.12; rect.material.opacity = 0.14;
    g.position.y = 0.06; g.visible = false; scene.add(g);
    tele.push({ g, ring, disc, fillDisc, rect, rectFill });
  }
  return tele[i];
}
function drawHazards(list) {
  let i = 0;
  for (const h of list) {
    const T = teleItem(i++); T.g.visible = true;
    const col = h.live ? COL_LIVE : h.u ? COL_UNBLOCK : COL_BLOCK;
    [T.ring, T.disc, T.fillDisc, T.rect, T.rectFill].forEach(m => { m.material.color.copy(col); m.visible = false; });
    if (h.k === 'circle' || h.k === 'ring') {
      T.g.position.set(h.x, 0.06 + i * 0.002, h.z); T.g.rotation.y = 0;
      T.ring.visible = true; T.ring.scale.setScalar(h.r); T.ring.material.opacity = h.k === 'ring' ? 0.9 : 0.75;
      if (h.k === 'circle') { T.disc.visible = true; T.disc.scale.setScalar(h.r); T.fillDisc.visible = true; T.fillDisc.scale.setScalar(Math.max(0.01, h.r * h.p)); T.fillDisc.material.opacity = h.live ? 0.7 : 0.28; }
      else { T.ring.scale.setScalar(h.r); }
    } else if (h.k === 'rect') {
      const dx = h.x1 - h.x0, dz = h.z1 - h.z0, L = Math.hypot(dx, dz) || 1;
      T.g.position.set((h.x0 + h.x1) / 2, 0.07, (h.z0 + h.z1) / 2); T.g.rotation.y = Math.atan2(dx, dz);
      T.rect.visible = true; T.rect.scale.set(h.w, L, 1);
      T.rectFill.visible = true; T.rectFill.scale.set(h.w, Math.max(0.01, L * h.p), 1); T.rectFill.position.z = -(L - L * h.p) / 2; T.rectFill.material.opacity = h.live ? 0.7 : 0.3;
    }
  }
  for (; i < tele.length; i++) tele[i].g.visible = false;
}
// boss bolts
const BOLT_MAX = 48;
const boltMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), BOLT_MAX);
boltMesh.frustumCulled = false; scene.add(boltMesh);
// meteors
const meteorMeshes = [];
function meteorMesh(i) { while (meteorMeshes.length <= i) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xff6020 })); m.visible = false; scene.add(m); meteorMeshes.push(m); } return meteorMeshes[i]; }
// sparks
const SPARK_N = 260, sparkPos = new Float32Array(SPARK_N * 3), sparkVel = new Float32Array(SPARK_N * 3), sparkLife = new Float32Array(SPARK_N), sparkCol = new Float32Array(SPARK_N * 3);
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.42, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sparks.frustumCulled = false; scene.add(sparks);
let sparkI = 0;
function burst(x, y, z, n, color, speed = 8, up = 4) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = sparkI = (sparkI + 1) % SPARK_N;
    sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z;
    const a = Math.random() * 6.28, s = speed * (0.3 + Math.random());
    sparkVel[i * 3] = Math.cos(a) * s; sparkVel[i * 3 + 1] = up * (0.5 + Math.random()); sparkVel[i * 3 + 2] = Math.sin(a) * s;
    sparkLife[i] = 0.4 + Math.random() * 0.5; sparkCol[i * 3] = c.r; sparkCol[i * 3 + 1] = c.g; sparkCol[i * 3 + 2] = c.b;
  }
}
function updateSparks(dt) {
  for (let i = 0; i < SPARK_N; i++) {
    if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -50; continue; }
    sparkLife[i] -= dt; sparkVel[i * 3 + 1] -= 14 * dt;
    sparkPos[i * 3] += sparkVel[i * 3] * dt; sparkPos[i * 3 + 1] = Math.max(0.05, sparkPos[i * 3 + 1] + sparkVel[i * 3 + 1] * dt); sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
    const f = Math.max(0, 1 - dt * 2.2); sparkCol[i * 3] *= f; sparkCol[i * 3 + 1] *= f; sparkCol[i * 3 + 2] *= f;
  }
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
}
// lightning bolt line (storm arena + finisher flash)
const boltLineMat = new THREE.LineBasicMaterial({ color: 0xe8dcff, transparent: true, opacity: 1 });
const boltLines = [];
function lightning(x, z) {
  const pts = []; let px = x, pz = z;
  for (let y = 30; y >= 0; y -= 3) { pts.push(new THREE.Vector3(px, y, pz)); px = x + (Math.random() - .5) * 2.5; pz = z + (Math.random() - .5) * 2.5; }
  pts.push(new THREE.Vector3(x, 0, z));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltLineMat.clone()); l.userData.life = 0.25; scene.add(l); boltLines.push(l);
}
function updateLightning(dt) { for (let i = boltLines.length - 1; i >= 0; i--) { const l = boltLines[i]; l.userData.life -= dt; l.material.opacity = Math.max(0, l.userData.life * 4); if (l.userData.life <= 0) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); boltLines.splice(i, 1); } } }
// screen shake / hit-stop / damage numbers / toast
let shake = 0, hitStop = 0;
function addShake(a) { shake = Math.min(1.6, shake + a); }
const dnPool = [], dnLive = [];
const tmpV = new THREE.Vector3();
function dmgNum(x, y, z, text, cls) {
  let el = dnPool.pop(); if (!el) { el = document.createElement('div'); $('dmgnums').appendChild(el); }
  el.className = 'dn ' + (cls || ''); el.textContent = text; el.style.display = 'block';
  dnLive.push({ el, x: x + (Math.random() - .5), y, z: z + (Math.random() - .5), t: 0 });
  if (dnLive.length > 18) { const o = dnLive.shift(); o.el.style.display = 'none'; dnPool.push(o.el); }
}
function updateDmgNums(dt) {
  for (let i = dnLive.length - 1; i >= 0; i--) {
    const d = dnLive[i]; d.t += dt; d.y += dt * 1.6;
    tmpV.set(d.x, d.y, d.z).project(camera);
    if (d.t > 0.9 || tmpV.z > 1) { d.el.style.display = 'none'; dnPool.push(d.el); dnLive.splice(i, 1); continue; }
    d.el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px'; d.el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px'; d.el.style.opacity = String(1 - Math.max(0, d.t - 0.6) / 0.3);
  }
}
let toastT = 0;
function toast(msg, dur = 2.2) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); toastT = dur; }

// ---------------- local player ----------------
let myName = ''; try { myName = localStorage.getItem('db_name') || ''; } catch (_) {}
const net = SOLO ? null : new Net(ROOM);
const myId = net ? net.id : 'solo';
const me = {
  x: 0, z: 12, ry: Math.PI, vx: 0, vz: 0, hp: 100, max: 100, dead: false, deadT: 0,
  anim: 'idle', at: 0, combo: 0, comboWin: 0, queued: null, roll: null, rollCd: 0, blocking: false, blockT0: -9,
  fury: 0, furyT: 0, inv: 0, hurtT: 0, fid: -1, dmg: 0, stg: 0, fin: -1, entered: false, jt: 0,
  form: 'warrior', formCd: 0, scd: {}, sp: null, y: 0, vy: 0, shots: [],
  hitOnce: new Set(), speed: 0,
};
let hero = new Avatar('warrior', hueOf(myId)); scene.add(hero.root);
const qview = new QuestView(scene);
let modelsDirty = false; onModel(() => { modelsDirty = true; });
function rebuildModels() {
  modelsDirty = false;
  if (hero.proc && modelReady(hero.spec.model)) { scene.remove(hero.root); hero.dispose(); disposeTree(hero.root); hero = new Avatar(me.form, hueOf(myId)); scene.add(hero.root); if (me.sp && me.sp.k === 'shade') hero.setGhost(true); }
  for (const p of peers.values()) if (p.model && p.model.proc && modelReady(p.model.spec.model)) { scene.remove(p.model.root); p.model.dispose(); disposeTree(p.model.root); p.model = null; p.ghost = false; }
  ensureBossModel();
}
// load the current form first, then everything else (boss of the next arena first)
loadModel(FORM_ACT.warrior.model).then(() => preloadForms()).then(() => { for (let i = 0; i < 2; i++) { const A = ARENAS[(W.lvl - 1 + i) % ARENAS.length]; if (A.boss) createBossView(A.boss); } });

// ---------------- remote players ----------------
const peers = new Map(); // id -> {d, seen, model, label, lx, lz, lry}
function labelSprite() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 10; s.userData = { c, tex, key: '' }; return s;
}
function drawLabel(s, name, hp, dead) {
  const key = name + '|' + Math.round(hp / 5) + '|' + dead; if (s.userData.key === key) return; s.userData.key = key;
  const g = s.userData.c.getContext('2d'); g.clearRect(0, 0, 256, 64);
  g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = dead ? '#999' : '#fff'; g.strokeStyle = '#000'; g.lineWidth = 5;
  g.strokeText(name, 128, 28); g.fillText(name, 128, 28);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(48, 40, 160, 12); g.fillStyle = dead ? '#555' : '#5fd068'; g.fillRect(50, 42, 156 * Math.max(0, hp) / 100, 8);
  s.userData.tex.needsUpdate = true;
}
function peerModel(p) {
  if (p.model) return;
  p.form = p.d.fm || 'warrior'; p.model = new Avatar(p.form, hueOf(p.id)); scene.add(p.model.root);
  p.label = labelSprite(); p.label.position.y = 2.4; p.model.root.add(p.label);
  p.lx = p.d.x; p.lz = p.d.z; p.lry = p.d.ry;
}
function removePeer(id) { const p = peers.get(id); if (!p) return; if (p.model) { scene.remove(p.model.root); p.model.dispose(); disposeTree(p.model.root); } peers.delete(id); }
const activePeers = () => [...peers.values()].filter(p => p.d.en && now() - p.seen < 3.5);

// ---------------- input ----------------
const keys = {};
const input = { light: false, heavy: false, special: false, roll: false, fin: false, form: null };
let camYaw = Math.PI, camPitch = 0.28, lockOn = true;
try { lockOn = localStorage.getItem('db_lock') !== '0'; } catch (_) {}
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.code; if (keys[k]) { if (['Tab', 'Space'].includes(k)) e.preventDefault(); return; }
  keys[k] = true;
  if (k === 'KeyJ') input.light = true; if (k === 'KeyK') input.heavy = true;
  if (k === 'KeyE') input.special = true; if (k === 'Space') { input.roll = true; e.preventDefault(); }
  if (k === 'KeyF') input.fin = true; if (k === 'KeyT') toggleWheel();
  if (/^Digit[1-6]$/.test(k)) input.form = FORM_KEYS[+k.slice(5) - 1];
  if (k === 'Tab') { e.preventDefault(); toggleLock(); }
  if (k === 'KeyH') $('hints').classList.toggle('hidden');
  if (k === 'KeyL') toggleQuestLog();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseBlock = false; });
let mouseBlock = false;
canvas.addEventListener('mousedown', e => {
  if (!me.entered) return;
  if (!IS_TOUCH && document.pointerLockElement !== canvas && !lockOn) { canvas.requestPointerLock?.(); }
  if (e.button === 0) input.light = true; else if (e.button === 2) input.heavy = true; else if (e.button === 1) { e.preventDefault(); input.special = true; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) { camYaw -= e.movementX * 0.0032; camPitch = clamp(camPitch + e.movementY * 0.0025, -0.1, 0.9); if (lockOn && Math.abs(e.movementX) > 25) setLock(false); }
});
function setLock(v) { lockOn = v; $('btnlock').classList.toggle('off', !v); try { localStorage.setItem('db_lock', v ? '1' : '0'); } catch (_) {} }
function toggleLock() { setLock(!lockOn); toast(lockOn ? 'Lock-on: ON' : 'Lock-on: OFF', 1); }
// touch joystick + camera drag + buttons
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const camDrag = { id: null, x: 0, y: 0 };
$('joyzone').addEventListener('touchstart', e => {
  e.preventDefault(); const t = e.changedTouches[0]; if (joy.id !== null) return;
  joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0;
  const j = $('joy'); j.style.display = 'block'; j.style.left = t.clientX + 'px'; j.style.top = t.clientY + 'px';
}, { passive: false });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy; const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx *= m / d; dy *= m / d; } joy.x = dx / m; joy.y = dy / m; $('knob').style.transform = `translate(${dx}px,${dy}px)`; }
    if (t.identifier === camDrag.id) { const dx = t.clientX - camDrag.x, dy = t.clientY - camDrag.y; camDrag.x = t.clientX; camDrag.y = t.clientY; camYaw -= dx * 0.006; camPitch = clamp(camPitch + dy * 0.004, -0.1, 0.9); if (lockOn && Math.abs(dx) > 18) setLock(false); }
  }
}, { passive: false });
function endTouch(e) { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; $('joy').style.display = 'none'; $('knob').style.transform = ''; } if (t.identifier === camDrag.id) camDrag.id = null; } }
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; if (camDrag.id === null && t.clientX > innerWidth * 0.45) { camDrag.id = t.identifier; camDrag.x = t.clientX; camDrag.y = t.clientY; } }, { passive: false });
function tbtn(id, down, up) {
  const el = $(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); unlockAudio(); el.classList.add('on'); down(); }, { passive: false });
  const u = e => { e.preventDefault(); el.classList.remove('on'); up && up(); };
  el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false });
  el.addEventListener('mousedown', e => { e.preventDefault(); down(); }); el.addEventListener('mouseup', () => up && up());
}
let touchBlock = false;
tbtn('tLight', () => input.light = true); tbtn('tHeavy', () => input.heavy = true); tbtn('tRoll', () => input.roll = true);
tbtn('tSpecial', () => input.special = true); tbtn('tForm', () => toggleWheel());
tbtn('tBlock', () => touchBlock = true, () => touchBlock = false);
$('finprompt').addEventListener('touchstart', e => { e.preventDefault(); input.fin = true; }, { passive: false });
$('finprompt').addEventListener('click', () => input.fin = true);
$('btnlock').onclick = () => { toggleLock(); sfx.click(); };
$('btnmute').onclick = () => { setMuted(!isMuted()); $('btnmute').textContent = isMuted() ? '🔇' : '🔊'; };
$('btnmute').textContent = isMuted() ? '🔇' : '🔊';
$('btnfs').onclick = () => toggleFs();
setLock(lockOn);
function toggleFs() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else toast('Add to Home Screen for full screen', 2.5);
}
$('online').onclick = () => $('roster').classList.toggle('hidden');
const Q_NAMES = { auto: 'Auto', low: 'Low', med: 'Medium', high: 'High' };
function updQBtn() { $('btnq').textContent = '⚙' ; $('btnq').title = 'Graphics: ' + Q_NAMES[gfx.setting] + (gfx.setting === 'auto' ? ' (' + Q_NAMES[gfx.level] + ')' : ''); }
$('btnq').onclick = () => { const i = (Q_LEVELS.indexOf(gfx.setting) + 1) % Q_LEVELS.length; gfx.setSetting(Q_LEVELS[i]); updQBtn(); toast('Graphics: ' + Q_NAMES[gfx.setting] + (gfx.setting === 'auto' ? ' (' + Q_NAMES[gfx.level] + ')' : ''), 1.4); sfx.click(); };
updQBtn();
let questOpen = true; try { questOpen = localStorage.getItem('db_ql') !== '0'; } catch (_) {}
function toggleQuestLog() { questOpen = !questOpen; try { localStorage.setItem('db_ql', questOpen ? '1' : '0'); } catch (_) {} hudCache.tobjective = null; }
$('objective').addEventListener('click', toggleQuestLog);

// ---------------- form wheel ----------------
function buildWheel() {
  const g = $('wheelgrid'); g.innerHTML = '';
  FORM_KEYS.forEach((k, i) => {
    const F = FORMS[k], b = document.createElement('button');
    b.innerHTML = `<span class="ic">${F.icon}</span>${F.name}<small>${IS_TOUCH ? '' : '[' + (i + 1) + '] '}${F.special}</small>`;
    if (k === me.form) b.className = 'cur';
    b.onclick = () => { input.form = k; $('wheel').classList.add('hidden'); };
    g.appendChild(b);
  });
}
function toggleWheel() { if (!me.entered) return; const w = $('wheel'); if (w.classList.contains('hidden')) { buildWheel(); w.classList.remove('hidden'); } else w.classList.add('hidden'); }
$('wheelClose').onclick = () => $('wheel').classList.add('hidden');
function transform(k) {
  if (k === me.form || !FORMS[k]) return;
  if (me.formCd > 0) { toast(`Transform ready in ${me.formCd.toFixed(1)}s`, 1); return; }
  if (me.dead || me.anim === 'fin' || me.sp && me.sp.k === 'tower') return;
  scene.remove(hero.root); hero.dispose(); disposeTree(hero.root);
  me.form = k; hero = new Avatar(k, hueOf(myId)); hero.baseScale = 1; scene.add(hero.root); loadModel(FORM_ACT[k].model);
  me.formCd = SWITCH_CD; me.sp = null; me.anim = 'idle'; me.combo = 0;
  burst(me.x, 1.2, me.z, 40, 0xc8a0ff, 6, 6); sfx.heal(); toast(FORMS[k].icon + ' ' + FORMS[k].name, 1.2);
  updateFormBadge();
}
function updateFormBadge() { const F = FORMS[me.form]; $('formbadge').textContent = `${F.icon} ${F.name} · LMB ${F.light} · RMB ${F.heavy} · E ${F.special}`; if (IS_TOUCH) $('formbadge').textContent = `${F.icon} ${F.name} — ✨ ${F.special}`; }

// ---------------- world state ----------------
let W = newWorld(1, 1);
let leaderId = null, leaderJt = Infinity, lastWorldMsg = 0;
let prev = { qd: new Set(), qerr: 0, qk: {}, mode: '', lvl: 0, orbs: 0, rel: 0, sh: 0, st: '', fid: -1, sgi: 0, portal: false, ph: 1 };
const boss = () => (W.mode === 'boss' ? W.b : null);
const bossFighting = () => { const b = boss(); return b && (b.st === 'fight') ; };
const bossDisp = { x: 0, z: -8, y: 0, ry: 0, flash: 0 };
const shots = []; // visual projectiles {x,y,z,vx,vz,t,mine,dmg,stg,mesh,kind}
const novas = []; // mage novas {x,z,t,mine}
const shotGeo = new THREE.SphereGeometry(0.18, 6, 5);
const shotMats = { soldier: new THREE.MeshBasicMaterial({ color: 0xffe080 }), mage: new THREE.MeshBasicMaterial({ color: 0x8ad8ff }) };

function spawnPos(i = 0) { const a = hueOf(myId) * 6.28 + i; return { x: Math.cos(a) * (R - 4), z: Math.sin(a) * (R - 4) }; }
function respawnMe(where) {
  const p = where || spawnPos(); me.x = p.x; me.z = p.z; me.y = 0; me.vy = 0; me.hp = me.max; me.dead = false; me.deadT = 0;
  me.anim = 'idle'; me.sp = null; me.inv = 1.5; me.ry = Math.atan2(-me.x, -me.z); camYaw = me.ry;
  $('deadScreen').classList.add('hidden');
}

// ---------------- combat helpers ----------------
function bossDist() { return Math.hypot(bossDisp.x - me.x, bossDisp.z - me.z); }
// everything the player can hit: the boss, quest elites and shades
const myKills = new Set(), shadeDmg = new Map(); me.qd = {};
function targets() {
  const out = [], b = boss();
  if (b) out.push({ k: 'boss', x: bossDisp.x, z: bossDisp.z, r: BOSS_RADIUS });
  if (W.mode !== 'boss') for (const q of W.q || []) {
    if (q.done) continue;
    if (q.t === 'minib' && q.dt < 0 && q.mx) { const d = qview.miniDisp(q.id) || q; out.push({ k: 'mini', q, x: d.x, z: d.z, r: 1.0 }); }
    if (q.t === 'defend') for (const m of q.m) { if (myKills.has(m.id)) continue; const p = qview.shadePos(q.id, m.id) || m; out.push({ k: 'shade', q, m, x: p.x, z: p.z, r: 0.5 }); }
  }
  return out;
}
function nearestTarget(x, z, maxD) { let best = null, bd = maxD; for (const tg of targets()) { const d = Math.hypot(tg.x - x, tg.z - z) - tg.r; if (d < bd) { bd = d; best = tg; } } return best; }
function faceBossIfNear(r = 16) { const tg = nearestTarget(me.x, me.z, r); if (tg) me.ry = Math.atan2(tg.x - me.x, tg.z - me.z); }
function inMelee(range, arc = 1.3) {
  let best = null, bd = 1e9;
  for (const tg of targets()) {
    const dx = tg.x - me.x, dz = tg.z - me.z, d = Math.hypot(dx, dz);
    if (d > range + tg.r) continue;
    const a = Math.abs(((Math.atan2(dx, dz) - me.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if ((a < arc || d < tg.r + 0.6) && d - tg.r < bd) { bd = d - tg.r; best = tg; }
  }
  return best;
}
function aoe(x, z, r, dmg, stg, y, crit) { for (const tg of targets()) if (Math.hypot(tg.x - x, tg.z - z) < r + tg.r) dealDamage(dmg, stg, tg.x, y, tg.z, crit, tg); }
function hitQuest(tg, base, x, y, z, crit) {
  const d = Math.round(base * (furyOn() ? 1.6 : 1));
  dmgNum(x, y, z, d, crit || d >= 40 ? 'crit' : ''); burst(x, y, z, 10, 0xffc080, 6, 4); sfx.hit();
  if (tg.k === 'mini') { me.qd[tg.q.id] = (me.qd[tg.q.id] || 0) + d; qview.flashMini(tg.q.id); if (d >= 30) hitStop = Math.max(hitStop, 0.05); }
  else if (tg.k === 'shade') { const md = (shadeDmg.get(tg.m.id) || 0) + d; shadeDmg.set(tg.m.id, md); if (md >= tg.m.hp) { myKills.add(tg.m.id); burst(tg.x, 1.2, tg.z, 26, 0x9040ff, 7, 4); } }
}
const furyOn = () => me.sp && me.sp.k === 'fury';
const unstop = () => me.sp && me.sp.k === 'unstop';
function dealDamage(base, stg, x, y, z, crit, tg) {
  if (tg && tg.k !== 'boss') return hitQuest(tg, base, x, y, z, crit);
  const b = boss(); if (!b || (b.st !== 'fight')) { burst(x, y, z, 6, 0xaaaaaa, 3, 2); return; }
  let d = base * (furyOn() ? 1.6 : 1) * (b.sg ? 1.5 : 1); d = Math.round(d);
  me.dmg += d; me.stg += stg * (unstop() ? 2.5 : 1) * (b.sg ? 0 : 1);
  dmgNum(x, y, z, d, crit || d >= 40 ? 'crit' : ''); burst(x, y, z, crit ? 26 : 12, arena.boss ? arena.boss.accent : 0xffffff, 8, 5);
  bossDisp.flash = 0.12; sfx.hit();
  if (d >= 30) { hitStop = Math.max(hitStop, crit ? 0.14 : 0.07); addShake(crit ? 0.6 : 0.3); }
}
function fireShot(kind, dmg, stg, speed) {
  const dx = Math.sin(me.ry), dz = Math.cos(me.ry);
  const s = { x: me.x + dx * 0.8, y: 1.4, z: me.z + dz * 0.8, vx: dx * speed, vz: dz * speed, t: 0, mine: true, dmg, stg, kind };
  s.mesh = new THREE.Mesh(shotGeo, shotMats[kind]); s.mesh.position.set(s.x, s.y, s.z); scene.add(s.mesh); shots.push(s);
  netFx({ t: 'shot', kd: kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2), vx: +s.vx.toFixed(2), vz: +s.vz.toFixed(2) });
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt;
    const ht = s.kind === 'mage' && s.mine ? nearestTarget(s.x, s.z, 30) : null;
    if (ht) { // gentle homing
      const dx = ht.x - s.x, dz = ht.z - s.z, d = Math.hypot(dx, dz) || 1, sp = Math.hypot(s.vx, s.vz);
      s.vx = lerp(s.vx, dx / d * sp, dt * 3); s.vz = lerp(s.vz, dz / d * sp, dt * 3);
    }
    s.x += s.vx * dt; s.z += s.vz * dt; s.mesh.position.set(s.x, s.y, s.z);
    let dead = s.t > 1.2 || Math.hypot(s.x, s.z) > R + 8;
    if (!dead) for (const tg of (s.mine ? targets() : boss() ? [{ k: 'boss', x: bossDisp.x, z: bossDisp.z, r: BOSS_RADIUS }] : [])) if (Math.hypot(s.x - tg.x, s.z - tg.z) < tg.r + 0.25) { dead = true; if (s.mine) dealDamage(s.dmg, s.stg, s.x, s.y + 1, s.z, false, tg); else burst(s.x, s.y, s.z, 6, 0xffffff, 4, 3); break; }
    if (dead) { scene.remove(s.mesh); shots.splice(i, 1); }
  }
  for (let i = novas.length - 1; i >= 0; i--) {
    const n = novas[i]; n.t += dt;
    if (!n.mesh) { n.mesh = new THREE.Mesh(discGeo, mkMat()); n.mesh.material.color.setHex(0x8ad8ff); n.mesh.rotation.x = -Math.PI / 2; n.mesh.position.set(n.x, 0.1, n.z); scene.add(n.mesh); }
    n.mesh.scale.setScalar(4 * Math.min(1, n.t / 0.8)); n.mesh.material.opacity = 0.25 + 0.3 * Math.sin(n.t * 20);
    if (n.t >= 0.8) {
      burst(n.x, 1.5, n.z, 40, 0x8ad8ff, 10, 8); lightning(n.x, n.z); addShake(0.3);
      if (n.mine) aoe(n.x, n.z, 4, 42, 14, 4);
      scene.remove(n.mesh); novas.splice(i, 1);
    }
  }
}
// walls & wards (own + peers)
function activeWalls() { const out = []; if (me.wall && me.wall.until > now()) out.push(me.wall); for (const p of peers.values()) if (p.wall && p.wall.until > now()) out.push(p.wall); return out; }
function activeWards() { const out = []; if (me.ward && me.ward.until > now()) out.push(me.ward); for (const p of peers.values()) if (p.ward && p.ward.until > now()) out.push(p.ward); return out; }
function segX(ax, az, bx, bz, cx, cz, dx, dz) { const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-6) return false; const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; }
function wallEnds(w) { const c = Math.cos(w.ry), s = Math.sin(w.ry); return [w.x - c * 2.4, w.z + s * 2.4, w.x + c * 2.4, w.z - s * 2.4]; }
function boltBlocked(ox, oz, x, z, walls) { for (const w of walls) { const [a, b, c, d] = wallEnds(w); if (segX(ox, oz, x, z, a, b, c, d)) return true; } return false; }
const wallMeshes = new Map();
const wallGeo = new THREE.BoxGeometry(4.8, 2.4, 0.4), wallMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48, emissive: new THREE.Color(0x201008) });
const wardMat = mkMat(); wardMat.color.setHex(0x60ffb0);
function syncWallWardMeshes() {
  const want = new Map();
  activeWalls().forEach((w, i) => want.set('w' + w.key, w)); activeWards().forEach((w, i) => want.set('d' + w.key, w));
  for (const [k, m] of wallMeshes) if (!want.has(k)) { scene.remove(m); wallMeshes.delete(k); }
  for (const [k, w] of want) {
    let m = wallMeshes.get(k);
    if (!m) { if (k[0] === 'w') { m = new THREE.Mesh(wallGeo, wallMat); m.position.y = 1.2; } else { m = new THREE.Mesh(discGeo, wardMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.08; m.scale.setScalar(6); } scene.add(m); wallMeshes.set(k, m); }
    m.position.x = w.x; m.position.z = w.z; if (k[0] === 'w') m.rotation.y = w.ry; else wardMat.opacity = 0.18 + 0.08 * Math.sin(now() * 4);
  }
}

// ---------------- local player update ----------------
function startAnim(a) { me.anim = a; me.at = 0; me.hitDone = false; }
const busy = () => ANIM_DUR[me.anim] && me.at < ANIM_DUR[me.anim];
function updateMe(dt, gdt) {
  me.formCd = Math.max(0, me.formCd - dt); me.inv = Math.max(0, me.inv - dt);
  for (const k in me.scd) me.scd[k] = Math.max(0, me.scd[k] - dt);
  if (me.sp) { me.sp.t -= dt; if (me.sp.t <= 0 && me.sp.k !== 'tower') { if (me.sp.k === 'shade') setGhost(false); me.sp = null; } }
  if (!me.entered) return;
  if (me.dead) { me.deadT += dt; me.anim = 'dead'; me.at += dt; return; }
  if (input.form) { transform(input.form); }
  const F = FORMS[me.form];
  // movement input
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1; if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1; if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (joy.id !== null) { ix += joy.x; iz -= joy.y; }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
  me.blocking = (keys.KeyQ || keys.ShiftLeft || keys.ShiftRight || keys.ControlLeft || touchBlock) && !busy() && me.y <= 0;
  if (me.blocking && me.anim !== 'block') { me.blockT0 = now(); startAnim('block'); }
  if (!me.blocking && me.anim === 'block') me.anim = 'idle';
  // roll
  me.rollCd = Math.max(0, me.rollCd - dt);
  if (input.roll && me.rollCd <= 0 && me.y <= 0 && me.anim !== 'fin' && me.anim !== 'roll') {
    const l = Math.hypot(mx, mz); const dx = l > 0.1 ? mx / l : Math.sin(me.ry), dz = l > 0.1 ? mz / l : Math.cos(me.ry);
    me.roll = { dx, dz }; me.ry = Math.atan2(dx, dz); startAnim('roll'); me.rollCd = 0.55; sfx.dash();
  }
  // finisher
  const b = boss();
  me.canFin = b && b.sg && me.fin !== b.sgi && bossDist() < BOSS_RADIUS + 6 && !me.dead;
  if (input.fin && me.canFin) { faceBossIfNear(); startAnim('fin'); me.inv = 1.3; me.fin = b.sgi; me.finFrom = { x: me.x, z: me.z }; sfx.roar(); }
  // special
  if (input.special && !busy() && (me.scd[me.form] || 0) <= 0) doSpecial();
  else if (input.special && (me.scd[me.form] || 0) > 0) toast(`${F.special} ready in ${Math.ceil(me.scd[me.form])}s`, 0.8);
  // attacks
  if (input.light) me.queued = 'light'; if (input.heavy) me.queued = 'heavy';
  if (me.queued && (!busy() || (me.anim.startsWith('l') && me.at > ANIM_DUR[me.anim] * 0.6 && me.queued === 'light')) && me.anim !== 'roll' && me.anim !== 'fin') {
    const q = me.queued; me.queued = null;
    if (me.sp && me.sp.k === 'shade' && q === 'light' && b) { shadeStrike(); }
    else if (q === 'light') lightAttack(); else heavyAttack();
  }
  if (me.queued && me.qt === undefined) me.qt = 0; if (me.queued) { me.qt += dt; if (me.qt > 0.4) { me.queued = null; me.qt = undefined; } } else me.qt = undefined;
  me.comboWin -= dt; if (me.comboWin <= 0) me.combo = 0;
  // anim progression + hit frames
  me.at += gdt;
  animHits();
  if (ANIM_DUR[me.anim] && me.at >= ANIM_DUR[me.anim] && me.anim !== 'block') { if (me.anim === 'jump' && me.y > 0) {} else me.anim = 'idle'; }
  // velocity
  let sp = F.speed * (unstop() ? 1.1 : 1);
  if (me.blocking) sp *= 0.4;
  if (busy() && me.anim !== 'shoot' && me.anim !== 'jump') sp *= me.anim === 'cast' ? 0.5 : 0.15;
  if (me.sp && me.sp.k === 'tower') sp = 9;
  let vx = mx * sp, vz = mz * sp;
  if (me.anim === 'roll' && me.at < 0.45) { const k = 13 * (1 - me.at / 0.5); vx = me.roll.dx * k; vz = me.roll.dz * k; if (me.at > 0.04 && me.at < 0.38) me.inv = Math.max(me.inv, 0.02); }
  if (me.anim === 'lunge' && me.at < 0.3) { vx = Math.sin(me.ry) * 22; vz = Math.cos(me.ry) * 22; }
  if (me.anim === 'fin' && me.finFrom) { const k = Math.min(1, me.at / 0.6), tx = bossDisp.x - Math.sin(me.ry) * (BOSS_RADIUS + 0.8), tz = bossDisp.z - Math.cos(me.ry) * (BOSS_RADIUS + 0.8); me.x = lerp(me.finFrom.x, tx, k); me.z = lerp(me.finFrom.z, tz, k); me.y = Math.sin(k * Math.PI) * 4; vx = vz = 0; }
  me.x += vx * dt; me.z += vz * dt;
  me.speed = Math.hypot(vx, vz);
  if (il > 0.1 && !busy() && !me.blocking) me.ry = angLerp(me.ry, Math.atan2(mx, mz), Math.min(1, dt * 14));
  else if (me.blocking) faceBossIfNear(20);
  // vertical (jumps)
  if (me.y > 0 || me.vy > 0) { me.vy -= 22 * dt; me.y += me.vy * dt; if (me.y <= 0) { me.y = 0; me.vy = 0; land(); } }
  else if (me.anim !== 'fin') me.y = 0;
  // arena bounds & boss body collision
  const d = Math.hypot(me.x, me.z), lim = R - 0.8; if (d > lim) { me.x *= lim / d; me.z *= lim / d; }
  if (b && b.st !== 'win' && me.anim !== 'fin' && me.y < 3) { const dx = me.x - bossDisp.x, dz = me.z - bossDisp.z, dd = Math.hypot(dx, dz), mn = BOSS_RADIUS * 0.75; if (dd < mn && dd > 0.01) { me.x = bossDisp.x + dx / dd * mn; me.z = bossDisp.z + dz / dd * mn; } }
  if (W.mode === 'hub') for (let i = 0; i < 3; i++) { const p = shrinePos(i), dx = me.x - p.x, dz = me.z - p.z, dd = Math.hypot(dx, dz); if (dd < 0.9 && dd > 0.001) { me.x = p.x + dx / dd * 0.9; me.z = p.z + dz / dd * 0.9; } }
  // wards heal
  for (const w of activeWards()) if (Math.hypot(me.x - w.x, me.z - w.z) < 6 && me.hp < me.max) me.hp = Math.min(me.max, me.hp + 9 * dt);
  input.light = input.heavy = input.special = input.roll = input.fin = false; input.form = null;
}
function lightAttack() {
  const k = me.form; faceBossIfNear();
  if (k === 'soldier') { startAnim('shoot'); fireShot('soldier', 7, 1, 48); sfx.shoot(); return; }
  if (k === 'mage') { startAnim('cast'); fireShot('mage', 12, 2, 24); sfx.bolt(); return; }
  me.combo = me.comboWin > 0 ? me.combo % (k === 'warrior' ? 3 : 2) + 1 : 1; me.comboWin = 0.75;
  startAnim('l' + me.combo); sfx.swing();
  if (k === 'mimic') me.at = 0.08; // faster swipes
  if (k === 'brute') me.at = -0.12; // slower, heavier
}
function heavyAttack() {
  const k = me.form; faceBossIfNear(); me.combo = 0;
  if (k === 'warrior') startAnim('heavy');
  else if (k === 'soldier') { startAnim('blast'); sfx.slam(); }
  else if (k === 'brick') { startAnim('jump'); me.vy = 9; sfx.dash(); }
  else if (k === 'mimic') { startAnim('lunge'); sfx.dash(); }
  else if (k === 'mage') { startAnim('cast2'); sfx.tele(); }
  else startAnim('pound');
}
function animHits() {
  if (me.hitDone) return;
  const a = me.anim, t = me.at, k = me.form, hx = me.x + Math.sin(me.ry) * 2, hz = me.z + Math.cos(me.ry) * 2;
  const hitAt = { l1: 0.13, l2: 0.13, l3: 0.24, heavy: 0.45, blast: 0.08, cast2: 0.55, lunge: 0.15, pound: 0.55, fin: 0.75 }[a];
  if (hitAt === undefined || t < hitAt) return;
  me.hitDone = true;
  const base = { warrior: [14, 26, 38], brick: [12, 12, 0], mimic: [10, 10, 24], brute: [20, 20, 42] }[k] || [10, 10, 0];
  let tg;
  if (a === 'l1' || a === 'l2' || a === 'l3') { const dmg = a === 'l3' ? base[1] : base[0]; if ((tg = inMelee(k === 'brute' ? 3.2 : 2.8))) dealDamage(dmg, a === 'l3' ? 8 : k === 'brute' ? 7 : 4, hx, 2.5, hz, false, tg); }
  else if (a === 'heavy') { addShake(0.25); if ((tg = inMelee(3.4))) dealDamage(38, 20, hx, 2.5, hz, false, tg); burst(hx, 0.3, hz, 14, 0xffd0a0, 5, 3); }
  else if (a === 'blast') { burst(hx, 1.3, hz, 16, 0xffe080, 10, 2); addShake(0.2); if ((tg = inMelee(6, 0.6))) dealDamage(34, 10, hx, 2, hz, false, tg); }
  else if (a === 'cast2') { const nt = nearestTarget(me.x, me.z, 32); if (nt) { novas.push({ x: nt.x, z: nt.z, t: 0, mine: true }); netFx({ t: 'nova', x: +nt.x.toFixed(1), z: +nt.z.toFixed(1) }); } }
  else if (a === 'lunge') { if ((tg = inMelee(3, 1.0))) dealDamage(24, 8, hx, 2.5, hz, false, tg); }
  else if (a === 'pound') { sfx.slam(); addShake(0.5); burst(me.x, 0.3, me.z, 30, 0xc8a070, 9, 4); aoe(me.x, me.z, 5, 42, 26, 2); }
  else if (a === 'fin') { const b = boss(); if (b) { dealDamage(Math.round(b.mx * 0.12), 0, bossDisp.x, 5, bossDisp.z, true); } hitStop = 0.2; addShake(1.2); lightning(bossDisp.x, bossDisp.z); toast('BRUTAL FINISHER!', 1.4); }
}
function land() {
  if (me.form === 'brick' && (me.anim === 'jump' || (me.sp && me.sp.k === 'tower'))) {
    const big = me.sp && me.sp.k === 'tower';
    const r = big ? 7 : 4; sfx.slam(); addShake(big ? 1 : 0.4); burst(me.x, 0.3, me.z, big ? 60 : 24, 0xf5cd30, big ? 14 : 8, 5);
    aoe(me.x, me.z, r, big ? 70 : 32, big ? 35 : 18, 3, big);
    netFx({ t: 'slam', x: +me.x.toFixed(1), z: +me.z.toFixed(1), r });
    if (big) { me.sp = null; me.inv = 0.4; }
    me.anim = 'idle';
  }
}
function doSpecial() {
  const k = me.form, F = FORMS[k]; me.scd[k] = F.scd; startAnim('special');
  if (k === 'warrior') { me.sp = { k: 'fury', t: 8 }; me.hp = Math.min(me.max, me.hp + 25); toast('🔥 FURY UNLEASHED', 1.4); sfx.roar(); addShake(0.4); }
  else if (k === 'soldier') { me.wall = { x: me.x + Math.sin(me.ry) * 2.5, z: me.z + Math.cos(me.ry) * 2.5, ry: me.ry, until: now() + 10, key: myId + Math.random().toString(36).slice(2, 5) }; sfx.slam(); toast('🧱 Wall built', 1); burst(me.wall.x, 1, me.wall.z, 20, 0xc8a070, 5, 4); }
  else if (k === 'brick') { me.sp = { k: 'tower', t: 3 }; me.vy = 15; me.inv = 2.5; startAnim('jump'); sfx.dash(); toast('🧱 TOWER JUMP', 1); }
  else if (k === 'mimic') { me.sp = { k: 'shade', t: 6 }; setGhost(true); sfx.roar(); toast('👁 Vanished — strike to teleport', 1.6); }
  else if (k === 'mage') { me.ward = { x: me.x, z: me.z, until: now() + 6, key: myId + Math.random().toString(36).slice(2, 5) }; sfx.heal(); toast('🔮 Healing ward', 1); }
  else { me.sp = { k: 'unstop', t: 7 }; sfx.roar(); toast('👊 UNSTOPPABLE', 1.2); addShake(0.5); }
}
function setGhost(on) { hero.setGhost(on); }
function shadeStrike() {
  const b = boss(); const back = bossDisp.ry + Math.PI;
  me.x = bossDisp.x + Math.sin(back) * (BOSS_RADIUS + 1); me.z = bossDisp.z + Math.cos(back) * (BOSS_RADIUS + 1);
  me.ry = Math.atan2(bossDisp.x - me.x, bossDisp.z - me.z); startAnim('l1'); me.hitDone = true;
  burst(me.x, 1.5, me.z, 30, 0x400060, 6, 4); setGhost(false); me.sp = null;
  if (b) dealDamage(65, 15, bossDisp.x, 4, bossDisp.z, true);
}
function takeHit(dmg, unblockable) {
  if (me.dead || me.inv > 0 || !me.entered) return;
  if (me.blocking && !unblockable) {
    if (now() - me.blockT0 < 0.28) { if (bossFighting()) me.stg += 22; dmgNum(me.x, 2.4, me.z, 'PARRY!', 'parry'); hitStop = 0.12; sfx.hit(); burst(me.x, 1.4, me.z, 20, 0x7fe0ff, 7, 4); addShake(0.2); me.inv = 0.3; return; }
    dmg *= 0.2; sfx.hit();
  }
  if (furyOn()) dmg *= 0.5; if (unstop()) dmg *= 0.3;
  if (activeWards().some(w => Math.hypot(me.x - w.x, me.z - w.z) < 6)) dmg *= 0.7;
  if (activeWalls().some(w => Math.hypot(me.x - w.x, me.z - w.z) < 3)) dmg *= 0.6;
  dmg = Math.max(1, Math.round(dmg)); me.hp -= dmg; me.inv = 0.35;
  dmgNum(me.x, 2.2, me.z, '-' + dmg, 'me'); sfx.hurt(); addShake(0.35);
  $('hurtfx').style.opacity = '1'; setTimeout(() => $('hurtfx').style.opacity = '0', 160);
  if (!unstop() && !busy()) startAnim('hurt');
  if (me.hp <= 0) { me.hp = 0; me.dead = true; me.deadT = 0; startAnim('dead'); sfx.lose(); if (me.sp && me.sp.k === 'shade') setGhost(false); me.sp = null; showDead(); }
}
function showDead() { $('deadScreen').classList.remove('hidden'); $('riseBtn').disabled = true; }
$('riseBtn').onclick = () => { if (me.dead && me.deadT >= 4) { respawnMe(); sfx.heal(); } };

// ---------------- hazards vs me ----------------
const hitKeys = new Set();
function resolveAttack(a, e0, e1, tag) {
  if (!a || !ATK[a.t]) return;
  const A = ATK[a.t], out = [];
  A.hits(a, e0, e1, me.x, me.z, out);
  const walls = a.t === 'volley' ? activeWalls() : null;
  for (const [sub, dmg, u] of out) {
    const key = tag + ':' + a.id + ':' + sub; if (hitKeys.has(key)) continue;
    if (walls && walls.length && boltBlocked(a.ox, a.oz, me.x, me.z, walls)) continue;
    if (me.y > 2.5 && a.t !== 'volley') continue; // airborne over shockwaves
    hitKeys.add(key); if (hitKeys.size > 400) hitKeys.clear();
    takeHit(dmg * lvlDmg(W.lvl) * (a.dm || 1), u);
  }
  if (A.impacts) A.impacts(a, e0, e1, (x, z, s) => { burst(x, 0.4, z, 22, arena.boss ? arena.boss.accent : 0xffa040, 9 * s, 6); const d = Math.hypot(x - me.x, z - me.z); addShake(Math.max(0, 0.7 - d / 30) * s); sfx.slam(); if (arena.key === 'storm') lightning(x, z); });
}

// ---------------- world progression (leader + replicas) ----------------
function candidates() {
  const c = [];
  if (me.entered) c.push({ id: myId, jt: me.jt });
  for (const p of activePeers()) c.push({ id: p.id, jt: p.d.jt || 0 });
  return c.sort((a, b) => a.jt - b.jt || (a.id < b.id ? -1 : 1));
}
function playersForSim() {
  const ps = [];
  if (me.entered) ps.push({ id: myId, x: me.x, z: me.z, dead: me.dead, hid: !!(me.sp && me.sp.k === 'shade'), fin: me.fin, dmg: me.dmg, stg: me.stg, fid: me.fid, kl: [...myKills].slice(-30), qd: me.qd });
  for (const p of activePeers()) ps.push({ id: p.id, x: p.d.x, z: p.d.z, dead: !!p.d.dead, hid: !!p.d.hid, fin: p.d.fin, dmg: p.d.dmg || 0, stg: p.d.stg || 0, fid: p.d.fid, kl: p.d.kl || [], qd: p.d.qd || {} });
  return ps;
}
function advanceTimers(dt) { // replica-side timing between leader snapshots
  W.se += dt; if (W.ea) W.ea.e += dt; if (W.portal != null) W.portal += dt;
  const b = W.b; if (W.mode === 'boss' && b) { b.se += dt; if (b.a) b.a.e += dt; if (b.sg) b.sg.t += dt; }
  advanceQuests(W, dt);
}
let isLeader = false;
const shadeHitT = new Map();
function worldStep(dt) {
  const c = candidates();
  isLeader = SOLO ? me.entered : (c.length ? c[0].id === myId : false);
  leaderId = c.length ? c[0].id : null; leaderJt = c.length ? c[0].jt : Infinity;
  const qa0 = new Map(); for (const q of W.q || []) if (q.t === 'minib' && q.a) qa0.set(q.id, [q.a.id, q.a.e]);
  const ea0 = W.ea ? W.ea.e : 0, a0 = W.b && W.b.a ? W.b.a.e : 0, aid = W.b && W.b.a ? W.b.a.id : -1, eid = W.ea ? W.ea.id : -1;
  if (isLeader || (!c.length && !me.entered) || (now() - lastWorldMsg > 4 && !isLeader && !c.length)) {
    const ps = playersForSim();
    if (W.mode === 'boss' && W.b) for (const p of ps) if (p.fid === W.b.fid) { W.b.dmg[p.id] = Math.max(W.b.dmg[p.id] || 0, p.dmg); W.b.stg[p.id] = Math.max(W.b.stg[p.id] || 0, p.stg); }
    stepWorld(W, dt, ps, []);
  } else advanceTimers(dt);
  // resolve hazards on me (same attack only, else start from its current time)
  if (W.ea) resolveAttack(W.ea, W.ea.id === eid ? ea0 : Math.max(0, W.ea.e - dt), W.ea.e, 'e' + W.fid);
  if (W.b && W.b.a && W.mode === 'boss') resolveAttack(W.b.a, W.b.a.id === aid ? a0 : Math.max(0, W.b.a.e - dt), W.b.a.e, 'b' + W.b.fid);
  if (W.mode !== 'boss') for (const q of W.q || []) {
    if (q.done) continue;
    if (q.t === 'minib' && q.a) { const o = qa0.get(q.id); resolveAttack(q.a, o && o[0] === q.a.id ? o[1] : Math.max(0, q.a.e - dt), q.a.e, 'q' + q.id); }
    if (q.t === 'defend' && me.entered && !me.dead) for (const m of q.m) { if (myKills.has(m.id)) continue; const p = qview.shadePos(q.id, m.id) || m; if (Math.hypot(p.x - me.x, p.z - me.z) < 1.1 && now() - (m._hitT || shadeHitT.get(m.id) || 0) > 1) { shadeHitT.set(m.id, now()); takeHit(8 * lvlDmg(W.lvl), false); } }
  }
  detectChanges();
}
function detectChanges() {
  const b = W.b;
  if (W.mode !== prev.mode || W.lvl !== prev.lvl) {
    if (W.mode === 'hub') { if (prev.mode) { respawnMe({ x: Math.cos(hueOf(myId) * 6.28) * 5, z: Math.sin(hueOf(myId) * 6.28) * 5 }); toast(`LEVEL ${W.lvl} — Return to Cloudhold`, 3); } }
    else if (W.mode === 'relics') { if (prev.mode === 'hub') { respawnMe(); sfx.roar(); } toast(`${ARENAS[(W.lvl - 1) % ARENAS.length].name}: complete the quests to wake the giant!`, 3); }
    else if (W.mode === 'boss') { sfx.roar(); addShake(1); toast(`${ARENAS[(W.lvl - 1) % ARENAS.length].boss.name.toUpperCase()} AWAKENS`, 3); if (me.dead) respawnMe(); }
    $('endScreen').classList.add('hidden');
    prev.mode = W.mode; prev.lvl = W.lvl; prev.orbs = W.orbs; prev.rel = W.rel; prev.st = ''; prev.portal = false;
    prev.qd = new Set((W.q || []).filter(q => q.done).map(q => q.id)); prev.qerr = 0; prev.qk = {};
    if (W.mode === 'hub') { myKills.clear(); shadeDmg.clear(); me.qd = {}; }
  }
  for (const q of W.mode === 'boss' ? [] : W.q || []) {
    if (q.done && !prev.qd.has(q.id)) { prev.qd.add(q.id); const L = questLabel(q, W, questCnt); sfx.win(); toast(`✅ ${L.ic} ${QUEST_DONE[q.t] || 'Quest complete'}`, 2); }
    if (q.t === 'runes') { if (q.err > 0 && !prev.qerr) { sfx.lose(); toast('❌ Wrong rune — the sequence resets', 1.4); } prev.qerr = q.err > 0 ? 1 : 0; if (q.k > (prev.qk[q.id] || 0)) sfx.heal(); prev.qk[q.id] = q.k; }
    if (q.t === 'hunt') { const g = q.got; if (prev.qk[q.id] !== undefined && g > prev.qk[q.id]) sfx.heal(); if (prev.qk[q.id] && !g && q.tm > 44) toast('⏱ Too slow — the wisps scattered. Again!', 2); prev.qk[q.id] = g; }
  }
  if (W.mode === 'hub') {
    const sh = W.sh.filter(v => v >= 1).length; if (sh > prev.sh) { sfx.win(); toast(`Shrine awakened (${sh}/3)`, 1.6); } prev.sh = sh;
    if (W.orbs !== prev.orbs && hasQ(W, 'orbs')) { sfx.heal(); toast(`Sky-orb found (${orbsGot(W)}/${orbCount(W.lvl)})`, 1.4); prev.orbs = W.orbs; }
    if (W.portal != null && !prev.portal) { prev.portal = true; toast('The portal opens… prepare!', PORTAL_TIME); sfx.roar(); }
  } else prev.sh = 0;
  if (W.mode === 'relics' && W.rel !== prev.rel && hasQ(W, 'relics')) { sfx.heal(); toast(`Relic claimed (${relicsGot(W)}/${relicCount(W.lvl)})`, 1.4); prev.rel = W.rel; }
  if (W.mode === 'boss' && b) {
    if (b.fid !== me.fid) { me.fid = b.fid; me.dmg = 0; me.stg = 0; me.fin = -1; if (me.dead) respawnMe(); }
    if (b.st !== prev.st) {
      if (b.st === 'win') { sfx.win(); showEnd(true); }
      else if (b.st === 'wipe') { sfx.lose(); showEnd(false); }
      else if (b.st === 'intro' && prev.st === 'wipe') { $('endScreen').classList.add('hidden'); respawnMe(); }
      else $('endScreen').classList.add('hidden');
      prev.st = b.st;
    }
    if (b.sgi !== prev.sgi) { if (b.sg) { toast('STAGGERED! Get close for a FINISHER', 2); sfx.slam(); } prev.sgi = b.sgi; }
    const ph = b.ph; if (ph !== prev.ph) { if (ph > 1) { toast(`PHASE ${ph} — the giant grows furious`, 2); sfx.roar(); addShake(0.8); } prev.ph = ph; }
  }
}
const QUEST_DONE = { shrines: 'Shrines awakened', orbs: 'Sky-orbs gathered', relics: 'Relics claimed', runes: 'Rune lock solved', escort: 'The Lantern Spirit is safe', defend: 'Ward circle held', hunt: 'Wisp hunt complete', minib: 'Elite slain' };
const questCnt = t => t === 'orbs' ? [orbsGot(W), orbCount(W.lvl)] : [relicsGot(W), relicCount(W.lvl)];
function nameOf(id) { if (id === myId) return myName || 'You'; const p = peers.get(id); return p ? (p.d.nm || 'Warrior') : 'Fallen ally'; }
function showEnd(win) {
  const b = W.b, A = ARENAS[(W.lvl - 1) % ARENAS.length];
  $('endTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
  $('endSub').textContent = win ? `${A.boss.name} has fallen. Level ${W.lvl} cleared!` : 'The giant prevails… regroup and strike again.';
  const rows = Object.entries(b.dmg).sort((x, y) => y[1] - x[1]).slice(0, 8);
  $('board').innerHTML = win && rows.length ? rows.map(([id, d]) => `<div><span>${esc(nameOf(id))}</span><span>${d} dmg</span></div>`).join('') : '';
  $('againBtn').textContent = win ? 'CONTINUE' : 'OK';
  $('endScreen').classList.remove('hidden');
}
$('againBtn').onclick = () => $('endScreen').classList.add('hidden');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- networking ----------------
let lastSend = 0, lastWSend = 0;
function netFx(m) { if (net && me.entered) { m.k = 'fx'; net.send(m, 'fx' + m.t); } }
function sendState() {
  if (!net) return;
  const t = now();
  if (me.entered && t - lastSend > 0.07) {
    lastSend = t;
    const st = { k: 'p', en: 1, nm: myName || 'Warrior', fm: me.form, x: +me.x.toFixed(2), z: +me.z.toFixed(2), y: +me.y.toFixed(2), ry: +me.ry.toFixed(2), hp: Math.round(me.hp), an: me.anim, at: +me.at.toFixed(2), dead: me.dead ? 1 : 0, hid: me.sp && me.sp.k === 'shade' ? 1 : 0, fu: furyOn() || unstop() ? 1 : 0, fid: me.fid, dmg: me.dmg, stg: Math.round(me.stg), fin: me.fin, jt: me.jt, sp: +me.speed.toFixed(1) };
    if (W.mode !== 'boss') { if (myKills.size) st.kl = [...myKills].slice(-30); if (Object.keys(me.qd).length) st.qd = me.qd; }
    if (me.wall && me.wall.until > t) st.wl = [+me.wall.x.toFixed(2), +me.wall.z.toFixed(2), +me.wall.ry.toFixed(2), +(me.wall.until - t).toFixed(1), me.wall.key];
    if (me.ward && me.ward.until > t) st.wd = [+me.ward.x.toFixed(2), +me.ward.z.toFixed(2), +(me.ward.until - t).toFixed(1), me.ward.key];
    net.send(st, 'p');
  }
  if (isLeader && t - lastWSend > 0.1) { lastWSend = t; net.send({ k: 'w', ljt: me.jt, w: W }, 'w'); }
}
function onNet(m) {
  const t = now();
  if (m.k === 'p') {
    let p = peers.get(m.f);
    if (!p) { p = { id: m.f, d: m, seen: t }; peers.set(m.f, p); if (m.en && me.entered) toast(`${m.nm || 'A warrior'} joined`, 1.5); }
    p.d = m; p.seen = t;
    if (m.wl) p.wall = { x: m.wl[0], z: m.wl[1], ry: m.wl[2], until: t + m.wl[3], key: m.wl[4] }; else p.wall = null;
    if (m.wd) p.ward = { x: m.wd[0], z: m.wd[1], until: t + m.wd[2], key: m.wd[3] }; else p.ward = null;
    if ((m.jt || 0) >= me.maxSeenJt) me.maxSeenJt = m.jt;
  } else if (m.k === 'w') {
    const p = peers.get(m.f);
    if (m.f === leaderId || m.ljt < leaderJt || !me.entered && !leaderId) {
      if (m.f === myId) return;
      W = m.w; lastWorldMsg = t; if (p) p.seen = t;
    }
  } else if (m.k === 'fx') {
    if (m.t === 'shot') { const s = { x: m.x, y: 1.4, z: m.z, vx: m.vx, vz: m.vz, t: 0, mine: false, kind: m.kd }; s.mesh = new THREE.Mesh(shotGeo, shotMats[m.kd] || shotMats.soldier); scene.add(s.mesh); shots.push(s); }
    else if (m.t === 'nova') novas.push({ x: m.x, z: m.z, t: 0, mine: false });
    else if (m.t === 'slam') burst(m.x, 0.3, m.z, 24, 0xf5cd30, 8, 5);
  } else if (m.k === 'bye') removePeer(m.f);
}
me.maxSeenJt = 0;
if (net) { net.on(onNet); net.start(); addEventListener('pagehide', () => { try { net.send({ k: 'bye' }); net.flushNostr(); } catch (_) {} }); }
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = now();
  else if (me.entered && now() - hiddenAt > 2) { me.jt = Math.max(Date.now(), me.maxSeenJt + 1); } // give up leadership after being away
});

// ---------------- world objects (shrines, orbs, portal, relics) ----------------
let objs = { shrines: [], orbs: [], relics: [], portal: null };
function buildObjects() {
  const key = sceneKey + ':' + W.lvl + ':' + W.seed + ':' + W.mode;
  if (key === objKey) return; objKey = key;
  if (objGroup) { scene.remove(objGroup); disposeTree(objGroup); }
  objGroup = new THREE.Group(); scene.add(objGroup); objs = { shrines: [], orbs: [], relics: [], portal: null };
  if (W.mode === 'hub') {
    for (let i = 0; i < 3; i++) {
      const p = shrinePos(i), g = new THREE.Group(); g.position.set(p.x, 0, p.z);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(SHRINE_R, SHRINE_R + 0.2, 0.3, 24), new THREE.MeshLambertMaterial({ color: 0x8a7a9a })));
      const ring = new THREE.Mesh(ringGeo, mkMat()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; ring.scale.setScalar(SHRINE_R); g.add(ring);
      const fill = new THREE.Mesh(discGeo, mkMat()); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.19; g.add(fill);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 6), new THREE.MeshLambertMaterial({ color: 0xd8ccb8 })); pillar.position.y = 1.5; g.add(pillar);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0x8866aa })); crystal.position.y = 3.8; g.add(crystal);
      objGroup.add(g); objs.shrines.push({ g, ring, fill, crystal });
    }
    for (let i = 0; i < orbCount(W.lvl); i++) {
      const o = orbPos(W.seed, i), m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: 0x9ae8ff }));
      m.position.set(o.x, o.y, o.z); const halo = new THREE.Mesh(ringGeo, mkMat()); halo.material.color.setHex(0x9ae8ff); halo.scale.setScalar(0.9); m.add(halo);
      objGroup.add(m); objs.orbs.push(m);
    }
    const portal = new THREE.Group();
    const tor = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff9a50 })); portal.add(tor);
    const inner = new THREE.Mesh(discGeo, mkMat()); inner.material.color.setHex(0xff5a20); inner.scale.setScalar(2.3); portal.add(inner);
    portal.position.set(0, 2.8, 0); portal.visible = false; objGroup.add(portal); objs.portal = portal;
  } else if (W.mode === 'relics') {
    const acc = arena.boss ? arena.boss.accent : 0xffd070;
    for (let i = 0; i < relicCount(W.lvl); i++) {
      const o = relicPos(W.seed, i), g = new THREE.Group(); g.position.set(o.x, 0, o.z);
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a2a30, emissive: new THREE.Color(acc).multiplyScalar(0.35) })); stone.position.y = 1.3; g.add(stone);
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.32), new THREE.MeshBasicMaterial({ color: acc })); rune.position.y = 1.3; g.add(rune);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 6, 1, true), mkMat()); beam.material.color.setHex(acc); beam.material.opacity = 0.25; beam.position.y = 6; g.add(beam);
      objGroup.add(g); objs.relics.push(g);
    }
  }
}
function updateObjects(t) {
  buildObjects();
  if (W.mode === 'hub') {
    objs.shrines.forEach((s, i) => { const v = W.sh[i], done = v >= 1; s.fill.scale.setScalar(Math.max(0.01, SHRINE_R * v)); s.fill.material.color.setHex(done ? 0xffd070 : 0xb080ff); s.ring.material.color.setHex(done ? 0xffd070 : 0xb080ff); s.crystal.material.color.setHex(done ? 0xffe08a : 0x8866aa); s.crystal.rotation.y = t * (done ? 3 : 0.8); s.crystal.position.y = 3.8 + Math.sin(t * 2 + i) * 0.2; });
    objs.orbs.forEach((m, i) => { m.visible = !(W.orbs & (1 << i)); m.rotation.y = t * 2; m.position.y = orbPos(W.seed, i).y + Math.sin(t * 2.5 + i) * 0.25; m.children[0].lookAt(camera.position); });
    if (objs.portal) { objs.portal.visible = W.portal != null || hubDone(W); objs.portal.rotation.y = t * 0.8; objs.portal.children[0].rotation.z = t * 2; objs.portal.scale.setScalar(0.6 + 0.4 * Math.min(1, (W.portal || 0) / 1)); }
  } else if (W.mode === 'relics') {
    objs.relics.forEach((g, i) => { g.visible = !(W.rel & (1 << i)); g.children[0].position.y = g.children[1].position.y = 1.3 + Math.sin(t * 2 + i) * 0.2; g.rotation.y = t; });
  }
}

// ---------------- boss & peers display ----------------
function updateBossView(dt, gdt, t) {
  if (!bossModel) return;
  const m = bossModel, b = W.b;
  if (W.mode === 'relics' || !b) { // dormant giant looms outside the ring
    m.root.visible = W.mode === 'relics';
    m.root.position.set(0, -2, -(R + 9)); m.root.rotation.y = 0;
    m.update(gdt, t, { mode: W.ea ? 'meteors' : '', e: W.ea ? W.ea.e : 0, T: W.ea ? atkTele(W.ea) : 1, walking: false, phase: 1, st: '' }); m.setFlash(0);
    bossDisp.x = 0; bossDisp.z = -(R + 9);
    return;
  }
  m.root.visible = true;
  let mode = '', k = 0, after = -1, y = 0, px = b.x, pz = b.z, walking = false;
  if (b.st === 'intro') { const q = Math.min(1, b.se / 3); px = 0; pz = lerp(-(R + 9), b.z, q); y = Math.sin(q * Math.PI) * 10 - 2 * (1 - q); bossDisp.x = px; bossDisp.z = pz; }
  else if (b.a) {
    const A = ATK[b.a.t], tl = atkTele(b.a); mode = b.a.t; k = b.a.e / tl; after = b.a.e - tl;
    if (A.pos) { const p = A.pos(b.a, b.a.e); px = p.x; pz = p.z; y = p.y || 0; bossDisp.x = px; bossDisp.z = pz; }
    else { bossDisp.x = lerp(bossDisp.x, px, Math.min(1, dt * 8)); bossDisp.z = lerp(bossDisp.z, pz, Math.min(1, dt * 8)); }
    if (A.pos && b.a.e < tl * 0.05) { /* snap */ }
    bossDisp.ry = angLerp(bossDisp.ry, Math.atan2(b.a.tx - b.a.ox, b.a.tz - b.a.oz) || bossDisp.ry, Math.min(1, dt * 6));
    if (!m._tele || m._tele !== b.a.id) { m._tele = b.a.id; sfx.tele(); }
  } else {
    const ox = bossDisp.x, oz = bossDisp.z;
    bossDisp.x = lerp(bossDisp.x, px, Math.min(1, dt * 6)); bossDisp.z = lerp(bossDisp.z, pz, Math.min(1, dt * 6));
    walking = Math.hypot(bossDisp.x - ox, bossDisp.z - oz) > dt * 0.8;
    bossDisp.ry = angLerp(bossDisp.ry, b.ry, Math.min(1, dt * 5));
  }
  bossDisp.y = lerp(bossDisp.y, y, 0.5);
  m.root.position.set(bossDisp.x, bossDisp.y, bossDisp.z); m.root.rotation.y = bossDisp.ry;
  const st = b.st === 'win' ? 'dead' : b.sg ? 'stagger' : '';
  if (b.st === 'win') m.root.position.y = -Math.min(6, b.se * 0.8);
  m.update(gdt, t, { mode: b.st === 'intro' ? 'roar' : mode, e: b.st === 'intro' ? b.se : b.a ? b.a.e : 0, T: b.st === 'intro' ? 2.4 : b.a ? atkTele(b.a) : 1, walking, fast: b.ph >= 3, phase: b.ph || 1, st });
  bossDisp.flash = Math.max(0, bossDisp.flash - dt);
  m.setFlash(bossDisp.flash > 0 ? 1 : b.sg ? 0.3 : 0);
}
const _bolt = new THREE.Object3D();
function updateBossFx() {
  const list = [], b = W.b;
  if (W.mode === 'boss' && b && b.a) ATK[b.a.t].hazards(b.a, b.a.e, list);
  if (W.ea) ATK[W.ea.t].hazards(W.ea, W.ea.e, list);
  drawHazards(list);
  // bolts
  let n = 0; const walls = activeWalls();
  if (W.mode === 'boss' && b && b.a && ATK[b.a.t].bolts) {
    ATK[b.a.t].bolts(b.a, b.a.e, (key, x, z) => { if (n >= BOLT_MAX) return; if (walls.length && boltBlocked(b.a.ox, b.a.oz, x, z, walls)) return; _bolt.position.set(x, 1.3, z); _bolt.rotation.set(n, n * 2, 0); _bolt.updateMatrix(); boltMesh.setMatrixAt(n++, _bolt.matrix); });
  }
  boltMesh.count = n; boltMesh.instanceMatrix.needsUpdate = true;
  if (arena && arena.boss) boltMesh.material.color.setHex(arena.boss.accent);
  // meteors
  let mi = 0;
  for (const h of list) if (h.meteor !== undefined && h.meteor > 0 && h.meteor < 1) { const mm = meteorMesh(mi++); mm.visible = true; mm.position.set(h.x + (1 - h.meteor) * 6, (1 - h.meteor) * 26, h.z); mm.rotation.x += 0.1; mm.material.color.setHex(arena.boss ? arena.boss.accent : 0xff6020); }
  for (; mi < meteorMeshes.length; mi++) meteorMeshes[mi].visible = false;
}
function updatePeers(dt, t) {
  for (const [id, p] of peers) {
    if (now() - p.seen > 9) { removePeer(id); continue; }
    if (!p.d.en) continue;
    peerModel(p);
    if ((p.d.fm || 'warrior') !== p.form) { scene.remove(p.model.root); p.model.dispose(); disposeTree(p.model.root); p.model = null; p.ghost = false; loadModel(FORM_ACT[p.d.fm || 'warrior'].model); peerModel(p); }
    const k = Math.min(1, dt * 12);
    p.lx = lerp(p.lx, p.d.x, k); p.lz = lerp(p.lz, p.d.z, k); p.lry = angLerp(p.lry, p.d.ry, k);
    p.model.root.position.set(p.lx, p.d.y || 0, p.lz); p.model.root.rotation.y = p.lry;
    p.model.root.visible = now() - p.seen < 3.5;
    if (p.an !== p.d.an || p.lastAt > p.d.at) { p.an = p.d.an; p.at = p.d.at; } p.lastAt = p.d.at; p.at += dt;
    p.model.update(dt, p.d.dead ? 'dead' : p.d.an, p.at, p.d.sp || 0, t + id.length, !!p.d.fu);
    const ghost = !!p.d.hid; if (ghost !== !!p.ghost) { p.ghost = ghost; p.model.setGhost(ghost); }
    drawLabel(p.label, p.d.nm || 'Warrior', p.d.hp, !!p.d.dead);
  }
}

// ---------------- camera ----------------
const camPos = new THREE.Vector3(0, 8, 20), camLook = new THREE.Vector3();
let lastCamInput = 0;
function updateCamera(dt) {
  const b = W.b, fighting = W.mode === 'boss' && b && b.st !== 'win';
  const portrait = innerWidth < innerHeight;
  if (lockOn && fighting && me.entered) camYaw = angLerp(camYaw, Math.atan2(bossDisp.x - me.x, bossDisp.z - me.z), Math.min(1, dt * 5));
  else if (IS_TOUCH && joy.id !== null && camDrag.id === null && me.speed > 1) { camYaw = angLerp(camYaw, me.ry, Math.min(1, dt * 0.8)); }
  const dist = portrait ? 9.5 : 7.5, h = 3.2 + camPitch * 6, sh = portrait ? 0.5 : 1.1;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  const tx = me.x - fx * dist + rx * sh, tz = me.z - fz * dist + rz * sh, ty = me.y * 0.6 + h;
  const k = Math.min(1, dt * 10); camPos.x = lerp(camPos.x, tx, k); camPos.y = lerp(camPos.y, ty, k); camPos.z = lerp(camPos.z, tz, k);
  let lx = me.x + fx * 4 + rx * sh, ly = 1.8 + me.y * 0.5, lz = me.z + fz * 4 + rz * sh;
  if (lockOn && fighting && bossModel) { ly = lerp(ly, bossModel.chestY * 0.6 + bossDisp.y, 0.35); }
  camLook.set(lx, ly, lz);
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt * 3); }
  camera.lookAt(camLook);
}

// ---------------- HUD ----------------
const hudCache = {};
function setW(id, frac) { const v = clamp(frac, 0, 1).toFixed(3); if (hudCache[id] !== v) { hudCache[id] = v; $(id).style.transform = `scaleX(${v})`; } }
function setText(id, txt) { if (hudCache['t' + id] !== txt) { hudCache['t' + id] = txt; $(id).innerHTML = txt; } }
function updateHud() {
  const b = W.b, fighting = W.mode === 'boss' && b;
  document.body.classList.toggle('hubmode', !fighting);
  $('objective').classList.toggle('hidden', !!fighting || !me.entered);
  if (fighting) { const hp = bossHp(b) / b.mx; setW('bossfill', hp); setW('bosslag', hp); setW('stgfill', staggerVal(b)); document.body.classList.toggle('staggered', !!b.sg); setText('bossname', esc(`${ARENAS[b.ar].boss.name} · Lv ${W.lvl}`)); }
  else if (me.entered) setText('objective', questLogHtml());
  if (fighting) { const mk = (b.mods || []).join(','); if (hudCache.mods !== mk) { hudCache.mods = mk; $('bossmods').innerHTML = (b.mods || []).map(k => `<span class="modchip" title="${esc(MODS[k].d)}">${MODS[k].ic} ${esc(MODS[k].n)}</span>`).join(''); } }
  setW('hpfill', me.hp / me.max); setW('hplag', me.hp / me.max);
  const F = FORMS[me.form], cd = me.scd[me.form] || 0, ready = cd <= 0;
  setW('furyfill', me.sp && me.sp.k !== 'tower' ? me.sp.t / ({ fury: 8, shade: 6, unstop: 7 }[me.sp.k] || 1) : 1 - cd / F.scd);
  setText('furytxt', esc(me.sp && me.sp.k !== 'tower' ? F.special.toUpperCase() + '!' : ready ? F.special.toUpperCase() + ' READY' : F.special.toUpperCase() + ' ' + Math.ceil(cd)));
  document.body.classList.toggle('furyready', ready);
  document.body.classList.toggle('fury', furyOn() || unstop());
  $('tSpecial').classList.toggle('ready', ready);
  $('tForm').classList.toggle('dim', me.formCd > 0);
  setText('mename', esc(`${myName || 'Warrior'} · ${F.icon} ${F.name}`));
  const n = 1 + activePeers().length;
  setText('online', `👥 ${n}`);
  $('finprompt').classList.toggle('hidden', !me.canFin);
  if (!$('roster').classList.contains('hidden')) {
    const rows = [`<div class="me"><span>${esc(myName || 'You')} (you)${isLeader ? ' 👑' : ''}</span><span>${FORMS[me.form].icon} ${Math.round(me.hp)}❤</span></div>`];
    for (const p of activePeers()) rows.push(`<div><span>${esc(p.d.nm || 'Warrior')}${p.id === leaderId ? ' 👑' : ''}</span><span>${(FORMS[p.d.fm] || FORMS.warrior).icon} ${p.d.dead ? '💀' : p.d.hp + '❤'}</span></div>`);
    rows.push(`<div style="opacity:.6"><span>Realm</span><span>${net ? (net.online ? (net.p2pUp ? 'P2P+relay' : 'relay') : 'connecting…') : 'solo'}</span></div>`);
    setText('roster', rows.join(''));
  }
  const lk = innerWidth + 'x' + innerHeight + (hudCache['tobjective'] || '') + $('objective').className; if (lk !== layoutKey) { layoutKey = lk; layoutHud(); }
  if (deadShown()) { const left = Math.max(0, 4 - me.deadT); $('riseBtn').disabled = left > 0; setText('deadtxt', left > 0 ? `Rising in ${left.toFixed(1)}s…` : 'Your allies need you.'); }
}
function questLogHtml() {
  const A = ARENAS[(W.lvl - 1) % ARENAS.length], title = W.mode === 'hub' ? `CLOUDHOLD · LEVEL ${W.lvl}` : `${A.name.toUpperCase()} · LEVEL ${W.lvl}`;
  let h = `<b>📜 ${esc(title)}</b>`;
  if (!questOpen) return h + ` <span class="qlhint">${IS_TOUCH ? '(tap)' : '[L]'}</span>`;
  for (const q of W.q || []) { const L = questLabel(q, W, questCnt); h += `<div class="ql${L.done ? ' done' : ''}"><span>${L.done ? '✅' : L.ic} ${esc(L.txt)}</span><i style="width:${Math.round(L.p * 100)}%"></i></div>`; }
  if (W.mode === 'hub') h += W.portal != null ? `<div class="qlfoot">🌀 Portal to ${esc(A.name)} in ${Math.max(0, PORTAL_TIME - W.portal).toFixed(1)}s</div>` : `<div class="qlfoot">Complete every quest to open the portal</div>`;
  else h += `<div class="qlfoot">Finish them to wake ${esc(A.boss.name)} — dodge the falling hazards!</div>`;
  return h;
}
// keep the objective panel from overlapping the HUD row below it
let layoutOff = -1;
function layoutHud() {
  const ob = $('objective'), hidden = ob.classList.contains('hidden');
  const row = $('row2'); row.style.marginTop = '0px';
  const off = hidden ? 0 : Math.max(0, Math.ceil(ob.getBoundingClientRect().bottom + 6 - row.getBoundingClientRect().top));
  if (off !== layoutOff) { layoutOff = off; }
  row.style.marginTop = off + 'px';
  $('minimap').style.transform = $('formbadge').style.transform = `translateY(${off}px)`;
}
let layoutKey = '';
const deadShown = () => !$('deadScreen').classList.contains('hidden');
// minimap (rotates with camera)
const mm = $('minimap'), mctx = mm.getContext('2d');
function updateMinimap() {
  const s = mm.width, c = s / 2, sc = (s / 2 - 8) / R; mctx.clearRect(0, 0, s, s);
  mctx.save(); mctx.translate(c, c); mctx.rotate(camYaw + Math.PI);
  mctx.strokeStyle = 'rgba(255,255,255,.35)'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(0, 0, R * sc, 0, 7); mctx.stroke();
  const dot = (x, z, r, col) => { mctx.fillStyle = col; mctx.beginPath(); mctx.arc(-x * sc, z * sc, r, 0, 7); mctx.fill(); };
  if (W.mode === 'hub') {
    for (let i = 0; i < 3; i++) { const p = shrinePos(i); dot(p.x, p.z, 7, W.sh[i] >= 1 ? '#ffd070' : '#b080ff'); }
    for (let i = 0; i < orbCount(W.lvl); i++) if (!(W.orbs & (1 << i))) { const o = orbPos(W.seed, i); dot(o.x, o.z, 4, '#9ae8ff'); }
    if (W.portal != null) dot(0, 0, 8, '#ff9a50');
  } else if (W.mode === 'relics') { for (let i = 0; i < relicCount(W.lvl); i++) if (!(W.rel & (1 << i))) { const o = relicPos(W.seed, i); dot(o.x, o.z, 5, '#' + (arena.boss ? arena.boss.accent : 0xffd070).toString(16).padStart(6, '0')); } }
  else if (W.b) dot(bossDisp.x, bossDisp.z, 11, '#e0302a');
  if (W.mode !== 'boss') for (const q of W.q || []) {
    if (q.done) continue;
    if (q.t === 'runes') for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.31; dot(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 3, '#ffe08a'); }
    else if (q.t === 'escort') { const d = qview.miniDisp(q.id) || q; dot(d.x ?? 0, d.z ?? 0, 6, '#ffc060'); }
    else if (q.t === 'defend') { mctx.strokeStyle = '#7fd8ff'; mctx.beginPath(); mctx.arc(-q.x * sc, q.z * sc, 4 * sc, 0, 7); mctx.stroke(); for (const m of q.m) if (!myKills.has(m.id)) { const p = qview.shadePos(q.id, m.id) || m; dot(p.x, p.z, 3, '#a050ff'); } }
    else if (q.t === 'hunt') for (let i = 0; i < q.n; i++) if (!(q.got & (1 << i))) { const w = wispPos(q, i); dot(w.x, w.z, 3, '#b0ffe0'); }
    else if (q.t === 'minib' && q.dt < 0) { const d = qview.miniDisp(q.id) || q; dot(d.x, d.z, 7, '#ff5a3a'); }
  }
  for (const p of activePeers()) dot(p.lx ?? p.d.x, p.lz ?? p.d.z, 5, p.d.dead ? '#777' : '#6fd0ff');
  dot(me.x, me.z, 6, '#ffd27a');
  mctx.restore();
}

// ---------------- title / start ----------------
$('nameIn').value = myName;
$('ctrlhelp').innerHTML = IS_TOUCH
  ? '<b>Left thumb</b> move · <b>drag right side</b> look · <b>⚔</b> light · <b>💥</b> heavy · <b>🛡</b> hold to block (tap right before a hit = PARRY) · <b>🌀</b> roll · <b>✨</b> form special · <b>🎭</b> transform. Orange zones can be blocked, <span style="color:#ff5050">red</span> must be dodged.'
  : '<b>WASD</b> move · <b>Mouse</b> look · <b>LMB/J</b> light · <b>RMB/K</b> heavy · <b>Q/Shift</b> block (tap right before a hit = PARRY) · <b>Space</b> roll · <b>E</b> special · <b>1-6</b> or <b>T</b> transform · <b>F</b> finisher · <b>Tab</b> lock-on. Orange zones can be blocked, <span style="color:#ff5050">red</span> must be dodged.';
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
if (isIOS && !standalone) $('installtip').textContent = '📲 For full screen on iPhone: Share → Add to Home Screen.';
function startGame() {
  const n = $('nameIn').value.trim().replace(/\s+/g, ' ').slice(0, 16) || 'Warden';
  myName = n; try { localStorage.setItem('db_name', n); } catch (_) {}
  unlockAudio(); sfx.click(); setDrone(arena.drone);
  me.entered = true; me.jt = Math.max(Date.now(), me.maxSeenJt + 1);
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); $('minimap').classList.remove('hidden'); $('formbadge').classList.remove('hidden');
  if (IS_TOUCH) $('touch').classList.remove('hidden'); else { $('hints').classList.remove('hidden'); setTimeout(() => $('hints').classList.add('hidden'), 25000); }
  if (W.mode === 'hub') respawnMe({ x: Math.cos(hueOf(myId) * 6.28) * 5, z: Math.sin(hueOf(myId) * 6.28) * 5 }); else respawnMe();
  updateFormBadge();
  toast(W.mode === 'hub' ? 'Awaken the shrines & find the sky-orbs!' : 'Join the fight!', 2.5);
  if (IS_TOUCH && !standalone && !isIOS) toggleFsSilently();
}
function toggleFsSilently() { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); }
$('enterBtn').onclick = startGame;
$('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
function updateTitleInfo() {
  if (me.entered) return;
  const n = activePeers().length;
  const where = W.mode === 'hub' ? `Cloudhold (Level ${W.lvl})` : W.mode === 'relics' ? `${ARENAS[(W.lvl - 1) % ARENAS.length].name} — relic hunt` : `fighting ${ARENAS[(W.lvl - 1) % ARENAS.length].boss.name}`;
  $('worldinfo').textContent = SOLO ? 'Solo mode' : !net.online ? 'Connecting to the realm…' : n ? `⚔ ${n} warrior${n > 1 ? 's' : ''} online · ${where}` : `Realm online · you'll be the first warrior here`;
}

// ---------------- main loop ----------------
let lastFps = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, lightningT = 5;
function frame(ms) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (ms - last) / 1000); last = ms; if (dt <= 0) return;
  const t = ms / 1000;
  const gdt = hitStop > 0 ? dt * 0.08 : dt; hitStop = Math.max(0, hitStop - dt);
  setScene(W.mode === 'hub' ? 'hub' : (W.lvl - 1) % ARENAS.length);
  updateMe(dt, gdt);
  worldStep(dt);
  setScene(W.mode === 'hub' ? 'hub' : (W.lvl - 1) % ARENAS.length);
  hero.root.position.set(me.x, me.y, me.z); hero.root.rotation.y = me.ry; hero.root.visible = me.entered;
  if (modelsDirty) rebuildModels(); else if (!bossModel) ensureBossModel();
  hero.shadow.position.y = 0.03 - me.y / hero.root.scale.y;
  hero.update(gdt, me.dead ? 'dead' : me.anim, me.at, me.speed, t, furyOn() || unstop());
  if (unstop()) hero.root.scale.setScalar(hero.baseScale * 1.2); else hero.root.scale.setScalar(hero.baseScale);
  updateObjects(t);
  updateBossView(dt, gdt, t);
  updateBossFx();
  qview.sync(W, gdt, t, arena && arena.boss ? arena.boss.accent : 0xffd070);
  updatePeers(dt, t);
  updateShots(dt);
  syncWallWardMeshes();
  updateAmbient(dt, t); updateSparks(gdt); updateLightning(dt); updateDmgNums(dt);
  if (arena && arena.update) arena.update(t);
  skyDome.material.uniforms.t.value = t; skyDome.position.copy(camera.position);
  if (arena && arena.key === 'storm') { lightningT -= dt; if (lightningT <= 0) { lightningT = 4 + Math.random() * 6; hemi.intensity = 3; lightning((Math.random() - .5) * 80, -40 - Math.random() * 30); setTimeout(() => sfx.thunder(), 300); } hemi.intensity = lerp(hemi.intensity, arena.hemi[2], dt * 4); }
  if (!me.entered) { camYaw += dt * 0.08; me.x = 0; me.z = 0; }
  updateCamera(dt);
  if (me.entered) { updateHud(); updateMinimap(); } else updateTitleInfo();
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  sendState();
  gfx.render(t);
  // auto quality: drop effects / resolution when the frame rate sags
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 3) { const fps = fpsN / fpsAcc; lastFps = fps; if (fps < 40 && me.entered && gfx.downgrade()) updQBtn(); fpsAcc = fpsN = fpsT = 0; }
}
hero.baseScale = hero.root.scale.x;
setScene('hub');
window.__db = { get W() { return W; }, get fps() { return lastFps; }, gfx, get hero() { return hero; }, get boss() { return bossModel; }, qview, me, peers, get leader() { return isLeader; }, VERSION, net, transform: k => transform(k), start: startGame };
requestAnimationFrame(frame);
console.log('Dark Battle v' + VERSION + ' · room ' + ROOM + (SOLO ? ' (solo)' : ''));
