// Procedural utility helicopter (Black Hawk inspired). Hollow lofted hull so the
// cabin is a real interior: benches, bulkheads, cockpit with pilots, door guns.
// Local frame: forward -Z, up +Y, origin on the ground under the rotor mast.
import * as THREE from 'three';
import { M } from './materials.js';
import { part, mergeByMaterial, sampleKeys, clamp } from '../core/utils.js';
import { Soldier } from './soldier.js';

const HULL = [
  { t: -6.48, w: 0.02, h: 0.02, y: 1.25 },
  { t: -6.35, w: 0.45, h: 0.42, y: 1.28 },
  { t: -6.0, w: 0.78, h: 0.7, y: 1.38 },
  { t: -5.4, w: 1.02, h: 0.95, y: 1.52 },
  { t: -4.6, w: 1.15, h: 1.08, y: 1.62 },
  { t: -3.6, w: 1.2, h: 1.13, y: 1.64 },
  { t: -2.6, w: 1.22, h: 1.15, y: 1.64 },
  { t: 0.0, w: 1.24, h: 1.16, y: 1.64 },
  { t: 1.5, w: 1.2, h: 1.13, y: 1.66 },
  { t: 2.7, w: 0.92, h: 0.88, y: 1.86 },
  { t: 3.9, w: 0.52, h: 0.52, y: 2.16 },
  { t: 6.0, w: 0.33, h: 0.37, y: 2.3 },
  { t: 9.0, w: 0.25, h: 0.3, y: 2.42 },
  { t: 10.2, w: 0.2, h: 0.3, y: 2.52 },
  { t: 10.32, w: 0.02, h: 0.02, y: 2.55 },
];

function classify(x, y, z) {
  if (z > -2.45 && z < 0.35 && Math.abs(x) > 0.8 && y > 0.6 && y < 2.5) return null; // side doors
  if (z > -6.05 && z < -3.85 && y > 1.5) return 'glass'; // canopy
  if (z > -6.0 && z < -4.9 && y > 0.85 && y < 1.3 && Math.abs(x) > 0.25) return 'glass'; // chin windows
  return 'hull';
}

/** Loft super-ellipse rings through HULL keys; returns {hull, glass} geometries. */
function loftHull(rings = 70, seg = 40, n = 3.4) {
  const t0 = HULL[0].t, t1 = HULL[HULL.length - 1].t;
  const pos = [], uv = [];
  for (let i = 0; i <= rings; i++) {
    const t = t0 + (t1 - t0) * (i / rings);
    const w = Math.max(0.01, sampleKeys(HULL, t, 'w')), h = Math.max(0.01, sampleKeys(HULL, t, 'h')), yc = sampleKeys(HULL, t, 'y');
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), yc + h * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), t);
      uv.push(t / 2.5, (j / seg) * 3);
    }
  }
  const idx = { hull: [], glass: [] };
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    const pa = P(a), pd = P(d);
    const kind = classify((pa[0] + pd[0]) / 2, (pa[1] + pd[1]) / 2, (pa[2] + pd[2]) / 2);
    if (!kind) continue;
    idx[kind].push(a, b, c, b, d, c);
  }
  const make = (index) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals();
    return g;
  };
  return { hull: make(idx.hull), glass: make(idx.glass) };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 14) => new THREE.CylinderGeometry(r1, r2, h, s);

function wheel(parent, x, y, z, r = 0.33, w = 0.2) {
  part(cyl(r, r, w, 20), M.rubber, [x, y, z], [0, 0, Math.PI / 2], null, parent);
  part(cyl(r * 0.55, r * 0.55, w + 0.02, 14), M.heliDark, [x, y, z], [0, 0, Math.PI / 2], null, parent);
}

function strut(parent, a, b, r = 0.045, mat = M.heliDark) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = part(cyl(r, r, d.length(), 8), mat, [0, 0, 0], null, null, parent);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

