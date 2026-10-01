// Procedural environment props. Every builder returns a Group positioned at the origin
// (ground level); callers place them and the level merges static ones by material.
import * as THREE from 'three';
import { M } from './materials.js';
import { part, mergeByMaterial, rng } from '../core/utils.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s);

function extrudeProfile(pts, width, bevel = 0.04, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // profile +x -> +Z (forward), width along X
  return g;
}

export function crate(size = 1, mat = M.crate) {
  const g = new THREE.Group();
  part(box(size, size, size), mat, [0, size / 2, 0], null, null, g);
  const t = 0.06 * size;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(box(t, size + 0.01, t), M.pole, [sx * (size / 2 - t / 2 + 0.01), size / 2, sz * (size / 2 - t / 2 + 0.01)], null, null, g);
  return g;
}

export function ammoCrate() {
  const g = new THREE.Group();
  part(box(0.9, 0.35, 0.45), M.helmet, [0, 0.175, 0], null, null, g);
  part(box(0.92, 0.06, 0.47), M.heliDark, [0, 0.33, 0], null, null, g);
  for (const x of [-0.3, 0.3]) part(box(0.08, 0.04, 0.1), M.steel, [x, 0.2, 0.235], null, null, g);
  return g;
}

export function barrel(mat = M.barrelBlue) {
  const g = new THREE.Group();
  part(cyl(0.3, 0.3, 0.9, 18), mat, [0, 0.45, 0], null, null, g);
  for (const y of [0.05, 0.3, 0.6, 0.85]) part(new THREE.TorusGeometry(0.3, 0.015, 4, 18), mat, [0, y, 0], [Math.PI / 2, 0, 0], null, g);
  part(cyl(0.04, 0.04, 0.03, 8), M.steel, [0.15, 0.91, 0], null, null, g);
  return g;
}

/** Stacked sandbag wall along +X. */
export function sandbags(len = 3, rows = 3, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(0.15, 0.36, 4, 10).rotateZ(Math.PI / 2);
  const n = Math.max(1, Math.round(len / 0.62));
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 0.31 : 0;
    const zs = row < rows - 1 || rows <= 2 ? [-0.18, 0.18] : [0];
    for (let i = 0; i < n - (row % 2); i++) for (const z of zs) {
      part(geo, M.sandbag, [-len / 2 + 0.31 + i * 0.62 + off + (r() - 0.5) * 0.04, 0.09 + row * 0.16, z],
        [(r() - 0.5) * 0.1, (r() - 0.5) * 0.15, (r() - 0.5) * 0.06], [1, 0.52, 0.95], g);
    }
  }
  return g;
}

export function jerseyBarrier() {
  const g = new THREE.Group();
  part(extrudeProfile([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.12, 0.3], [0.08, 0.82], [-0.08, 0.82], [-0.12, 0.3], [-0.3, 0.08]], 3.0, 0.02), M.concrete, [0, 0, 0], [0, Math.PI / 2, 0], null, g);
  return g;
}

/** Sedan: side profile extruded; windows are real holes so wrecks read as hollow. */
export function car({ burnt = false, paint = M.truckPaint } = {}) {
  const g = new THREE.Group();
  const mat = burnt ? M.burnt : paint;
  const body = [[-2.2, 0.32], [2.2, 0.32], [2.25, 0.62], [2.15, 0.85], [1.2, 0.92], [0.55, 1.38], [-0.9, 1.4], [-1.5, 0.98], [-2.2, 0.92], [-2.27, 0.6]];
  const win = [[0.45, 1.0], [0.7, 1.0], [0.45, 1.3], [-0.05, 1.31], [-0.05, 1.0]];
  const win2 = [[-0.15, 1.0], [-0.15, 1.31], [-0.82, 1.32], [-1.3, 1.0]];
  part(extrudeProfile(body, 1.72, 0.06, [win, win2]), mat, [0, 0, 0], null, null, g);
  if (!burnt) {
    part(box(1.6, 0.36, 0.02), M.carGlass, [0, 1.15, 0.87], [0.9, 0, 0], null, g);
    part(box(1.6, 0.3, 0.02), M.carGlass, [0, 1.2, -1.25], [-0.75, 0, 0], null, g);
    for (const x of [-0.6, 0.6]) part(cyl(0.09, 0.09, 0.04, 12), M.headlight, [x, 0.7, 2.25], [Math.PI / 2, 0, 0], null, g);
    part(box(1.7, 0.12, 0.08), M.chrome, [0, 0.4, 2.27], null, null, g);
  }
  part(box(1.55, 0.05, 3.6), M.heliDark, [0, 0.33, 0], null, null, g);
  for (const x of [-0.45, 0.45]) part(box(0.5, 0.5, 0.5), burnt ? M.burnt : M.canvasSeat, [x, 0.65, 0.2], null, null, g); // seats
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
    if (burnt && z < 0 && x > 0) { part(cyl(0.2, 0.2, 0.15, 12), M.burnt, [x, 0.2, z], [0, 0, Math.PI / 2], null, g); continue; }
    part(cyl(0.33, 0.33, 0.22, 18), burnt ? M.burnt : M.tire, [x, 0.33, z], [0, 0, Math.PI / 2], null, g);
    part(cyl(0.18, 0.18, 0.24, 10), M.steel, [x, 0.33, z], [0, 0, Math.PI / 2], null, g);
  }
  return g;
}

