// Procedural firearms. Convention: muzzle points to -Z, origin at the trigger, +Y up.
import * as THREE from 'three';
import { M } from './materials.js';
import { part, mergeByMaterial } from '../core/utils.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylZ = (r1, r2, len, seg = 12) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2);

/** Extrude a side profile drawn in (forward, up) and give it a width along X. */
function profile(points, width, curves = null, bevel = 0.003) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.length === 4) s.quadraticCurveTo(p[2], p[3], p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curves ?? 6,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // shape +x (forward) -> -Z, extrusion -> X
  return g;
}

function rail(parent, z0, z1, y, mat = M.gunMetal) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  part(box(0.022, 0.007, len), mat, [0, y, zc], null, null, parent);
  for (let z = Math.min(z0, z1) + 0.006; z < Math.max(z0, z1); z += 0.01)
    part(box(0.024, 0.005, 0.005), mat, [0, y + 0.006, z], null, null, parent);
}

function holoSight(parent, z, y) {
  const g = new THREE.Group(); g.position.set(0, y, z); parent.add(g);
  part(box(0.036, 0.012, 0.09), M.gunDark, [0, 0, 0], null, null, g);
  part(box(0.04, 0.02, 0.04), M.gunDark, [0, 0.014, 0.02], null, null, g); // battery housing
  part(box(0.006, 0.042, 0.05), M.gunDark, [0.021, 0.035, -0.015], null, null, g);
  part(box(0.006, 0.042, 0.05), M.gunDark, [-0.021, 0.035, -0.015], null, null, g);
  part(box(0.048, 0.006, 0.055), M.gunDark, [0, 0.058, -0.015], null, null, g);
  part(box(0.012, 0.01, 0.012), M.gunDark, [0.028, 0.02, 0.02], null, null, g); // buttons
  const glass = part(new THREE.PlaneGeometry(0.036, 0.036), M.lens, [0, 0.036, -0.03], null, null, g);
  glass.userData.noMerge = true;
  const ret = new THREE.Group(); ret.position.set(0, 0.036, -0.029); ret.userData.noMerge = true; g.add(ret);
  part(new THREE.RingGeometry(0.0055, 0.0068, 32), M.reticle, [0, 0, 0], null, null, ret);
  part(new THREE.CircleGeometry(0.0011, 12), M.reticle, [0, 0, 0], null, null, ret);
  return y + 0.036; // sight line height
}

