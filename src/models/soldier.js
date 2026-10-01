// Procedural articulated soldier: rigid-skinned (1 bone per part) so each soldier
// costs only one draw call per material, animated procedurally + 2-bone arm IK.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from './materials.js';
import { buildAK, buildM4 } from './weapons.js';
import { clamp, damp, rng } from '../core/utils.js';

const UPPER = 0.3, FORE = 0.27, THIGH = 0.44, SHIN = 0.42;
const DOWN = new THREE.Vector3(0, -1, 0);

// soft-edged boxes read as fabric/gear instead of hard blocks
const B = (w, h, d) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3);
const S = (r, ws = 16, hs = 12, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);
const C = (r, len, rs = 12) => new THREE.CapsuleGeometry(r, len, 4, rs);
const Cy = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);

// Gun templates are built once and cloned (clones share geometry).
const gunCache = {};
function npcGun(kind) {
  if (!gunCache[kind]) {
    const g = kind === 'ak' ? buildAK() : buildM4();
    const info = { muzzle: g.userData.muzzle.clone() };
    g.userData = {};
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.userData = {}; } });
    gunCache[kind] = { g, info };
  }
  const c = gunCache[kind];
  const clone = c.g.clone();
  clone.userData.muzzle = c.info.muzzle;
  return clone;
}

const hitMat = new THREE.MeshBasicMaterial();

export class Soldier {
  /**
   * @param {object} o
   * @param {'friendly'|'captain'|'enemy'|'pilot'} o.type
   * @param {'m4'|'ak'|null} o.weapon
   */
  constructor({ type = 'friendly', weapon = 'm4', seed = 1 } = {}) {
    this.type = type;
    this.r = rng(seed);
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // feet pivot, used for death falls
    this.root.add(this.pivot);
    this.parts = [];
    this.hitboxes = [];
    this.buildSkeleton();
    this.buildBody();
    this.bake();
    if (weapon) this.attachWeapon(weapon);

    // animation state
    this.speed = 0; this.phase = 0; this.crouch = 0; this.crouchTarget = 0;
    this.pose = 'stand'; // stand | sit | pilot
    this.carry = weapon ? 'aim' : 'none'; // aim | low | none
    this.carryBlend = 1;
    this.aimPitch = 0; this.headYaw = 0; this.headPitch = 0;
    this.ik = { L: null, R: null };
    this.dead = false; this.deathT = 0; this.fallDir = -1;
    this.recoil = 0;
    this.time = this.r() * 10;
  }

  buildSkeleton() {
    const bone = (name, parent, x, y, z) => {
      const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
      (parent || this.pivot).add(b); this.bones.push(b); this.b[name] = b; return b;
    };
    this.bones = []; this.b = {};
    const hips = bone('hips', null, 0, 0.98, 0);
    const spine = bone('spine', hips, 0, 0.1, 0);
    const chest = bone('chest', spine, 0, 0.18, 0);
    const neck = bone('neck', chest, 0, 0.25, 0);
    bone('head', neck, 0, 0.07, 0.01);
    for (const [s, x] of [['L', 1], ['R', -1]]) {
      const ua = bone('upperArm' + s, chest, 0.2 * x, 0.19, -0.01);
      const fa = bone('foreArm' + s, ua, 0, -UPPER, 0);
      bone('hand' + s, fa, 0, -FORE, 0);
      const th = bone('thigh' + s, hips, 0.1 * x, -0.06, 0);
      const sh = bone('shin' + s, th, 0, -THIGH, 0);
      bone('foot' + s, sh, 0, -SHIN, 0);
    }
    // relaxed A-pose for the arms at bind time
    this.b.upperArmL.rotation.z = 0.12; this.b.upperArmR.rotation.z = -0.12;
  }