function doorGun(parent, x, z, side) {
  const g = new THREE.Group(); g.position.set(x, 1.45, z); g.rotation.y = -side * Math.PI / 2 + side * 0.35; parent.add(g);
  part(cyl(0.025, 0.025, 0.5, 8), M.heliDark, [0, -0.25, 0], null, null, g); // pintle
  part(box(0.09, 0.1, 0.5), M.gunMetal, [0, 0.05, -0.15], null, null, g);
  part(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10).rotateX(Math.PI / 2), M.gunMetal, [0, 0.05, -0.58], null, null, g); // shroud
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8).rotateX(Math.PI / 2), M.gunDark, [0, 0.05, -0.9], null, null, g);
  part(box(0.14, 0.14, 0.2), M.heliDark, [0.12, -0.02, -0.1], null, null, g); // ammo can
  part(box(0.02, 0.1, 0.02), M.gunDark, [0.04, 0.03, 0.14], null, null, g);
  part(box(0.02, 0.1, 0.02), M.gunDark, [-0.04, 0.03, 0.14], null, null, g);
  return g;
}

function seatRow(parent, z, facing, xs) {
  const s = facing; // +1 faces +Z (rearward)
  for (const x of xs) {
    part(box(0.5, 0.05, 0.42), M.canvasSeat, [x, 1.05, z], null, null, parent);
    part(box(0.5, 0.58, 0.04), M.canvasSeat, [x, 1.4, z - s * 0.22], [-s * 0.08, 0, 0], null, parent);
    for (const dx of [-0.24, 0.24]) {
      part(cyl(0.015, 0.015, 0.44, 6), M.steel, [x + dx, 1.05, z], [Math.PI / 2, 0, 0], null, parent);
      part(cyl(0.015, 0.015, 0.45, 6), M.steel, [x + dx, 0.84, z + s * 0.19], null, null, parent);
    }
    // shoulder harness
    for (const dx of [-0.1, 0.1]) part(box(0.05, 0.5, 0.01), M.webbing, [x + dx, 1.4, z - s * 0.19], [-s * 0.08, 0, 0], null, parent);
  }
  part(cyl(0.02, 0.02, xs.length * 0.6 + 0.2, 6), M.steel, [0, 1.7, z - s * 0.24], [0, 0, Math.PI / 2], null, parent);
}