export function buildM4() {
  const g = new THREE.Group();
  // lower
  part(box(0.044, 0.05, 0.19), M.gunMetal, [0, 0, -0.05], null, null, g);
  part(box(0.05, 0.06, 0.08), M.gunMetal, [0, -0.045, -0.1], null, null, g); // magwell
  part(box(0.008, 0.006, 0.075), M.gunMetal, [0, -0.052, -0.01], null, null, g); // guard bottom
  part(box(0.008, 0.035, 0.006), M.gunMetal, [0, -0.035, -0.045], null, null, g);
  part(box(0.005, 0.022, 0.006), M.gunDark, [0, -0.028, -0.012], [0.3, 0, 0], null, g); // trigger
  part(profile([[0.005, 0], [-0.035, 0], [-0.075, -0.105, -0.06, -0.06], [-0.045, -0.118], [-0.012, -0.03, -0.01, -0.02]], 0.03),
    M.polymer, [0, -0.02, 0.02], null, null, g); // grip
  part(box(0.004, 0.012, 0.03), M.gunDark, [0.024, -0.005, -0.08], null, null, g); // mag release
  // upper
  part(box(0.05, 0.05, 0.27), M.gunMetal, [0, 0.048, -0.055], null, null, g);
  part(box(0.004, 0.02, 0.06), M.gunDark, [0.026, 0.045, -0.025], null, null, g); // ejection port
  part(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 10), M.gunMetal, [0.03, 0.055, 0.045], [Math.PI / 2, 0, 0.4], null, g); // fwd assist
  part(box(0.05, 0.008, 0.016), M.gunDark, [0, 0.078, 0.078], null, null, g); // charging handle
  rail(g, 0.075, -0.19, 0.077);
  // buffer tube + stock
  part(cylZ(0.016, 0.016, 0.2), M.gunMetal, [0, 0.035, 0.17], null, null, g);
  part(profile([[0, 0.04], [-0.17, 0.045], [-0.195, 0.035], [-0.2, -0.1], [-0.165, -0.105], [-0.13, -0.03, -0.14, -0.06], [0, -0.012]], 0.042),
    M.polymer, [0, 0.03, 0.14], null, null, g);
  part(box(0.044, 0.15, 0.015), M.rubber, [0, -0.0, 0.345], null, null, g);
  // handguard
  const hg = part(new THREE.CylinderGeometry(0.034, 0.034, 0.31, 8).rotateX(Math.PI / 2), M.gunMetal, [0, 0.045, -0.345], [0, 0, Math.PI / 8], null, g);
  hg.rotation.z = Math.PI / 8;
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++)
    part(box(0.004, 0.009, 0.03), M.gunDark, [side * 0.033, 0.045, -0.23 - i * 0.05], null, null, g);
  rail(g, -0.2, -0.49, 0.079);
  // barrel / muzzle
  part(cylZ(0.011, 0.011, 0.16), M.gunDark, [0, 0.045, -0.57], null, null, g);
  part(cylZ(0.017, 0.017, 0.06, 10), M.gunDark, [0, 0.045, -0.64], null, null, g);
  for (let i = 0; i < 3; i++) part(cylZ(0.0175, 0.0175, 0.005, 10), M.polymer, [0, 0.045, -0.625 - i * 0.015], null, null, g);
  // flip-up front sight
  part(box(0.008, 0.03, 0.012), M.gunDark, [0, 0.095, -0.47], [-1.2, 0, 0], null, g);
  // vertical grip + light
  part(new THREE.CylinderGeometry(0.016, 0.018, 0.1, 10), M.polymer, [0, -0.025, -0.3], null, null, g);
  part(cylZ(0.014, 0.014, 0.08), M.gunDark, [0.045, 0.045, -0.43], null, null, g);
  part(new THREE.CircleGeometry(0.012, 12), M.headlight, [0.045, 0.045, -0.4705], [0, Math.PI, 0], null, g);
  // magazine (separate for reload anim)
  const mag = new THREE.Group(); mag.position.set(0, -0.06, -0.1); mag.userData.noMerge = true; g.add(mag);
  part(profile([[-0.034, 0], [0.034, 0], [0.058, -0.19, 0.05, -0.1], [-0.012, -0.195], [-0.034, 0, -0.03, -0.1]], 0.026), M.tanPolymer, [0, 0, 0], null, null, mag);
  part(box(0.032, 0.014, 0.08), M.tanPolymer, [0, -0.19, -0.022], [-0.2, 0, 0], null, mag);
  mergeByMaterial(mag, { shadows: false });
  const sightY = holoSight(g, -0.04, 0.087);

  mergeByMaterial(g, { shadows: false });
  g.userData = { muzzle: new THREE.Vector3(0, 0.045, -0.68), eject: new THREE.Vector3(0.03, 0.05, -0.02), sightY, mag, magPos: mag.position.clone() };
  return g;
}

export function buildAK() {
  const g = new THREE.Group();
  // receiver with rounded dust cover
  part(box(0.044, 0.05, 0.25), M.akMetal, [0, 0.01, -0.06], null, null, g);
  part(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), M.akMetal, [0, 0.035, -0.055], null, null, g);
  part(box(0.003, 0.012, 0.13), M.gunDark, [0.024, 0.035, -0.08], null, null, g); // bolt track
  part(box(0.006, 0.01, 0.03), M.gunMetal, [0.028, 0.036, -0.02], null, null, g); // charging handle
  part(box(0.006, 0.02, 0.1), M.gunMetal, [0.024, -0.005, -0.03], [0.1, 0, 0], null, g); // safety lever
  part(box(0.008, 0.006, 0.07), M.akMetal, [0, -0.035, -0.005], null, null, g);
  part(box(0.005, 0.022, 0.006), M.gunDark, [0, -0.025, -0.012], [0.3, 0, 0], null, g);
  // bakelite grip
  part(profile([[0.005, 0], [-0.03, 0], [-0.07, -0.1, -0.055, -0.055], [-0.042, -0.11], [-0.01, -0.02]], 0.028), M.akWood, [0, -0.012, 0.03], null, null, g);
  // wooden stock
  part(profile([[0, 0.03], [-0.25, 0.005], [-0.26, -0.11], [-0.22, -0.11], [-0.03, -0.035], [0, -0.03]], 0.04, null, 0.006), M.akWood, [0, 0.02, 0.07], null, null, g);
  part(box(0.042, 0.12, 0.012), M.akMetal, [0, -0.03, 0.335], [0.08, 0, 0], null, g);
  // wood handguard + gas tube
  part(new THREE.CylinderGeometry(0.03, 0.028, 0.2, 10).rotateX(Math.PI / 2), M.akWood, [0, 0.01, -0.29], null, [1, 1.05, 1], g);
  part(new THREE.CylinderGeometry(0.02, 0.019, 0.19, 10).rotateX(Math.PI / 2), M.akWood, [0, 0.048, -0.29], null, null, g);
  part(cylZ(0.009, 0.009, 0.2), M.akMetal, [0, 0.05, -0.3], null, null, g);
  // rear sight leaf
  part(box(0.03, 0.02, 0.05), M.akMetal, [0, 0.07, -0.19], null, null, g);
  part(box(0.02, 0.008, 0.06), M.akMetal, [0, 0.083, -0.21], null, null, g);
  // barrel, gas block, front sight, muzzle brake
  part(cylZ(0.011, 0.011, 0.25), M.akMetal, [0, 0.01, -0.5], null, null, g);
  part(box(0.026, 0.05, 0.03), M.akMetal, [0, 0.03, -0.41], null, null, g);
  part(box(0.024, 0.055, 0.02), M.akMetal, [0, 0.045, -0.58], null, null, g);
  part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 6), M.akMetal, [0, 0.085, -0.58], null, null, g);
  part(cylZ(0.015, 0.015, 0.06, 10), M.akMetal, [0, 0.01, -0.645], null, null, g);
  // curved magazine
  const mag = new THREE.Group(); mag.position.set(0, -0.02, -0.1); mag.userData.noMerge = true; g.add(mag);
  part(profile([[-0.04, 0], [0.04, 0], [0.13, -0.2, 0.06, -0.1], [0.07, -0.22], [-0.04, 0, 0.0, -0.12]], 0.028), M.akMetal, [0, 0, 0], null, null, mag);
  for (let i = 1; i < 6; i++) part(box(0.03, 0.004, 0.02), M.gunDark, [0, -0.035 * i, -0.02 - i * i * 0.0028], null, null, mag);
  mergeByMaterial(mag, { shadows: true });
  mergeByMaterial(g, { shadows: true });
  g.userData = { muzzle: new THREE.Vector3(0, 0.01, -0.68), sightY: 0.09, mag, magPos: mag.position.clone() };
  return g;
}