  add(bone, geo, mat, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scl) Array.isArray(scl) ? m.scale.set(...scl) : m.scale.setScalar(scl);
    this.b[bone].add(m);
    this.parts.push(m);
    return m;
  }

  hitbox(bone, geo, pos, zone) {
    const m = new THREE.Mesh(geo, hitMat);
    m.position.set(...pos);
    m.layers.set(1); // never rendered, only raycast
    m.userData = { soldier: this, zone };
    this.b[bone].add(m);
    this.hitboxes.push(m);
  }

  buildBody() {
    const t = this.type, r = this.r;
    const friendly = t === 'friendly' || t === 'captain';
    const cloth = friendly ? M.camoFriendly : t === 'pilot' ? M.pilotSuit : [M.enemyShirt, M.enemyShirt2, M.camoEnemy][Math.floor(r() * 3)];
    const pants = friendly ? M.camoFriendly : t === 'pilot' ? M.pilotSuit : [M.camoEnemy, M.enemyShirt2, M.enemyShirt][Math.floor(r() * 3)];
    const skin = friendly || t === 'pilot' ? [M.skin1, M.skin3, M.skin2, M.skin4][Math.floor(r() * 4)] : [M.skin1, M.skin2, M.skin4][Math.floor(r() * 3)];
    const boot = friendly || t === 'pilot' ? M.boot : M.bootDark;
    const vest = friendly ? M.vest : M.webbing;
    this.skin = skin;

    // --- torso -------------------------------------------------------------
    this.add('hips', C(0.12, 0.13), pants, [0, -0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.85]);
    this.add('hips', Cy(0.168, 0.168, 0.05, 16), M.webbing, [0, 0.06, 0], null, [1.05, 1, 0.78]); // belt
    this.add('hips', B(0.05, 0.03, 0.02), M.steel, [0, 0.06, 0.126]); // buckle
    this.add('spine', C(0.132, 0.07), cloth, [0, 0.06, 0], null, [1.15, 1, 0.78]);
    this.add('chest', C(0.15, 0.1), cloth, [0, 0.11, 0], null, [1.22, 1, 0.76]);
    this.add('chest', S(0.075, 12, 10), cloth, [0.17, 0.2, 0], null, [1, 0.8, 1]);
    this.add('chest', S(0.075, 12, 10), cloth, [-0.17, 0.2, 0], null, [1, 0.8, 1]);
    this.add('neck', Cy(0.05, 0.055, 0.1), skin, [0, 0.03, 0]);
    if (friendly || t === 'pilot') this.add('neck', Cy(0.062, 0.07, 0.05, 14), cloth, [0, -0.01, 0]); // collar

    if (friendly) {
      this.add('chest', B(0.33, 0.31, 0.05), vest, [0, 0.11, 0.115], [0.05, 0, 0]);
      this.add('chest', B(0.33, 0.31, 0.05), vest, [0, 0.11, -0.115]);
      for (const x of [1, -1]) {
        this.add('chest', B(0.04, 0.18, 0.2), vest, [0.175 * x, 0.04, 0]);
        this.add('chest', B(0.07, 0.025, 0.26), vest, [0.1 * x, 0.265, 0]);
      }
      for (let i = -1; i <= 1; i++) {
        this.add('chest', B(0.078, 0.1, 0.05), M.vest, [i * 0.085, 0.01, 0.165]);
        this.add('chest', B(0.08, 0.03, 0.055), M.webbing, [i * 0.085, 0.065, 0.167]);
      }
      this.add('chest', B(0.16, 0.08, 0.035), M.webbing, [0, 0.19, 0.155]); // admin pouch
      this.add('chest', B(0.06, 0.12, 0.045), M.vestDark, [0.12, 0.2, -0.16]); // radio
      this.add('chest', Cy(0.004, 0.004, 0.35, 4), M.polymer, [0.14, 0.42, -0.17], [0.15, 0, -0.1]);
      if (t === 'friendly') {
        this.add('chest', B(0.28, 0.32, 0.13), M.vestDark, [0, 0.08, -0.22]); // assault pack
        this.add('chest', C(0.065, 0.15), M.vestDark, [0, 0.24, -0.22], [0, 0, Math.PI / 2]);
        this.add('chest', B(0.2, 0.12, 0.04), M.webbing, [0, 0.0, -0.3]);
      }
    } else if (t === 'enemy') {
      this.add('chest', B(0.3, 0.13, 0.05), vest, [0, 0.0, 0.125]);
      for (let i = 0; i < 4; i++) this.add('chest', B(0.06, 0.12, 0.05), vest, [-0.105 + i * 0.07, 0.01, 0.16], [0.05, 0, 0]);
      this.add('chest', B(0.04, 0.34, 0.02), vest, [0.07, 0.16, 0.13], [0, 0, 0.5]);
      this.add('chest', B(0.04, 0.34, 0.02), vest, [-0.07, 0.16, 0.13], [0, 0, -0.5]);
      if (r() < 0.4) this.add('hips', B(0.1, 0.12, 0.08), M.webbing, [0.16, -0.02, 0.05]); // grenade bag
    } else { // pilot survival vest
      this.add('chest', B(0.32, 0.24, 0.04), M.vestDark, [0, 0.08, 0.12]);
      this.add('chest', B(0.1, 0.08, 0.04), M.webbing, [0.08, 0.04, 0.145]);
    }

    // --- head ----------------------------------------------------------------
    this.buildHead(skin, friendly, t);

    // --- arms ---------------------------------------------------------------
    for (const s of ['L', 'R']) {
      const x = s === 'L' ? 1 : -1;
      this.add('upperArm' + s, S(0.066, 12, 10), cloth, [0, -0.03, 0]);
      this.add('upperArm' + s, C(0.056, 0.18), cloth, [0, -0.15, 0]);
      if (friendly) this.add('upperArm' + s, B(0.02, 0.06, 0.07), M.webbing, [0.055 * x, -0.08, 0]); // patch
      this.add('foreArm' + s, S(0.052, 10, 8), cloth, [0, 0, 0]);
      this.add('foreArm' + s, C(0.048, 0.16, 10), cloth, [0, -0.12, 0], null, [1, 1, 0.9]);
      const gl = t === 'enemy' && r() < 0.6 ? skin : M.glove;
      this.add('foreArm' + s, Cy(0.043, 0.04, 0.05, 10), gl, [0, -0.235, 0]);
      this.add('hand' + s, B(0.075, 0.085, 0.035), gl, [0, -0.045, 0]);
      this.add('hand' + s, B(0.07, 0.055, 0.03), gl, [0, -0.1, 0.012], [0.55, 0, 0]);
      this.add('hand' + s, C(0.012, 0.035, 6), gl, [0.04 * x, -0.045, 0.02], [0.3, 0, 0.4 * x]);
    }

    // --- legs ---------------------------------------------------------------
    for (const s of ['L', 'R']) {
      const x = s === 'L' ? 1 : -1;
      this.add('thigh' + s, C(0.088, 0.26), pants, [0, -0.2, 0]);
      this.add('thigh' + s, B(0.04, 0.12, 0.1), pants, [0.085 * x, -0.24, 0.0]); // cargo pocket
      if (friendly && s === 'R') {
        this.add('thigh' + s, B(0.05, 0.14, 0.09), M.polymer, [-0.1, -0.12, 0.0]); // holster
        this.add('thigh' + s, B(0.045, 0.04, 0.06), M.gunDark, [-0.1, -0.03, 0.01]);
      }
      this.add('shin' + s, S(0.068, 10, 8), pants, [0, 0, 0]);
      this.add('shin' + s, C(0.064, 0.28, 10), pants, [0, -0.19, 0]);
      if (friendly) this.add('shin' + s, B(0.095, 0.11, 0.05), M.vestDark, [0, -0.01, 0.07]);
      this.add('shin' + s, Cy(0.066, 0.06, 0.12, 12), boot, [0, -0.36, 0]);
      this.add('foot' + s, B(0.1, 0.085, 0.2), boot, [0, -0.02, 0.04]);
      this.add('foot' + s, S(0.052, 12, 8), boot, [0, -0.03, 0.13], null, [1, 0.8, 1]);
      this.add('foot' + s, B(0.108, 0.022, 0.27), M.sole, [0, -0.07, 0.05]);
    }

    // --- hitboxes -------------------------------------------------------------
    this.hitbox('head', S(0.13, 8, 6), [0, 0.1, 0.01], 'head');
    this.hitbox('chest', B(0.44, 0.36, 0.34), [0, 0.1, 0], 'body');
    this.hitbox('spine', B(0.36, 0.2, 0.3), [0, 0.05, 0], 'body');
    this.hitbox('hips', B(0.38, 0.2, 0.28), [0, -0.02, 0], 'body');
    for (const s of ['L', 'R']) {
      this.hitbox('thigh' + s, B(0.18, 0.46, 0.18), [0, -0.22, 0], 'limb');
      this.hitbox('shin' + s, B(0.14, 0.44, 0.16), [0, -0.21, 0], 'limb');
      this.hitbox('upperArm' + s, B(0.13, 0.3, 0.13), [0, -0.14, 0], 'limb');
    }
  }

  buildHead(skin, friendly, t) {
    const r = this.r;
    // face
    this.add('head', S(0.1, 20, 16), skin, [0, 0.1, 0], null, [0.92, 1.1, 1]);
    this.add('head', S(0.078, 16, 12), skin, [0, 0.035, 0.03], null, [0.95, 0.8, 1]);
    this.add('head', B(0.024, 0.045, 0.03), skin, [0, 0.085, 0.1], [-0.35, 0, 0]); // nose
    this.add('head', S(0.013, 8, 6), skin, [0, 0.066, 0.108]); // nose tip
    this.add('head', B(0.13, 0.02, 0.03), skin, [0, 0.12, 0.085]); // brow
    for (const x of [1, -1]) {
      this.add('head', S(0.026, 10, 8), skin, [0.092 * x, 0.09, 0], null, [0.45, 1, 0.75]); // ear
      this.add('head', S(0.0135, 10, 8), M.eyeWhite, [0.036 * x, 0.1, 0.083]);
      this.add('head', S(0.0072, 8, 6), M.eyeIris, [0.036 * x, 0.1, 0.095]);
      this.add('head', B(0.035, 0.008, 0.012), M.hair, [0.036 * x, 0.125, 0.098], [0, 0, -0.12 * x]);
    }
    this.add('head', B(0.042, 0.009, 0.012), M.lips, [0, 0.043, 0.1]);

    if (t === 'captain') {
      this.add('head', S(0.083, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M.hair, [0, 0.055, 0.02], null, [0.98, 1, 1.02]); // beard
      this.add('head', B(0.05, 0.012, 0.02), M.hair, [0, 0.055, 0.103]); // moustache
      this.add('head', S(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M.cap, [0, 0.105, -0.005]); // cap
      this.add('head', B(0.14, 0.012, 0.1), M.cap, [0, 0.155, 0.11], [-0.18, 0, 0]); // brim
      this.add('head', Cy(0.042, 0.042, 0.035, 14), M.nvg, [0.105, 0.09, 0], [0, 0, Math.PI / 2]); // headset
      this.add('head', B(0.012, 0.03, 0.2), M.nvg, [0.02, 0.215, 0], [0, 0, 0.1]);
      this.add('head', B(0.075, 0.022, 0.01), M.visor, [0.037, 0.1, 0.1]); // sunglasses
      this.add('head', B(0.075, 0.022, 0.01), M.visor, [-0.037, 0.1, 0.1]);
    } else if (t === 'friendly') {
      this.add('head', S(0.128, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.helmet, [0, 0.1, -0.005], [-0.12, 0, 0], [1, 0.95, 1.08]);
      for (const x of [1, -1]) {
        this.add('head', B(0.012, 0.028, 0.13), M.nvg, [0.126 * x, 0.12, 0]);
        this.add('head', Cy(0.042, 0.042, 0.04, 14), M.nvg, [0.105 * x, 0.085, 0], [0, 0, Math.PI / 2]);
      }
      this.add('head', B(0.05, 0.035, 0.03), M.nvg, [0, 0.19, 0.12], [-0.4, 0, 0]); // NVG mount
      for (const x of [1, -1]) this.add('head', Cy(0.017, 0.017, 0.07, 10), M.nvg, [0.022 * x, 0.23, 0.12], [-1.2, 0, 0]);
      this.add('head', B(0.07, 0.05, 0.035), M.nvg, [0, 0.19, -0.135], [0.4, 0, 0]); // counterweight
      if (r() < 0.5) this.add('head', B(0.14, 0.035, 0.02), M.visor, [0, 0.1, 0.103]); // ballistic glasses
      if (r() < 0.4) this.add('head', S(0.082, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.hair, [0, 0.05, 0.02], null, [0.98, 0.9, 1.02]);
    } else if (t === 'pilot') {
      this.add('head', S(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.pilotHelmet, [0, 0.1, -0.01], null, [1, 1.05, 1.1]);
      this.add('head', S(0.137, 22, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.38, Math.PI * 0.16), M.visor, [0, 0.1, 0]);
      this.add('head', Cy(0.008, 0.008, 0.1, 6), M.nvg, [0.06, 0.03, 0.09], [1.2, 0, 0.5]); // boom mic
    } else { // insurgent headwear
      const v = r();
      if (v < 0.45) {
        this.add('head', S(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), M.shemagh, [0, 0.1, 0], null, [1, 1.05, 1.03]);
        this.add('head', S(0.104, 18, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), M.shemagh, [0, 0.1, 0.004], null, [0.97, 1.05, 1.06]);
        this.add('head', B(0.14, 0.18, 0.02), M.shemagh, [0, 0.0, -0.1], [0.2, 0, 0]);
      } else if (v < 0.8) {
        this.add('head', S(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.43), M.balaclava, [0, 0.1, 0], null, [0.95, 1.1, 1.03]);
        this.add('head', S(0.104, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M.balaclava, [0, 0.1, 0.003], null, [0.96, 1.1, 1.06]);
      } else {
        this.add('head', S(0.083, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M.hair, [0, 0.055, 0.02]);
        this.add('head', S(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M.cap, [0, 0.105, -0.005]);
        this.add('head', B(0.14, 0.012, 0.1), M.cap, [0, 0.155, 0.11], [-0.18, 0, 0]);
      }
    }
  }

  /** Merge all parts into one SkinnedMesh per material with rigid 1-bone weights. */
  bake() {
    this.root.updateMatrixWorld(true);
    const buckets = new Map();
    const boneIndex = new Map(this.bones.map((b, i) => [b, i]));
    for (const m of this.parts) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      const n = g.attributes.position.count, bi = boneIndex.get(m.parent);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (!buckets.has(m.material)) buckets.set(m.material, []);
      buckets.get(m.material).push(g);
      m.removeFromParent();
    }
    this.skeleton = new THREE.Skeleton(this.bones);
    this.meshes = [];
    for (const [mat, geos] of buckets) {
      const sm = new THREE.SkinnedMesh(mergeGeometries(geos), mat);
      sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false;
      this.root.add(sm);
      sm.bind(this.skeleton);
      this.meshes.push(sm);
    }
    this.parts = null;
  }

  attachWeapon(kind) {
    this.gun = npcGun(kind);
    this.gun.rotation.y = Math.PI; // muzzle to +Z (soldier forward)
    this.b.chest.add(this.gun);
    this.gunKind = kind;
    // grip points in gun space
    this.gripR = new THREE.Vector3(0, -0.045, 0.035);
    this.gripL = kind === 'ak' ? new THREE.Vector3(0, -0.005, -0.3) : new THREE.Vector3(0, -0.04, -0.28);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.gun) return this.b.head.getWorldPosition(out);
    return this.gun.localToWorld(out.copy(this.gun.userData.muzzle));
  }
  headWorld(out = new THREE.Vector3()) { return this.b.head.localToWorld(out.set(0, 0.1, 0)); }

  die(fromDir) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0;
    this.fallDir = this.r() < 0.7 ? -1 : 1;
    this.fallTwist = (this.r() - 0.5) * 0.8;
  }

  update(dt) {
    this.time += dt;
    const b = this.b, t = this.time;
    // reset limbs each frame (procedural animation writes absolute rotations)
    for (const bn of this.bones) bn.rotation.set(0, 0, 0);
    b.upperArmL.rotation.z = 0.12; b.upperArmR.rotation.z = -0.12;
    b.hips.position.y = 0.98;

    if (this.dead) return this.animateDeath(dt);

    this.crouch = damp(this.crouch, this.crouchTarget, 8, dt);
    const sp = this.speed;
    this.phase += dt * (sp > 0.1 ? 2.2 + sp * 1.3 : 0);
    const walk = clamp(sp / 1.5, 0, 1);
    const run = clamp((sp - 2.5) / 2, 0, 1);

    if (this.pose === 'sit' || this.pose === 'pilot') {
      b.hips.position.y = 0.52;
      for (const s of ['L', 'R']) {
        const x = s === 'L' ? 1 : -1;
        b['thigh' + s].rotation.set(-1.5, 0, 0.1 * x);
        b['shin' + s].rotation.x = 1.45 + (this.pose === 'pilot' ? -0.3 : 0);
        b['foot' + s].rotation.x = 0.05;
      }
      b.spine.rotation.x = 0.08 + Math.sin(t * 1.3) * 0.015;
      b.chest.rotation.x = 0.05;
    } else {
      const ph = this.phase, A = 0.45 * walk + 0.25 * run;
      const cr = this.crouch;
      for (const [s, off] of [['L', 0], ['R', Math.PI]]) {
        const p = ph + off;
        const swing = Math.sin(p) * A;
        const knee = Math.max(0, Math.sin(p + 1.4)) * (0.9 * walk + 0.5 * run);
        b['thigh' + s].rotation.x = -swing - cr * 1.05;
        b['shin' + s].rotation.x = knee + cr * 1.7;
        b['foot' + s].rotation.x = -cr * 0.65 + Math.max(0, -Math.sin(p)) * 0.2 * walk;
      }
      b.hips.position.y = 0.98 - cr * 0.36 - Math.abs(Math.sin(ph)) * 0.035 * walk + Math.cos(ph * 2) * 0.01 * walk;
      b.hips.rotation.y = Math.sin(ph) * 0.1 * walk;
      b.spine.rotation.y = -Math.sin(ph) * 0.08 * walk;
      b.spine.rotation.x = 0.06 + cr * 0.3 + run * 0.15 + Math.sin(t * 1.5) * 0.01;
      b.chest.rotation.x = -cr * 0.2;
    }
    // aiming: chest pitches toward the target, head counters so the eyes stay on it
    const carry = this.carry;
    this.carryBlend = damp(this.carryBlend, carry === 'aim' ? 1 : 0, 6, dt);
    const ab = this.carryBlend;
    // bladed stance: twist chest so the support shoulder comes forward
    const twist = -0.45 * ab;
    b.spine.rotation.y += twist;
    b.chest.rotation.x += -this.aimPitch * ab * 0.8;
    b.neck.rotation.x = -this.aimPitch * 0.2 - this.headPitch;
    b.head.rotation.y = this.headYaw;
    b.head.rotation.x = Math.sin(t * 0.7) * 0.03;

    if (this.gun) {
      this.recoil = damp(this.recoil, 0, 18, dt);
      // aim position given in the untwisted frame, rotated into the twisted chest frame
      const az = 0.3 - this.recoil * 0.06, ax = -0.1;
      const aimPos = [ax * Math.cos(-twist) + az * Math.sin(-twist), 0.16, -ax * Math.sin(-twist) + az * Math.cos(-twist)];
      const lowPos = [-0.05, 0.02, 0.36];
      const g = this.gun;
      if (this.pose === 'sit') {
        g.position.set(0, -0.18, 0.4); g.rotation.set(-1.25, Math.PI, 0);
      } else {
        g.position.set(...aimPos.map((v, i) => v * ab + lowPos[i] * (1 - ab)));
        g.rotation.set(0.65 * (1 - ab) - this.recoil * 0.25, Math.PI + 0.5 * (1 - ab) - twist, 0.3 * (1 - ab));
      }
    }
    this.root.updateMatrixWorld(true);
    this.solveArms();
  }

  animateDeath(dt) {
    this.deathT = Math.min(1, this.deathT + dt * 1.6);
    const e = this.deathT < 1 ? 1 - Math.pow(1 - this.deathT, 3) : 1;
    const b = this.b;
    this.pivot.rotation.x = this.fallDir * e * Math.PI * 0.5;
    this.pivot.rotation.z = this.fallTwist * e;
    this.pivot.position.y = e * 0.13;
    const buckle = Math.sin(this.deathT * Math.PI) * 0.8;
    for (const s of ['L', 'R']) {
      const x = s === 'L' ? 1 : -1;
      b['thigh' + s].rotation.x = -buckle * 0.8;
      b['shin' + s].rotation.x = buckle + 0.2;
      b['upperArm' + s].rotation.set(0.3 * this.fallDir, 0, x * (0.2 + e * 1.1));
      b['foreArm' + s].rotation.x = -0.4;
    }
    b.neck.rotation.x = -0.3 * this.fallDir * e;
    if (this.gun) { this.gun.position.set(-0.3, 0.1, 0.3); this.gun.rotation.set(0.2, 2.4, 1.4); }
  }

  /** Analytic two-bone IK: put each hand on its grip (or override target). */
  solveArms() {
    for (const s of ['L', 'R']) {
      let target = this.ik[s];
      if (!target) {
        if (!this.gun) continue;
        target = this.gun.localToWorld(_t.copy(s === 'R' ? this.gripR : this.gripL));
      }
      const x = s === 'L' ? 1 : -1;
      const pole = this.b.chest.localToWorld(_p.set(0.55 * x, -0.5, -0.15));
      solveTwoBone(this.b['upperArm' + s], this.b['foreArm' + s], target, pole);
    }
  }
}

const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Vector3();
const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _pd = new THREE.Vector3(), _l = new THREE.Vector3();

function solveTwoBone(upper, fore, target, pole) {
  upper.getWorldPosition(_s);
  _d.subVectors(target, _s);
  const dist = clamp(_d.length(), 0.05, UPPER + FORE - 0.002);
  _d.normalize();
  const cosA = clamp((UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _pd.subVectors(pole, _s);
  _pd.addScaledVector(_d, -_pd.dot(_d)).normalize();
  _e.copy(_s).addScaledVector(_d, UPPER * cosA).addScaledVector(_pd, UPPER * sinA);
  aimBone(upper, _l.subVectors(_e, _s).normalize());
  upper.updateMatrixWorld(true);
  aimBone(fore, _l.subVectors(target, _e).normalize());
  fore.updateMatrixWorld(true);
}

function aimBone(bone, worldDir) {
  bone.parent.getWorldQuaternion(_q).invert();
  const local = worldDir.clone().applyQuaternion(_q);
  bone.quaternion.setFromUnitVectors(DOWN, local);
}