export class Helicopter {
  constructor({ withCrew = true } = {}) {
    this.root = new THREE.Group();
    const body = new THREE.Group(); this.body = body; this.root.add(body);
    const { hull, glass } = loftHull();
    part(hull, M.heli, [0, 0, 0], null, null, body);
    const inner = part(hull, M.heliInterior, [0, 0, 0], null, null, body);
    inner.material = M.heliInterior.userData.back ||= Object.assign(M.heliInterior.clone(), { side: THREE.BackSide });
    part(glass, M.heliGlass, [0, 0, 0], null, null, body);

    // --- canopy frame / details ------------------------------------------------
    for (const x of [-0.45, 0.45]) part(box(0.05, 0.05, 2.0), M.heliDark, [x, 2.62, -4.9], [-0.18, 0, 0], null, body);
    part(box(0.06, 0.95, 0.06), M.heliDark, [0, 2.17, -5.95], [-0.62, 0, 0], null, body); // center post
    part(box(0.05, 0.5, 0.05), M.heliDark, [0, 2.95, -4.3], [0.4, 0, 0], null, body); // wire cutter top
    part(box(0.05, 0.4, 0.05), M.heliDark, [0, 0.35, -5.6], [-0.3, 0, 0], null, body); // wire cutter chin
    part(cyl(0.012, 0.012, 0.5, 6), M.steel, [0.35, 1.5, -6.55], [Math.PI / 2, 0, 0], null, body); // pitot
    part(new THREE.SphereGeometry(0.16, 14, 10), M.heliDark, [0, 0.62, -5.4], null, null, body); // FLIR ball
    part(new THREE.SphereGeometry(0.08, 12, 8), M.carGlass, [0, 0.6, -5.53], null, null, body);

    // --- engines / transmission --------------------------------------------------
    part(new THREE.CapsuleGeometry(0.5, 1.4, 6, 16).rotateX(Math.PI / 2), M.heli, [0, 2.9, -0.9], null, [1.1, 0.6, 1], body);
    for (const x of [-0.62, 0.62]) {
      part(new THREE.CapsuleGeometry(0.36, 2.0, 6, 16).rotateX(Math.PI / 2), M.heli, [x, 2.95, 0.2], null, [0.95, 0.8, 1], body);
      part(new THREE.CircleGeometry(0.26, 16), M.heliDark, [x, 2.95, -1.18], [0, Math.PI, 0], null, body);
      part(cyl(0.2, 0.24, 0.6, 12).rotateX(Math.PI / 2), M.heliDark, [x * 1.15, 2.95, 1.6], [0, x * 0.5, 0], null, body); // exhaust
    }
    part(box(0.02, 0.35, 0.35), M.heliDark, [0, 2.95, 0.5], null, null, body);

    // --- rotor ---------------------------------------------------------------
    part(cyl(0.12, 0.14, 0.55, 12), M.heliDark, [0, 3.35, -0.9], null, null, body);
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 3.62, -0.9); this.rotor.userData.noMerge = true; body.add(this.rotor);
    part(cyl(0.34, 0.34, 0.16, 16), M.rotor, [0, 0, 0], null, null, this.rotor);
    part(cyl(0.1, 0.16, 0.25, 10), M.rotor, [0, 0.18, 0], null, null, this.rotor);
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Group(); bl.rotation.y = (i * Math.PI) / 2; this.rotor.add(bl);
      part(box(0.5, 0.12, 0.22), M.rotor, [0.5, 0, 0], null, null, bl);
      part(box(7.4, 0.045, 0.52), M.rotor, [4.4, 0, 0], [0.06, 0, 0], null, bl);
      part(box(0.4, 0.05, 0.52), M.helmet, [8.0, 0, 0], [0.06, 0, 0], null, bl); // painted tip
    }
    mergeByMaterial(this.rotor);
    this.rotorDisc = part(new THREE.CircleGeometry(8.2, 48).rotateX(-Math.PI / 2), M.rotorBlur, [0, 3.62, -0.9], null, null, body);
    this.rotorDisc.userData.noMerge = true;

    // --- tail -----------------------------------------------------------------
    const fin = new THREE.Shape();
    fin.moveTo(8.6, 2.35); fin.lineTo(10.35, 2.4); fin.lineTo(11.3, 4.6); fin.lineTo(10.6, 4.65); fin.lineTo(9.5, 2.85); fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    finGeo.rotateY(-Math.PI / 2); finGeo.translate(-0.06, 0, 0);
    part(finGeo, M.heli, [0, 0, 0], null, null, body);
    part(box(4.4, 0.06, 0.75), M.heli, [0, 2.48, 9.7], null, null, body); // stabilator
    this.tailRotor = new THREE.Group(); this.tailRotor.position.set(0.22, 3.95, 10.95); this.tailRotor.userData.noMerge = true; body.add(this.tailRotor);
    part(cyl(0.1, 0.1, 0.18, 10), M.rotor, [0, 0, 0], [0, 0, Math.PI / 2], null, this.tailRotor);
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Group(); bl.rotation.x = (i * Math.PI) / 2; this.tailRotor.add(bl);
      part(box(0.03, 1.55, 0.2), M.rotor, [0.05, 0.85, 0], null, null, bl);
    }
    mergeByMaterial(this.tailRotor);
    this.tailDisc = part(new THREE.CircleGeometry(1.65, 32).rotateY(Math.PI / 2), M.rotorBlur, [0.26, 3.95, 10.95], null, null, body);
    this.tailDisc.userData.noMerge = true;

    // --- landing gear ---------------------------------------------------------------
    for (const x of [-1.45, 1.45]) {
      wheel(body, x, 0.33, -3.45);
      strut(body, new THREE.Vector3(x, 0.33, -3.45), new THREE.Vector3(x * 0.78, 1.0, -3.1), 0.06);
      strut(body, new THREE.Vector3(x, 0.33, -3.45), new THREE.Vector3(x * 0.72, 0.62, -4.1), 0.04);
    }
    wheel(body, 0, 0.22, 7.6, 0.22, 0.14);
    strut(body, new THREE.Vector3(0, 0.22, 7.6), new THREE.Vector3(0, 2.0, 7.0), 0.05);

    // --- cabin interior ----------------------------------------------------------
    part(box(2.3, 0.1, 4.3), M.heliDark, [0, 0.58, -0.6], null, null, body); // cabin floor
    part(box(2.0, 0.1, 2.4), M.heliDark, [0, 0.66, -4.4], null, null, body); // cockpit floor
    for (let z = -2.4; z < 1.5; z += 0.35) part(box(2.2, 0.012, 0.03), M.steel, [0, 0.635, z], null, null, body); // tie-down rails
    part(box(2.2, 0.06, 4.1), M.heliInterior, [0, 2.66, -0.6], null, null, body); // headliner
    for (const x of [-0.5, 0.5]) part(cyl(0.025, 0.025, 4.1, 6), M.heliDark, [x, 2.58, -0.6], [Math.PI / 2, 0, 0], null, body); // conduits
    for (let z = -2.1; z < 1.2; z += 0.55) for (const x of [-0.75, 0.75]) // overhead grab handles
      part(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), M.webbing, [x, 2.56, z], [0, Math.PI / 2, Math.PI], null, body);
    part(box(2.3, 1.95, 0.06), M.heliInterior, [0, 1.6, 1.58], null, null, body); // rear bulkhead
    for (let i = 0; i < 6; i++) part(box(2.1, 0.02, 0.02), M.webbing, [0, 0.9 + i * 0.28, 1.53], null, null, body); // cargo net
    for (let i = 0; i < 8; i++) part(box(0.02, 1.6, 0.02), M.webbing, [-1.0 + i * 0.28, 1.65, 1.53], null, null, body);
    // front bulkhead with pass-through to the cockpit
    part(box(0.78, 1.95, 0.06), M.heliInterior, [0.78, 1.6, -2.62], null, null, body);
    part(box(0.78, 1.95, 0.06), M.heliInterior, [-0.78, 1.6, -2.62], null, null, body);
    part(box(0.8, 0.45, 0.06), M.heliInterior, [0, 2.42, -2.62], null, null, body);
    seatRow(body, 1.22, -1, [-0.9, -0.3, 0.3, 0.9]);
    seatRow(body, -2.32, 1, [-0.9, -0.3, 0.3, 0.9]);
    // door frames + sliding doors
    for (const s of [-1, 1]) {
      part(box(0.08, 1.9, 0.08), M.heliDark, [s * 1.2, 1.55, -2.45], null, null, body);
      part(box(0.08, 1.9, 0.08), M.heliDark, [s * 1.2, 1.55, 0.35], null, null, body);
      part(box(0.06, 0.06, 2.9), M.heliDark, [s * 1.22, 2.5, -1.05], null, null, body);
      part(box(0.05, 1.7, 1.5), M.heli, [s * 1.28, 1.6, 1.15], null, null, body);
      part(box(0.02, 0.4, 0.5), M.heliGlass, [s * 1.31, 1.95, 1.15], null, null, body);
      part(box(0.04, 0.04, 3.2), M.steel, [s * 1.28, 2.47, 0.3], null, null, body); // door rail
      part(box(0.5, 0.05, 0.3), M.heliDark, [s * 1.3, 0.52, -1.0], null, null, body); // step
      this['gun' + s] = doorGun(body, s * 1.08, -2.25, s);
    }
    // interior red lights
    for (const z of [-1.6, 0.6]) part(box(0.25, 0.03, 0.12), M.redLamp, [0, 2.62, z], null, null, body);
    const red = new THREE.PointLight(0xff2a1a, 1.1, 4.5, 1.8); red.position.set(0, 2.4, -0.5); body.add(red); red.userData.noMerge = true;
    this.cabinLight = red;

    // --- cockpit ---------------------------------------------------------------
    part(box(1.9, 0.45, 0.35), M.heliDark, [0, 1.42, -5.35], [-0.35, 0, 0], null, body); // instrument panel
    part(box(1.95, 0.08, 0.5), M.heliDark, [0, 1.66, -5.25], null, null, body); // glare shield
    for (const x of [-0.7, -0.3, 0.3, 0.7]) part(new THREE.PlaneGeometry(0.28, 0.24), M.mfd, [x, 1.44, -5.16], [-0.35, 0, 0], null, body);
    part(box(0.35, 0.35, 1.0), M.heliDark, [0, 0.95, -4.7], null, null, body); // center console
    for (const x of [-0.55, 0.55]) {
      part(box(0.55, 0.12, 0.55), M.heliDark, [x, 0.95, -4.25], null, null, body);
      part(box(0.55, 0.9, 0.12), M.heliDark, [x, 1.45, -3.95], [0.12, 0, 0], null, body);
      part(box(0.5, 0.08, 0.5), M.canvasSeat, [x, 1.03, -4.25], null, null, body);
      part(cyl(0.015, 0.015, 0.5, 6), M.heliDark, [x, 0.95, -4.7], [0.2, 0, 0], null, body); // cyclic
      part(new THREE.SphereGeometry(0.03, 8, 6), M.rubber, [x, 1.2, -4.75], null, null, body);
    }
    // nav / anti-collision lights
    part(new THREE.SphereGeometry(0.06, 8, 6), M.redLamp, [-1.25, 1.2, -3.4], null, null, body);
    part(new THREE.SphereGeometry(0.06, 8, 6), M.greenLamp, [1.25, 1.2, -3.4], null, null, body);
    this.beacon = part(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 }), [0, 4.66, 10.9], null, null, body);
    this.beacon.userData.noMerge = true;

    mergeByMaterial(body);

    // crew
    this.pilots = [];
    if (withCrew) {
      for (const x of [-0.55, 0.55]) {
        const p = new Soldier({ type: 'pilot', weapon: null, seed: 90 + x * 10 });
        p.pose = 'pilot';
        p.root.position.set(x, 0.55, -4.2);
        p.root.rotation.y = Math.PI; // face forward (-Z)
        body.add(p.root);
        this.pilots.push(p);
      }
    }
    this.rpm = 1; this.time = 0;
    this.root.traverse((o) => { if (o.isMesh && o.material === M.heliGlass) o.renderOrder = 2; });
  }

  update(dt) {
    this.time += dt;
    const rpm = this.rpm;
    this.rotor.rotation.y += dt * rpm * 9;
    this.tailRotor.rotation.x += dt * rpm * 40;
    this.rotorDisc.visible = this.tailDisc.visible = rpm > 0.4;
    this.rotorDisc.material.opacity = 0.16 * clamp(rpm, 0, 1);
    this.beacon.visible = (this.time % 1.2) < 0.12;
    for (const p of this.pilots) {
      const pos = p.root.position;
      p.ik.R = this.body.localToWorld(_v.set(pos.x + 0.02, 1.2, -4.72));
      p.ik.L = this.body.localToWorld(_w.set(pos.x + (pos.x > 0 ? 0.28 : 0.28), 1.02, -4.2));
      p.update(dt);
    }
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
