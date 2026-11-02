// Player avatars: each form is a rigged, animated GLTF character (see vendor/LICENSES.md) with PBR materials and a
// procedural weapon on the hand bone. Until the model file has loaded, the old procedural rig stands in.
import * as THREE from 'three';
import { Actor, modelReady, loadModel } from './models.js';
import { buildForm } from './forms.js';
import { animateHero } from './hero.js';
import { attachTo } from './boss.js';

export const ANIM_DUR = { l1: 0.32, l2: 0.32, l3: 0.5, heavy: 0.75, roll: 0.5, shoot: 0.17, blast: 0.5, cast: 0.3, cast2: 0.6, jump: 0.8, lunge: 0.45, pound: 0.8, special: 0.6, fin: 1.1, hurt: 0.3, throw: 0.35, catch: 0.3 };
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.5, metalness: o.m ?? 0, ...(o.e != null ? { emissive: new THREE.Color(o.e), emissiveIntensity: o.ei ?? 2 } : {}) });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mesh = (p, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };

function rifle() {
  const g = new THREE.Group(), dark = std(0x1c1f24, { r: 0.35, m: 0.8 }), poly = std(0x2e3a2a, { r: 0.7 }), glow = std(0, { e: 0x30c8ff, ei: 3 });
  mesh(g, new THREE.BoxGeometry(0.06, 0.1, 0.42), dark, 0, 0, 0.12); mesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), dark, 0, 0.02, 0.5).rotation.x = Math.PI / 2;
  mesh(g, new THREE.BoxGeometry(0.05, 0.12, 0.05), poly, 0, -0.09, 0.02); mesh(g, new THREE.BoxGeometry(0.045, 0.14, 0.06), poly, 0, -0.1, 0.17).rotation.x = 0.25;
  mesh(g, new THREE.BoxGeometry(0.05, 0.08, 0.2), poly, 0, -0.01, -0.17); mesh(g, new THREE.BoxGeometry(0.03, 0.04, 0.12), dark, 0, 0.08, 0.1);
  mesh(g, new THREE.BoxGeometry(0.035, 0.015, 0.04), glow, 0, 0.105, 0.1);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(-1, 0, 0), V(0, 1, 0)));
  return g;
}
function hammer() {
  const g = new THREE.Group(), wood = std(0x6a4a2a, { r: 0.8 }), steel = std(0x8a929c, { r: 0.35, m: 0.9 }), yel = std(0xf5cd30, { r: 0.4 });
  mesh(g, new THREE.BoxGeometry(0.08, 0.08, 0.9), wood, 0, 0, 0.25); mesh(g, new THREE.BoxGeometry(0.5, 0.32, 0.32), steel, 0, 0, 0.75); mesh(g, new THREE.BoxGeometry(0.52, 0.1, 0.34), yel, 0, 0, 0.75);
  return g;
}
function gauntlet() { const g = new THREE.Group(), m = std(0x6a6f78, { r: 0.35, m: 0.9 }); mesh(g, new THREE.BoxGeometry(0.16, 0.12, 0.16), m, 0, 0.03, 0); for (let i = 0; i < 3; i++) mesh(g, new THREE.ConeGeometry(0.02, 0.07, 4), m, -0.05 + i * 0.05, 0.03, 0.09).rotation.x = Math.PI / 2; return g; }
function shadeEyes() { const g = new THREE.Group(), m = std(0, { e: 0xff3060, ei: 6 }); for (const s of [-1, 1]) mesh(g, new THREE.SphereGeometry(0.025, 8, 6), m, s * 0.06, 0.12, 0.12); return g; }