/** Pickup "technical" with a mounted heavy machine gun. Wheels exposed for animation. */
export function technical() {
  const g = new THREE.Group();
  const cab = [[-0.3, 0.45], [2.55, 0.45], [2.6, 0.75], [2.5, 1.02], [1.5, 1.1], [1.05, 1.72], [-0.35, 1.74], [-0.4, 0.95]];
  const w1 = [[0.95, 1.12], [0.95, 1.62], [0.1, 1.64], [0.1, 1.12]];
  part(extrudeProfile(cab, 1.8, 0.06, [w1]), M.truckPaint, [0, 0, 0.5], null, null, g);
  part(box(1.72, 0.4, 0.02), M.carGlass, [0, 1.4, 1.62], [0.62, 0, 0], null, g);
  // bed
  part(box(1.8, 0.1, 2.3), M.truckPaint, [0, 0.55, -1.05], null, null, g);
  for (const x of [-0.87, 0.87]) part(box(0.06, 0.5, 2.3), M.truckPaint, [x, 0.85, -1.05], null, null, g);
  part(box(1.8, 0.5, 0.06), M.truckPaint, [0, 0.85, -2.18], null, null, g);
  part(box(1.9, 0.18, 0.12), M.chrome, [0, 0.55, 3.12], null, null, g);
  for (const x of [-0.6, 0.6]) part(cyl(0.1, 0.1, 0.04, 12), M.headlight, [x, 0.85, 3.1], [Math.PI / 2, 0, 0], null, g);
  part(box(1.1, 0.35, 0.03), M.heliDark, [0, 0.8, 3.12], null, null, g); // grille
  part(box(1.6, 0.06, 5.2), M.heliDark, [0, 0.42, 0.4], null, null, g);
  // mounted HMG
  const mg = new THREE.Group(); mg.position.set(0, 1.55, -1.1); g.add(mg);
  part(cyl(0.05, 0.08, 1.0, 8), M.gunMetal, [0, -0.5, 0], null, null, mg);
  part(box(0.14, 0.16, 0.6), M.gunMetal, [0, 0.08, 0.05], null, null, mg);
  part(cyl(0.035, 0.035, 1.0, 10).rotateX(Math.PI / 2), M.gunMetal, [0, 0.1, 0.8], null, null, mg);
  part(cyl(0.055, 0.055, 0.14, 10).rotateX(Math.PI / 2), M.gunMetal, [0, 0.1, 1.28], null, null, mg);
  part(box(0.5, 0.45, 0.03), M.akMetal, [0, 0.18, 0.4], null, null, mg); // shield
  part(box(0.16, 0.16, 0.25), M.helmet, [0.15, 0.0, 0.05], null, null, mg);
  const wheels = [];
  for (const [x, z] of [[-0.88, 2.1], [0.88, 2.1], [-0.88, -1.3], [0.88, -1.3]]) {
    const w = new THREE.Group(); w.position.set(x, 0.4, z); w.userData.noMerge = true; g.add(w);
    part(cyl(0.4, 0.4, 0.26, 18), M.tire, [0, 0, 0], [0, 0, Math.PI / 2], null, w);
    part(cyl(0.22, 0.22, 0.28, 10), M.steel, [0, 0, 0], [0, 0, Math.PI / 2], null, w);
    wheels.push(w);
  }
  mergeByMaterial(g);
  g.userData.wheels = wheels;
  return g;
}

