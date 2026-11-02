// GLTF character/boss loading + a small animation controller with manual-time and looped clips.
import * as THREE from 'three';
import { GLTFLoader, MeshoptDecoder, cloneSkinned } from 'three/addons';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {}, done = {};
const listeners = new Set();
export const onModel = fn => listeners.add(fn);
export function loadModel(name) {
  if (!cache[name]) cache[name] = new Promise(res => {
    loader.load(`models/${name}.glb`, g => { done[name] = g; prepClips(g); res(g); listeners.forEach(f => f(name)); }, undefined, e => { console.warn('model failed', name, e); res(null); });
  });
  return cache[name];
}
export const modelReady = name => !!done[name];
export const loadedCount = () => Object.keys(done).length;

// keep animations in place: lock the root bone's horizontal translation (the game moves the character)
function prepClips(g) {
  for (const c of g.animations) {
    for (const tr of c.tracks) {
      if (!tr.name.endsWith('.position')) continue;
      const bone = tr.name.split('.')[0];
      if (!/^(Hips|Root|Body|Torso|Pelvis|Spine|Armature)$/i.test(bone) && !/hips|root/i.test(bone)) continue;
      const v = tr.values; const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
}

const RIM_COL = new THREE.Color();
function addRim(mat, color, power, strength) {
  mat.userData.rim = { value: new THREE.Color(color) }; mat.userData.rimS = { value: strength }; mat.userData.flash = { value: 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.rimCol = mat.userData.rim; sh.uniforms.rimS = mat.userData.rimS; sh.uniforms.flashV = mat.userData.flash;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 rimCol; uniform float rimS; uniform float flashV;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), ${power.toFixed(1)});
          totalEmissiveRadiance += rimCol * fr * rimS + vec3(1.0, 0.55, 0.45) * flashV; }`);
  };
  mat.customProgramCacheKey = () => 'rim' + power;
}

// spec: { height, tint:{matNameRegex:color}, rim, rimS, shade (dark silhouette), emissiveEyes, widen }
export class Actor {
  constructor(name, spec = {}) {
    const g = done[name];
    this.name = name; this.spec = spec;
    this.root = new THREE.Group();
    this.model = cloneSkinned(g.scene);
    this.root.add(this.model);
    this.mats = [];
    const matMap = new Map();
    this.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.shared = true;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const nm = ms.map(m0 => {
        if (matMap.has(m0)) return matMap.get(m0);
        const m = spec.shade ? new THREE.MeshStandardMaterial({ color: spec.shade, roughness: 0.55, metalness: 0.2 }) : m0.clone();
        if (!spec.shade) {
          const n = (m0.name || '') + ' ' + (o.name || '');
          if (/metal|gold|sword|armou?r|helm|visor|claw/i.test(n)) { m.metalness = 0.85; m.roughness = 0.32; }
          else if (/skin|face|eye/i.test(n)) { m.metalness = 0; m.roughness = 0.55; }
          else { m.metalness = 0.02; m.roughness = 0.78; }
          if (spec.tint) for (const [re, col] of spec.tint) if (new RegExp(re, 'i').test(n)) m.color.lerp(new THREE.Color(col), 0.75);
          if (spec.mul) m.color.multiply(new THREE.Color(spec.mul));
          if (spec.metal != null) { m.metalness = Math.max(m.metalness, spec.metal); m.roughness = Math.min(m.roughness, 0.5); }
          m.envMapIntensity = 1;
        }
        m.transparent = false; m.opacity = 1;
        addRim(m, spec.rim || 0x000000, spec.rimP || 3.0, spec.rim ? (spec.rimS ?? 0.8) : 0);
        matMap.set(m0, m); this.mats.push(m); return m;
      });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    });
    // normalise size: feet on the ground, given height
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model, true), size = box.getSize(new THREE.Vector3());
    const h = spec.height || 1.8, s = h / Math.max(0.01, spec.byLength ? Math.max(size.x, size.z) : size.y);
    this.model.scale.multiplyScalar(s);
    if (spec.widen) { this.model.scale.x *= spec.widen; this.model.scale.z *= spec.widen; }
    this.model.position.y = -box.min.y * s + (spec.yOff || 0);
    this.size = size.multiplyScalar(s);
    if (spec.rotY) this.model.rotation.y = spec.rotY;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {}; for (const c of g.animations) this.clips[c.name] = c;
    this.acts = new Map(); this.target = null;
    this.bones = {}; this.model.traverse(o => { if (o.isBone || o.type === 'Bone' || o.isObject3D) this.bones[o.name] = this.bones[o.name] || o; });
  }
  bone(...names) { for (const n of names) if (this.bones[n]) return this.bones[n]; return null; }
  clipName(n) { if (Array.isArray(n)) { for (const k of n) if (this.clips[k]) return k; return null; } return this.clips[n] ? n : null; }
  dur(n) { const k = this.clipName(n); return k ? this.clips[k].duration : 1; }
  // time: undefined -> loop at speed ; number -> manual pose at that clip time
  set(n, time, speed = 1, fade = 0.18) {
    const k = this.clipName(n); if (!k) return;
    let a = this.acts.get(k);
    if (!a) { a = this.mixer.clipAction(this.clips[k]); a.w = 0; this.acts.set(k, a); }
    if (this.target !== a) { if (!a.isRunning()) { a.reset(); a.play(); } this.target = a; a.fade = fade; a.enabled = true; }
    if (time === undefined) { a.setLoop(THREE.LoopRepeat); a.timeScale = speed; a.manual = false; }
    else { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.timeScale = 0; a.manual = true; a.time = Math.max(0, Math.min(this.clips[k].duration - 0.001, time)); a.paused = false; }
  }
  update(dt) {
    for (const [k, a] of this.acts) {
      const goal = a === this.target ? 1 : 0, f = (this.target && this.target.fade) || 0.18;
      a.w += (goal - a.w) * Math.min(1, dt / Math.max(0.001, f) * 1.6);
      if (goal === 1 && a.w > 0.995) a.w = 1;
      if (goal === 0 && a.w < 0.01) { a.w = 0; if (a.isRunning()) a.stop(); continue; }
      if (!a.isRunning()) a.play();
      a.setEffectiveWeight(a.w);
    }
    this.mixer.update(dt);
  }
  setFlash(v) { for (const m of this.mats) m.userData.flash.value = v; }
  setRim(col, s) { for (const m of this.mats) { if (col != null) m.userData.rim.value.set(col); if (s != null) m.userData.rimS.value = s; } }
  setOpacity(o) { for (const m of this.mats) { const tr = o < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = o; m.depthWrite = !tr; } }
  dispose() { this.mixer.stopAllAction(); for (const m of this.mats) { m.dispose(); } }
}
