// Transformations: six original forms, each with its own model, attacks and special.
import * as THREE from 'three';
import { buildHero } from './hero.js';
const add = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };

export const FORMS = {
  warrior: { name: 'Vanguard', icon: '🪓', desc: 'Axe & shield. Weighty combos.', light: 'Axe combo', heavy: 'Overhead cleave', special: 'Fury', scd: 22, speed: 6.2, ranged: false },
  soldier: { name: 'Drop Trooper', icon: '🔫', desc: 'Battle-royale style: rifle, shotgun, build walls.', light: 'Rifle', heavy: 'Shotgun blast', special: 'Build Wall', scd: 12, speed: 6.6, ranged: true },
  brick: { name: 'Blockhead', icon: '🧱', desc: 'Blocky brick avatar: hammer bonks & jump slams.', light: 'Hammer bonk', heavy: 'Jump slam', special: 'Tower Jump', scd: 16, speed: 6.4, ranged: false },
  mimic: { name: 'Shadow Mimic', icon: '👁', desc: 'Horror shapeshifter: vanish, then teleport-strike.', light: 'Claw swipe', heavy: 'Lunge', special: 'Shade Step', scd: 15, speed: 7.2, ranged: false },
  mage: { name: 'Arcanist', icon: '🔮', desc: 'Arcane bolts, delayed nova, healing ward for the team.', light: 'Arcane bolt', heavy: 'Star nova', special: 'Healing Ward', scd: 20, speed: 6.0, ranged: true },
  brute: { name: 'Ogre Brute', icon: '👊', desc: 'Huge fists, ground pounds, unstoppable rage.', light: 'Haymaker', heavy: 'Ground pound', special: 'Unstoppable', scd: 22, speed: 5.6, ranged: false },
};
export const FORM_KEYS = Object.keys(FORMS);
export const SWITCH_CD = 3;