/** Date palm: curved segmented trunk + feathered fronds. */
export function palm(height = 7, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const lean = new THREE.Vector3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize();
  const segs = Math.round(height / 0.35);
  let p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const dir = new THREE.Vector3().lerpVectors(up, lean, t * t).normalize();
    const rad = 0.24 - t * 0.08;
    const m = part(cyl(rad * 0.92, rad * 1.05, 0.38, 10), M.palmTrunk, [0, 0, 0], null, null, g);
    m.position.copy(p).addScaledVector(dir, 0.17);
    m.quaternion.setFromUnitVectors(up, dir);
    p.addScaledVector(dir, 0.35);
  }
  const top = p.clone();
  part(new THREE.SphereGeometry(0.28, 10, 8), M.palmTrunk, [top.x, top.y, top.z], null, [1, 0.8, 1], g);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + r() * 0.3;
    const droop = i % 3 === 0 ? 0.2 : 0.55 + r() * 0.6;
    const dead = r() < 0.15;
    const f = frond(2.6 + r() * 1.2, droop, dead ? M.palmTrunk : M.palmLeaf, r);
    f.position.copy(top); f.rotation.y = yaw;
    g.add(f);
  }
  for (let i = 0; i < 6; i++) part(new THREE.SphereGeometry(0.07, 6, 5), M.fruitA, [top.x + (r() - 0.5) * 0.4, top.y - 0.3 - r() * 0.2, top.z + (r() - 0.5) * 0.4], null, null, g);
  return g;
}

function frond(len, droop, mat, r) {
  const pos = [];
  const N = 14;
  const spine = (t) => new THREE.Vector3(t * len, Math.sin(t * Math.PI * 0.6) * 0.6 * (1 - droop) - droop * t * t * len * 0.6, 0);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a = spine(t0), b = spine(t1);
    const w = Math.sin(t0 * Math.PI) * 0.55 + 0.05;
    for (const s of [-1, 1]) { // leaflets hanging down to each side
      const tip = new THREE.Vector3((a.x + b.x) / 2 + 0.1, a.y - w * 0.5, s * w);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    }
    pos.push(a.x, a.y - 0.02, 0, b.x, b.y - 0.02, 0, a.x, a.y + 0.02, 0); // rib
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  const grp = new THREE.Group(); grp.add(m);
  m.rotation.x = (r() - 0.5) * 0.4;
  return grp;
}

export function stall(awning = M.awning1, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  for (const [x, z] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) part(cyl(0.04, 0.04, z < 0 ? 2.5 : 2.2, 6), M.pole, [x, z < 0 ? 1.25 : 1.1, z], null, null, g);
  const cloth = new THREE.PlaneGeometry(3.1, 2.1, 10, 6);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -Math.sin(((p.getX(i) + 1.55) / 3.1) * Math.PI) * 0.08 - Math.sin(((p.getY(i) + 1.05) / 2.1) * Math.PI) * 0.1);
  cloth.computeVertexNormals();
  part(cloth, awning, [0, 2.38, 0], [-Math.PI / 2 + 0.14, 0, 0], null, g);
  part(box(2.6, 0.08, 1.0), M.crate, [0, 0.85, 0.35], null, null, g);
  for (const x of [-1.2, 1.2]) for (const z of [0, 0.7]) part(box(0.06, 0.85, 0.06), M.pole, [x, 0.42, z], null, null, g);
  const fruits = [M.fruitA, M.fruitB, M.fruitC];
  for (let c = 0; c < 3; c++) {
    const cx = -0.8 + c * 0.8;
    part(box(0.6, 0.18, 0.45), M.crate, [cx, 0.98, 0.35], null, null, g);
    const fm = fruits[Math.floor(r() * 3)];
    for (let i = 0; i < 10; i++) part(new THREE.SphereGeometry(0.06, 8, 6), fm, [cx + (r() - 0.5) * 0.45, 1.1 + r() * 0.05, 0.35 + (r() - 0.5) * 0.3], null, null, g);
  }
  for (let i = 0; i < 3; i++) part(box(0.5, 0.4, 0.4), M.crate, [-1 + i * 0.9, 0.2, -0.6], [0, r(), 0], null, g);
  return g;
}

export function waterTank() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) part(box(0.06, 1.0, 0.06), M.rust, [x, 0.5, z], null, null, g);
  part(cyl(0.65, 0.65, 1.2, 18), M.polymer, [0, 1.6, 0], null, null, g);
  part(cyl(0.2, 0.2, 0.1, 12), M.polymer, [0, 2.25, 0], null, null, g);
  return g;
}

