// The player warrior: procedural model + animation (axe + round shield).
import * as THREE from 'three';
const add = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };

export function hueOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 360) / 360; }

export function buildHero(hue) {
  const cloth = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.55, 0.32) });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc7a184 });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
  const metal = new THREE.MeshLambertMaterial({ color: 0x9aa2ab, emissive: new THREE.Color(0) });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3c22 });
  const beardM = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  const root = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group(); pivot.position.y = 0.55; body.position.y = -0.55; root.add(pivot); pivot.add(body);
  const legs = [];
  for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(0.2 * s, 0.9, 0); body.add(hip); add(hip, new THREE.CylinderGeometry(0.13, 0.11, 0.85, 6), leather, 0, -0.43, 0); add(hip, new THREE.BoxGeometry(0.22, 0.14, 0.34), leather, 0, -0.86, 0.06); legs.push(hip); }
  const torso = new THREE.Group(); torso.position.y = 0.9; body.add(torso);
  add(torso, new THREE.CylinderGeometry(0.36, 0.3, 0.7, 8), skin, 0, 0.38, 0);
  add(torso, new THREE.CylinderGeometry(0.33, 0.36, 0.28, 8), cloth, 0, 0.05, 0); // kilt top
  add(torso, new THREE.CylinderGeometry(0.37, 0.42, 0.34, 8, 1, true), cloth, 0, -0.12, 0);
  add(torso, new THREE.TorusGeometry(0.34, 0.05, 5, 12), leather, 0, 0.2, 0).rotation.x = Math.PI / 2;
  const strap = add(torso, new THREE.BoxGeometry(0.1, 0.85, 0.06), leather, 0, 0.4, 0.31); strap.rotation.z = 0.7;
  add(torso, new THREE.SphereGeometry(0.2, 8, 6), metal, -0.4, 0.68, 0).scale.y = 0.7; // pauldron
  const cape = add(torso, new THREE.BoxGeometry(0.6, 0.8, 0.04), cloth, 0, 0.3, -0.33); cape.rotation.x = 0.12;
  const head = new THREE.Group(); head.position.y = 0.82; torso.add(head);
  add(head, new THREE.SphereGeometry(0.2, 10, 8), skin, 0, 0.12, 0);
  const beard = add(head, new THREE.ConeGeometry(0.16, 0.34, 7), beardM, 0, -0.04, 0.1); beard.rotation.x = Math.PI + 0.35;
  add(head, new THREE.BoxGeometry(0.3, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.9, 0.5) }), 0, 0.18, 0.17); // war paint band
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.43 * s, 0.62, 0); torso.add(sh);
    add(sh, new THREE.CylinderGeometry(0.1, 0.09, 0.42, 6), skin, 0, -0.21, 0);
    const el = new THREE.Group(); el.position.y = -0.42; sh.add(el);
    add(el, new THREE.CylinderGeometry(0.1, 0.09, 0.4, 6), leather, 0, -0.2, 0);
    const hand = new THREE.Group(); hand.position.y = -0.42; el.add(hand);
    arms.push({ sh, el, hand });
  }
  // axe in right hand
  const axe = new THREE.Group();
  add(axe, new THREE.CylinderGeometry(0.035, 0.04, 0.9, 6), wood, 0, 0.25, 0);
  const bladeShape = new THREE.Shape(); bladeShape.moveTo(0, 0.12); bladeShape.quadraticCurveTo(0.22, 0.2, 0.36, 0.3); bladeShape.quadraticCurveTo(0.3, 0, 0.36, -0.3); bladeShape.quadraticCurveTo(0.22, -0.2, 0, -0.12); bladeShape.lineTo(0, 0.12);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.04, bevelEnabled: false }), metal); blade.position.set(0.02, 0.6, -0.02); axe.add(blade);
  const runeGlow = add(axe, new THREE.BoxGeometry(0.05, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0x8fd8ff }), 0.17, 0.6, 0.0);
  axe.rotation.x = Math.PI / 2; arms[1].hand.add(axe);
  // shield on left forearm
  const shield = new THREE.Group();
  add(shield, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14), wood, 0, 0, 0).rotation.x = Math.PI / 2;
  add(shield, new THREE.TorusGeometry(0.42, 0.035, 5, 18), metal, 0, 0, 0.0);
  add(shield, new THREE.SphereGeometry(0.1, 8, 6), metal, 0, 0, 0.05);
  shield.position.set(-0.08, 0.15, 0.12); shield.rotation.y = -Math.PI / 2 + 0.2; arms[0].el.add(shield);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; root.add(shadow);
  root.scale.setScalar(1.15);
  return { root, pivot, body, torso, head, legs, arms, axe, shield, metal, cloth, runeGlow, shadow };
}