// clip map entries: 'Clip' | [clip, from, to] (fractions of the clip played over the game anim) ; block = [clip, frozenFrac]
const CHAR = { roll: 'Roll', hurt: 'HitRecieve', dead: 'Death', special: 'Interact', block: ['Interact', 0.35], catch: 'Interact', throw: 'Sword_Slash' };
export const FORM_ACT = {
  warrior: { model: 'vanguard', height: 1.85, idle: 'Idle_Sword', run: 'Run', clips: { ...CHAR, l1: ['Sword_Slash', 0, 0.8], l2: 'Punch_Left', l3: 'Sword_Slash', heavy: 'Sword_Slash', fin: 'Sword_Slash' } },
  soldier: { model: 'trooper', height: 1.85, idle: 'Idle_Gun', run: 'Run', clips: { ...CHAR, shoot: ['Gun_Shoot', 0.1, 0.6], blast: 'Gun_Shoot', fin: 'Kick_Right', l1: 'Gun_Shoot' }, extra: a => attachTo(a, ['WristR'], rifle()) },
  brick: { model: 'blocky', height: 2.0, idle: 'Idle', run: 'Run', clips: { l1: 'Attack', l2: 'Attack', l3: 'Attack', jump: 'Jump', special: 'Jump', hurt: 'HitRecieve', dead: 'Death', block: ['Idle', 0.5], fin: 'Attack' }, extra: a => attachTo(a, ['ArmR_end', 'ArmR'], hammer()) },
  mimic: { model: 'zombie', height: 2.1, idle: 'Idle', run: 'Run', shade: 0x0a0a10, rim: 0x9040ff, rimS: 1.1, clips: { l1: 'Punch', l2: 'Punch', l3: 'Idle_Attack', lunge: 'Run_Attack', special: 'Idle_Attack', block: ['Idle_Attack', 0.3], hurt: 'HitReact', dead: 'Death', jump: 'Jump', fin: 'Run_Attack' }, extra: a => attachTo(a, ['Head'], shadeEyes()) },
  mage: { model: 'wizard', height: 1.9, idle: 'Idle', run: 'Run', clips: { cast: 'Spell1', cast2: 'Spell2', special: 'Spell2', l1: 'Staff_Attack', block: ['Idle_Attacking', 0.3], hurt: 'RecieveHit', dead: 'Death', roll: 'Roll', fin: 'Staff_Attack', jump: 'Roll' } },
  brute: { model: 'adventurer', height: 2.35, widen: 1.25, mul: 0x9ab080, idle: 'Idle', run: 'Run', clips: { ...CHAR, l1: 'Punch_Right', l2: 'Punch_Left', l3: 'Kick_Right', pound: 'Sword_Slash', fin: 'Sword_Slash' }, extra: a => { attachTo(a, ['WristR'], gauntlet()); attachTo(a, ['WristL'], gauntlet()); } },
};
export const preloadForms = () => Promise.all(Object.values(FORM_ACT).map(f => loadModel(f.model)));

export class Avatar {
  constructor(kind, hue) {
    this.kind = kind; this.hue = hue; this.spec = FORM_ACT[kind] || FORM_ACT.warrior;
    this.root = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; this.root.add(shadow); this.shadow = shadow;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.85, 0.55), transparent: true, opacity: 0.7, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; shadow.add(ring); ring.rotation.x = 0; ring.position.set(0, 0, 0.001);
    if (modelReady(this.spec.model)) {
      const s = this.spec;
      this.actor = new Actor(s.model, { height: s.height, widen: s.widen, mul: s.mul, shade: s.shade, rim: s.rim || new THREE.Color().setHSL(hue, 0.8, 0.55).getHex(), rimS: s.rimS ?? 0.25, rimP: 3 });
      this.pivot = new THREE.Group(); this.pivot.position.y = 0.9; this.actor.root.position.y = -0.9; this.pivot.add(this.actor.root); this.root.add(this.pivot);
      if (s.extra) s.extra(this.actor);
      this.actor.set(s.idle);
    } else {
      this.proc = buildForm(kind, hue); this.proc.shadow.visible = false; this.root.add(this.proc.root);
    }
    this.baseScale = 1;
  }
  get gltf() { return !!this.actor; }
  update(dt, anim, at, speed, t, fury) {
    if (this.proc) { animateHero(this.proc, anim, at, speed, t, true, fury); return; }
    const A = this.actor, s = this.spec, C = s.clips, D = ANIM_DUR[anim];
    this.pivot.rotation.x = 0;
    let c = C[anim];
    if (anim === 'dead') A.set(C.dead, at * 1.1, 1, 0.1);
    else if (anim === 'block' && c) A.set(c[0], A.dur(c[0]) * c[1], 1, 0.08);
    else if (D && c) {
      const [clip, f0, f1] = Array.isArray(c) ? c : [c, 0, 1], cd = A.dur(clip);
      A.set(clip, (f0 + (f1 - f0) * Math.max(0, at) / D) * cd, 1, 0.07);
    } else if (anim === 'roll') { // no roll clip: procedural somersault
      A.set(s.run, undefined, 1.4); this.pivot.rotation.x = Math.min(1, at / 0.5) * Math.PI * 2;
    } else if (speed > 0.6) A.set(s.run, undefined, Math.max(0.6, speed / 6));
    else A.set(s.idle);
    A.update(dt);
    if (this.kind === 'warrior' || this.kind === 'brute') A.setRim(fury ? 0xff4010 : new THREE.Color().setHSL(this.hue, 0.8, 0.55).getHex(), fury ? 0.9 + Math.sin(t * 9) * 0.2 : 0.25);
  }
  setGhost(on) {
    if (this.actor) this.actor.setOpacity(on ? 0.22 : 1);
    else this.root.traverse(o => { if (o.material && o.material.opacity !== undefined && o !== this.shadow) { o.material.transparent = true; o.material.opacity = on ? 0.25 : 1; } });
  }
  dispose() { if (this.actor) this.actor.dispose(); }
}