export function dish() {
  const g = new THREE.Group();
  part(cyl(0.03, 0.03, 0.8, 6), M.steel, [0, 0.4, 0], null, null, g);
  part(new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, 0.6), M.plaster2, [0, 0.9, 0.1], [1.1, 0, 0], [1, 0.4, 1], g);
  part(cyl(0.01, 0.01, 0.5, 4), M.steel, [0, 1.05, 0.35], [1.1, 0, 0], null, g);
  return g;
}

export function acUnit() {
  const g = new THREE.Group();
  part(box(0.9, 0.6, 0.35), M.plaster2, [0, 0.3, 0], null, null, g);
  part(new THREE.CircleGeometry(0.22, 16), M.heliDark, [0.15, 0.3, 0.176], null, null, g);
  for (let i = 0; i < 5; i++) part(box(0.3, 0.02, 0.02), M.heliDark, [-0.25, 0.12 + i * 0.09, 0.18], null, null, g);
  return g;
}

export function well() {
  const g = new THREE.Group();
  const prof = [[1.0, 0], [1.2, 0], [1.2, 0.8], [1.1, 0.85], [1.0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  part(new THREE.LatheGeometry(prof, 24), M.plaster3, [0, 0, 0], null, null, g);
  part(new THREE.CircleGeometry(1.0, 24), M.water, [0, 0.45, 0], [-Math.PI / 2, 0, 0], null, g);
  for (const x of [-1.1, 1.1]) part(box(0.12, 2.2, 0.12), M.pole, [x, 1.1, 0], null, null, g);
  part(cyl(0.06, 0.06, 2.4, 8), M.pole, [0, 2.1, 0], [0, 0, Math.PI / 2], null, g);
  part(cyl(0.01, 0.01, 1.2, 4), M.rubber, [0, 1.5, 0], null, null, g);
  part(cyl(0.12, 0.1, 0.2, 10), M.rust, [0, 0.95, 0], null, null, g);
  return g;
}

export function tirePile(seed = 1) {
  const r = rng(seed); const g = new THREE.Group();
  for (let i = 0; i < 5; i++) part(new THREE.TorusGeometry(0.3, 0.11, 8, 16), M.tire, [(r() - 0.5) * 0.3, 0.1 + i * 0.2, (r() - 0.5) * 0.3], [Math.PI / 2, 0, r()], null, g);
  return g;
}

export function rubble(n = 12, spread = 1.5, seed = 1) {
  const r = rng(seed); const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = 0.1 + r() * 0.35;
    part(new THREE.DodecahedronGeometry(s, 0), M.rubble, [(r() - 0.5) * spread * 2, s * 0.4, (r() - 0.5) * spread * 2], [r() * 3, r() * 3, r() * 3], [1, 0.6, 1], g);
  }
  return g;
}

export function table(w = 1.6, d = 0.8) {
  const g = new THREE.Group();
  part(box(w, 0.05, d), M.crate, [0, 0.76, 0], null, null, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(box(0.05, 0.74, 0.05), M.pole, [sx * (w / 2 - 0.05), 0.37, sz * (d / 2 - 0.05)], null, null, g);
  return g;
}

export function chair() {
  const g = new THREE.Group();
  part(box(0.45, 0.04, 0.45), M.polymer, [0, 0.45, 0], null, null, g);
  part(box(0.45, 0.45, 0.04), M.polymer, [0, 0.7, -0.22], null, null, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(cyl(0.015, 0.015, 0.45, 6), M.steel, [sx * 0.2, 0.225, sz * 0.2], null, null, g);
  return g;
}

export function laptop() {
  const g = new THREE.Group();
  part(box(0.36, 0.02, 0.25), M.polymer, [0, 0.01, 0], null, null, g);
  part(box(0.36, 0.24, 0.015), M.polymer, [0, 0.13, -0.13], [-0.25, 0, 0], null, g);
  part(new THREE.PlaneGeometry(0.32, 0.2), M.screen, [0, 0.13, -0.12], [-0.25, 0, 0], null, g);
  return g;
}

export function powerPole() {
  const g = new THREE.Group();
  part(cyl(0.1, 0.13, 8, 8), M.pole, [0, 4, 0], null, null, g);
  part(box(1.6, 0.1, 0.1), M.pole, [0, 7.6, 0], null, null, g);
  for (const x of [-0.7, 0, 0.7]) part(cyl(0.04, 0.05, 0.14, 6), M.plaster2, [x, 7.72, 0], null, null, g);
  return g;
}

/** Sagging cable between two points (world space). */
export function wire(a, b, sag = 0.8) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 4), M.rubber);
}