function rig(scale) {
  const root = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  pivot.position.y = 0.55; body.position.y = -0.55; root.add(pivot); pivot.add(body);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; root.add(shadow);
  root.scale.setScalar(scale);
  return { root, pivot, body, shadow };
}
function limbs(m, o) {
  const legs = [], arms = [];
  for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(o.hipW * s, o.hipY, 0); m.body.add(hip); add(hip, o.legG, o.legM, 0, -o.hipY / 2, 0); legs.push(hip); }
  const torso = new THREE.Group(); torso.position.y = o.hipY; m.body.add(torso);
  const head = new THREE.Group(); head.position.y = o.neckY; torso.add(head);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(o.shW * s, o.shY, 0); torso.add(sh);
    add(sh, o.armG, o.armM, 0, -o.armL / 2, 0);
    const el = new THREE.Group(); el.position.y = -o.armL; sh.add(el);
    add(el, o.armG, o.armM, 0, -o.armL / 2, 0);
    const hand = new THREE.Group(); hand.position.y = -o.armL; el.add(hand);
    arms.push({ sh, el, hand });
  }
  Object.assign(m, { legs, arms, torso, head });
}
export function buildForm(kind, hue) {
  if (kind === 'warrior') { const m = buildHero(hue); m.kind = kind; return m; }
  const col = new THREE.Color().setHSL(hue, 0.55, 0.4);
  const L = c => new THREE.MeshLambertMaterial({ color: c });
  let m;
  if (kind === 'soldier') {
    m = rig(1.15); const camo = L(new THREE.Color(0x4a5a3a).lerp(col, 0.35)), dark = L(0x2a2a2a), skin = L(0xc7a184);
    limbs(m, { hipW: 0.18, hipY: 0.9, legG: new THREE.CylinderGeometry(0.13, 0.12, 0.9, 6), legM: camo, neckY: 0.82, shW: 0.42, shY: 0.62, armL: 0.42, armG: new THREE.CylinderGeometry(0.09, 0.08, 0.42, 6), armM: camo });
    add(m.torso, new THREE.BoxGeometry(0.66, 0.75, 0.4), camo, 0, 0.38, 0); add(m.torso, new THREE.BoxGeometry(0.7, 0.4, 0.46), dark, 0, 0.45, 0);
    add(m.torso, new THREE.BoxGeometry(0.5, 0.55, 0.25), L(0x5a4630), 0, 0.42, -0.32); // backpack
    add(m.head, new THREE.SphereGeometry(0.19, 10, 8), skin, 0, 0.12, 0);
    const helm = add(m.head, new THREE.SphereGeometry(0.23, 10, 8, 0, 6.3, 0, 1.6), camo, 0, 0.16, 0);
    add(m.head, new THREE.BoxGeometry(0.3, 0.07, 0.05), L(0x30c8ff), 0, 0.14, 0.18);
    const gun = new THREE.Group(); add(gun, new THREE.BoxGeometry(0.1, 0.16, 0.85), dark, 0, 0, 0.3); add(gun, new THREE.BoxGeometry(0.06, 0.06, 0.4), dark, 0, 0.03, 0.9); add(gun, new THREE.BoxGeometry(0.08, 0.22, 0.1), dark, 0, -0.15, 0.2);
    gun.rotation.x = Math.PI / 2; m.arms[1].hand.add(gun); m.weapon = gun;
  } else if (kind === 'brick') {
    m = rig(1.15); const shirt = L(col), pants = L(0x2a50a8), yel = L(0xf5cd30);
    limbs(m, { hipW: 0.17, hipY: 0.8, legG: new THREE.BoxGeometry(0.3, 0.8, 0.32), legM: pants, neckY: 0.85, shW: 0.47, shY: 0.68, armL: 0.38, armG: new THREE.BoxGeometry(0.26, 0.38, 0.28), armM: yel });
    add(m.torso, new THREE.BoxGeometry(0.7, 0.85, 0.38), shirt, 0, 0.42, 0);
    add(m.head, new THREE.BoxGeometry(0.5, 0.5, 0.5), yel, 0, 0.22, 0);
    add(m.head, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), yel, 0, 0.52, 0);
    for (const s of [-1, 1]) add(m.head, new THREE.BoxGeometry(0.07, 0.1, 0.02), L(0x111111), s * 0.11, 0.27, 0.26);
    add(m.head, new THREE.BoxGeometry(0.2, 0.04, 0.02), L(0x111111), 0, 0.13, 0.26);
    const ham = new THREE.Group(); add(ham, new THREE.BoxGeometry(0.08, 0.08, 0.9), L(0x6a4a2a), 0, 0, 0.35); add(ham, new THREE.BoxGeometry(0.5, 0.32, 0.32), L(0x888f99), 0, 0, 0.85);
    ham.rotation.x = Math.PI / 2; m.arms[1].hand.add(ham); m.weapon = ham;
  } else if (kind === 'mimic') {
    m = rig(1.25); const sh = new THREE.MeshLambertMaterial({ color: 0x0a0a0e, transparent: true, opacity: 1 });
    limbs(m, { hipW: 0.13, hipY: 1.0, legG: new THREE.CylinderGeometry(0.07, 0.05, 1.0, 5), legM: sh, neckY: 0.95, shW: 0.3, shY: 0.75, armL: 0.62, armG: new THREE.CylinderGeometry(0.06, 0.04, 0.62, 5), armM: sh });
    add(m.torso, new THREE.CylinderGeometry(0.24, 0.14, 0.95, 6), sh, 0, 0.45, 0);
    add(m.head, new THREE.SphereGeometry(0.2, 8, 6), sh, 0, 0.18, 0).scale.y = 1.4;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    for (const s of [-1, 1]) add(m.head, new THREE.SphereGeometry(0.045, 6, 4), eyeM, s * 0.08, 0.24, 0.17);
    add(m.head, new THREE.BoxGeometry(0.16, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: 0xaa0000 }), 0, 0.08, 0.19);
    for (const a of m.arms) for (let i = 0; i < 3; i++) { const c = add(a.hand, new THREE.ConeGeometry(0.025, 0.3, 4), eyeM, (i - 1) * 0.05, -0.12, 0); c.rotation.x = Math.PI; }
    m.ghostMats = [sh, eyeM];
  } else if (kind === 'mage') {
    m = rig(1.15); const robe = L(new THREE.Color(0x3a2a6a).lerp(col, 0.3)), skin = L(0xd8b8a0), gold = L(0xd8b048);
    limbs(m, { hipW: 0.15, hipY: 0.9, legG: new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), legM: robe, neckY: 0.8, shW: 0.36, shY: 0.6, armL: 0.4, armG: new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), armM: robe });
    add(m.body, new THREE.ConeGeometry(0.5, 1.2, 10, 1, true), robe, 0, 0.6, 0);
    add(m.torso, new THREE.CylinderGeometry(0.28, 0.33, 0.7, 8), robe, 0, 0.35, 0);
    add(m.head, new THREE.SphereGeometry(0.18, 10, 8), skin, 0, 0.1, 0);
    add(m.head, new THREE.ConeGeometry(0.26, 0.6, 10), robe, 0, 0.38, -0.03);
    add(m.head, new THREE.ConeGeometry(0.12, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }), 0, -0.1, 0.12).rotation.x = Math.PI + 0.3;
    const st = new THREE.Group(); add(st, new THREE.CylinderGeometry(0.03, 0.04, 1.6, 6), L(0x5a3c22), 0, 0.3, 0); const orb = add(st, new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0x8ad8ff }), 0, 1.15, 0);
    st.rotation.x = Math.PI / 2; m.arms[1].hand.add(st); m.weapon = st; m.orb = orb;
  } else { // brute
    m = rig(1.45); const skin = L(new THREE.Color(0x5a7a40).lerp(col, 0.2)), cloth = L(0x4a3020), metal = L(0x777f88);
    limbs(m, { hipW: 0.24, hipY: 0.75, legG: new THREE.CylinderGeometry(0.17, 0.15, 0.75, 7), legM: cloth, neckY: 0.85, shW: 0.6, shY: 0.65, armL: 0.42, armG: new THREE.CylinderGeometry(0.15, 0.13, 0.42, 7), armM: skin });
    add(m.torso, new THREE.SphereGeometry(0.55, 10, 8), skin, 0, 0.45, 0).scale.set(1, 0.95, 0.8);
    add(m.torso, new THREE.TorusGeometry(0.5, 0.08, 5, 14), cloth, 0, 0.15, 0).rotation.x = Math.PI / 2;
    add(m.head, new THREE.SphereGeometry(0.2, 10, 8), skin, 0, 0.05, 0.08);
    for (const s of [-1, 1]) { const t = add(m.head, new THREE.ConeGeometry(0.04, 0.14, 4), L(0xeeeedd), s * 0.07, -0.03, 0.26); t.rotation.x = 0.3; add(m.torso, new THREE.SphereGeometry(0.22, 8, 6), metal, s * 0.55, 0.78, 0).scale.y = 0.6; }
    for (const a of m.arms) add(a.hand, new THREE.DodecahedronGeometry(0.22, 0), skin, 0, -0.08, 0);
  }
  m.kind = kind;
  return m;
}
