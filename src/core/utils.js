import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);

export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- value noise ------------------------------------------------------------
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
  return s;
}

// --- mesh helpers -------------------------------------------------------------
/** Create a mesh and place it. r = [rx,ry,rz], s = scalar or [sx,sy,sz]. */
export function part(geo, mat, pos = [0, 0, 0], r = null, s = null, parent = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s != null) Array.isArray(s) ? m.scale.set(s[0], s[1], s[2]) : m.scale.setScalar(s);
  if (parent) parent.add(m);
  return m;
}

const _up = new THREE.Vector3(0, 1, 0);
/** Capsule/cylinder spanning a→b (Vector3 in parent space). */
export function segment(a, b, radius, mat, parent, capsule = true, radial = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = capsule
    ? new THREE.CapsuleGeometry(radius, Math.max(0.001, len), 4, radial)
    : new THREE.CylinderGeometry(radius, radius, len, radial);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  if (parent) parent.add(m);
  return m;
}

/** Box-projected UVs from positions (after baking to world), so textures keep real-world scale. */
export function worldUV(geo, scale = 0.5) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function normalizeGeo(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  return g;
}

/**
 * Bake every mesh below `root` (stopping at objects flagged userData.noMerge)
 * into one mesh per material, expressed in root's local space.
 * Cuts draw calls from hundreds to a handful for static props.
 */
export function mergeByMaterial(root, { shadows = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (o === root) return;
    if (o.userData.noMerge) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.noMerge) return;
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
    const g = normalizeGeo(o.geometry);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (o.material.userData.worldUV) worldUV(g, o.material.userData.worldUV);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  // drop now-empty groups
  const empties = [];
  root.traverse((o) => { if (o !== root && !o.isMesh && o.children.length === 0 && !o.userData.noMerge && o.type === 'Group') empties.push(o); });
  for (const o of empties) o.removeFromParent();
  for (const [mat, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = shadows && !mat.transparent && !mat.userData.noShadow;
    mesh.receiveShadow = shadows;
    root.add(mesh);
  }
  return root;
}

/** Catmull-Rom interpolation over a sorted list of keys [{t, ...values}]. */
export function sampleKeys(keys, t, prop) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < t) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = clamp((t - k1.t) / (k2.t - k1.t), 0, 1);
  const p0 = k0[prop], p1 = k1[prop], p2 = k2[prop], p3 = k3[prop];
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Wait-until helper driven by the game loop (see Game.update). */
export class Waiters {
  constructor() { this.list = []; }
  until(pred) { return new Promise((res) => this.list.push({ pred, res })); }
  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].pred()) { this.list[i].res(); this.list.splice(i, 1); }
    }
  }
  clear() { this.list.length = 0; }
}