// anim: idle run l1 l2 l3 heavy roll block throw catch fin dead hurt ; at: seconds into anim
export function animateHero(m, anim, at, speed, t, hasAxe, fury) {
  const [L, Rr] = m.arms; const ease = x => x * x * (3 - 2 * x);
  let ls = 0.15, rs = 0.15, lz = 0.12, rz = -0.12, le = -0.3, re = -0.3, tY = 0, tX = 0, bodyY = 0, rollX = 0, legA = 0, legB = 0;
  const run = Math.min(1, speed / 6);
  if (run > 0.05 && anim !== 'roll') { const w = Math.sin(t * 13) * run; legA = w * 0.8; legB = -w * 0.8; ls = -w * 0.6; rs = w * 0.6; bodyY = Math.abs(Math.sin(t * 13)) * 0.06 * run; tX = 0.15 * run; }
  else { const b = Math.sin(t * 2) * 0.02; bodyY = b; }
  const k = (d) => Math.min(1, at / d);
  m.pivot.position.y = 0.55;
  switch (anim) {
    case 'l1': { const q = ease(k(0.28)); rs = -1.6 + 2.6 * q; rz = -0.4 - 0.6 * (1 - q); tY = 0.6 - 1.2 * q; re = -0.6; break; }
    case 'l2': { const q = ease(k(0.28)); rs = -0.4; rz = -1.6 + 2.2 * q; tY = -0.7 + 1.4 * q; re = -0.2; break; }
    case 'l3': { const q = ease(k(0.45)); rs = q < 0.45 ? -2.8 * (q / 0.45) : -2.8 + 3.9 * ((q - 0.45) / 0.55); tX = q < 0.45 ? -0.2 : 0.5; bodyY = Math.sin(Math.min(1, q * 1.4) * Math.PI) * 0.4; re = -0.2; break; }
    case 'heavy': { const q = k(0.7); if (q < 0.6) { const w = ease(q / 0.6); rs = ls = -2.9 * w; tX = -0.25 * w; } else { const w = ease((q - 0.6) / 0.4); rs = ls = -2.9 + 4.1 * w; tX = -0.25 + 0.85 * w; bodyY = -0.15 * w; } break; }
    case 'roll': { const q = k(0.5); rollX = q * Math.PI * 2; bodyY = -0.35 * Math.sin(q * Math.PI); legA = legB = -1.2 * Math.sin(q * Math.PI); break; }
    case 'block': { ls = -1.4; lz = 0.9; le = -1.2; tY = 0.25; rs = 0.4; break; }
    case 'throw': { const q = k(0.35); rs = q < 0.5 ? -2.6 * ease(q / 0.5) : -2.6 + 3.4 * ease((q - 0.5) / 0.5); tY = 0.4 - 0.8 * q; break; }
    case 'catch': { const q = k(0.3); rs = -1.2 + q; rz = -0.6; break; }
    case 'fin': { const q = k(1.1); rs = ls = q < 0.6 ? -3.0 : -3.0 + 4.2 * ease((q - 0.6) / 0.4); tX = q < 0.6 ? -0.3 : 0.7; rollX = q < 0.6 ? -q * 1.2 : 0; break; }
    case 'shoot': { const q = k(0.2); rs = -1.55; ls = -1.3; lz = -0.5; re = 0; le = -0.3; tX = -0.05 * (1 - q); break; }
    case 'blast': { const q = k(0.4); rs = ls = -1.5; lz = -0.4; re = le = 0; tX = q < 0.3 ? -0.4 : 0; break; }
    case 'cast': { const q = k(0.3); rs = -2.2 + 0.8 * q; ls = -1.2; lz = 0.6; break; }
    case 'cast2': { const q = k(0.6); rs = ls = -2.9; lz = 0.5; rz = -0.5; tX = -0.2 * q; break; }
    case 'jump': { const q = k(0.8); rs = ls = q < 0.6 ? -2.9 : 0.8; legA = legB = -0.6; tX = q < 0.6 ? -0.2 : 0.5; break; }
    case 'lunge': { const q = k(0.45); rs = ls = -1.6; lz = 0.6; rz = -0.6; tX = 0.6 * Math.sin(q * Math.PI); break; }
    case 'pound': { const q = k(0.8); if (q < 0.55) { rs = ls = -3.0 * ease(q / 0.55); } else { rs = ls = -3.0 + 3.8 * ease((q - 0.55) / 0.45); tX = 0.5; bodyY = -0.2; } break; }
    case 'special': { const q = k(0.6); rs = ls = -2.6; lz = 1.0; rz = -1.0; tX = -0.3 * Math.sin(q * Math.PI); bodyY = 0.1; break; }
    case 'hurt': { tX = -0.4 * (1 - k(0.3)); break; }
    case 'dead': { rollX = -Math.PI / 2 * ease(k(0.6)); bodyY = 0.1 * ease(k(0.6)); m.pivot.position.y = 0.55 - 0.3 * ease(k(0.6)); break; }
  }
  m.legs[0].rotation.x = legA; m.legs[1].rotation.x = legB;
  L.sh.rotation.x += (ls - L.sh.rotation.x) * 0.45; Rr.sh.rotation.x += (rs - Rr.sh.rotation.x) * 0.55;
  L.sh.rotation.z += (lz - L.sh.rotation.z) * 0.4; Rr.sh.rotation.z += (rz - Rr.sh.rotation.z) * 0.5;
  L.el.rotation.x = le; Rr.el.rotation.x = re;
  m.torso.rotation.y += (tY - m.torso.rotation.y) * 0.4; m.torso.rotation.x += (tX - m.torso.rotation.x) * 0.4;
  m.body.position.y = -0.55 + bodyY; m.pivot.rotation.x = rollX;
  if (m.runeGlow) m.runeGlow.material.color.setHex(fury ? 0xff5020 : 0x8fd8ff);
  if (m.metal) m.metal.emissive.setHex(fury ? 0x501000 : 0);
}
