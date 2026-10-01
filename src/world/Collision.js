// Axis-aligned box world used for movement, bullets and line-of-sight.
import * as THREE from 'three';

export class CollisionWorld {
  constructor() { this.boxes = []; }

  add(minX, minY, minZ, maxX, maxY, maxZ) {
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    this.boxes.push(b);
    return b;
  }

  /** Box centered at (x,z) on the ground, rotated boxes are approximated by their AABB. */
  addFoot(x, z, w, d, h, y = 0, rot = 0) {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    return this.add(x - hw, y, z - hd, x + hw, y + h, z + hd);
  }

  remove(b) { const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1); }

  // ponytail: linear scan over ~400 boxes; add a uniform grid if box count grows 10x
  /** Ray vs all boxes (slab test). Returns distance or Infinity; fills outNormal. */
  raycast(o, d, maxDist = 1000, outNormal = null) {
    let best = maxDist, bestBox = null, bestAxis = 0, bestSign = 1;
    for (const b of this.boxes) {
      let tmin = 0, tmax = best, axis = -1, sign = 1;
      for (let a = 0; a < 3; a++) {
        const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
        const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
        const mn = a === 0 ? b.min.x : a === 1 ? b.min.y : b.min.z;
        const mx = a === 0 ? b.max.x : a === 1 ? b.max.y : b.max.z;
        if (Math.abs(da) < 1e-9) { if (oa < mn || oa > mx) { tmin = Infinity; break; } continue; }
        let t1 = (mn - oa) / da, t2 = (mx - oa) / da, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { tmin = Infinity; break; }
      }
      if (tmin < best && axis >= 0) { best = tmin; bestBox = b; bestAxis = axis; bestSign = sign; }
    }
    if (outNormal && bestBox) outNormal.set(0, 0, 0).setComponent(bestAxis, bestSign);
    return bestBox ? best : Infinity;
  }

  lineOfSight(a, b) {
    _d.subVectors(b, a); const len = _d.length(); _d.divideScalar(len);
    return this.raycast(a, _d, len) >= len - 0.05;
  }

  /** Highest walkable surface under a circle, considering surfaces up to `step` above feet. */
  groundAt(x, z, r, feetY, step = 0.45) {
    let g = 0;
    for (const b of this.boxes) {
      if (b.max.y > feetY + step || b.max.y <= g) continue;
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) g = b.max.y;
    }
    return g;
  }

  /** Push a vertical cylinder (feet at pos.y) out of boxes on XZ. Mutates pos. */
  resolve(pos, r, height, step = 0.45) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.max.y <= pos.y + step || b.min.y >= pos.y + height) continue;
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else { // center inside the box: exit via the nearest face
          const exits = [pos.x - b.min.x, b.max.x - pos.x, pos.z - b.min.z, b.max.z - pos.z];
          const m = Math.min(...exits), i = exits.indexOf(m);
          if (i === 0) pos.x = b.min.x - r; else if (i === 1) pos.x = b.max.x + r;
          else if (i === 2) pos.z = b.min.z - r; else pos.z = b.max.z + r;
        }
      }
    }
    return pos;
  }
}
const _d = new THREE.Vector3();