export function buildPistol() {
  const g = new THREE.Group();
  part(box(0.028, 0.03, 0.19), M.gunMetal, [0, 0.045, -0.06], null, null, g); // slide
  for (let i = 0; i < 6; i++) part(box(0.03, 0.022, 0.003), M.gunDark, [0, 0.047, 0.02 - i * 0.007], null, null, g); // serrations
  part(box(0.004, 0.012, 0.035), M.gunDark, [0.015, 0.05, -0.05], null, null, g); // ejection port
  part(box(0.026, 0.022, 0.17), M.polymer, [0, 0.02, -0.055], null, null, g); // frame
  part(box(0.008, 0.008, 0.008), M.gunDark, [0, 0.064, 0.025], null, null, g); // rear sight
  part(box(0.004, 0.008, 0.006), M.gunDark, [0, 0.064, -0.145], null, null, g); // front sight
  part(cylZ(0.008, 0.008, 0.01), M.gunDark, [0, 0.045, -0.155], null, null, g);
  part(profile([[0.012, 0], [-0.03, 0], [-0.06, -0.1, -0.05, -0.05], [-0.025, -0.108], [0.008, -0.01]], 0.03), M.polymer, [0, 0.012, 0.018], null, null, g);
  part(box(0.006, 0.005, 0.05), M.polymer, [0, -0.02, -0.03], null, null, g);
  part(box(0.004, 0.018, 0.005), M.gunDark, [0, -0.008, -0.012], [0.3, 0, 0], null, g);
  const mag = new THREE.Group(); mag.position.set(0, -0.08, 0.02); mag.userData.noMerge = true; g.add(mag);
  part(box(0.022, 0.02, 0.05), M.polymer, [0, -0.02, -0.01], [0.25, 0, 0], null, mag);
  mergeByMaterial(mag, { shadows: false });
  mergeByMaterial(g, { shadows: false });
  g.userData = { muzzle: new THREE.Vector3(0, 0.045, -0.17), eject: new THREE.Vector3(0.02, 0.05, -0.05), sightY: 0.066, mag, magPos: mag.position.clone() };
  return g;
}

export function buildGrenade() {
  const g = new THREE.Group();
  part(new THREE.SphereGeometry(0.032, 14, 10), M.helmet, [0, 0, 0], null, [1, 1.2, 1], g);
  for (let i = 0; i < 4; i++) part(new THREE.TorusGeometry(0.033, 0.003, 4, 16), M.helmet, [0, -0.024 + i * 0.016, 0], [Math.PI / 2, 0, 0], [1, 1, 1], g);
  part(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 10), M.gunMetal, [0, 0.045, 0], null, null, g);
  part(box(0.01, 0.06, 0.004), M.gunMetal, [0.012, 0.025, 0], [0, 0, -0.25], null, g); // spoon
  part(new THREE.TorusGeometry(0.01, 0.0015, 4, 12), M.steel, [-0.018, 0.05, 0], [0, Math.PI / 2, 0], null, g);
  mergeByMaterial(g);
  return g;
}
