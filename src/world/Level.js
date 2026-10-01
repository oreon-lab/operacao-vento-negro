// The desert town of Al-Harim: sky, terrain, buildings, props, colliders and
// the named points the campaign script uses.
import * as THREE from 'three';
import { M } from '../models/materials.js';
import * as P from '../models/props.js';
import { part, mergeByMaterial, rng, fbm, clamp } from '../core/utils.js';
import { CollisionWorld } from './Collision.js';

export const SUN_DIR = new THREE.Vector3(0.62, 0.32, -0.45).normalize();
const HORIZON = new THREE.Color(0xe2b98c);

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function terrainHeight(x, z) {
  const d = Math.hypot(x, z - 5);
  const k = clamp((d - 110) / 140, 0, 1);
  if (k === 0) return 0;
  const s = k * k * (3 - 2 * k);
  return s * (fbm(x / 170, z / 170, 4) * 55 - 14 + Math.sin(x / 60) * 4);
}

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.col = new CollisionWorld();
    this.r = rng(42);
    this.static = new THREE.Group();
    this.buildSky();
    this.buildTerrain();
    this.buildTown();
    mergeByMaterial(this.static);
    scene.add(this.static);
    this.points = {
      lz: new THREE.Vector3(0, 0, 78),
      street: new THREE.Vector3(0, 0, 40),
      streetEnd: new THREE.Vector3(0, 0, 14),
      plaza: new THREE.Vector3(0, 0, -6),
      hqDoor: new THREE.Vector3(0, 0, -29),
      laptop: this.laptopPos,
      extraction: new THREE.Vector3(0, 0, -8),
    };
  }

  // --- sky -------------------------------------------------------------------------
  buildSky() {
    this.skyUniforms = {
      sunDir: { value: SUN_DIR },
      top: { value: new THREE.Color(0x4f79ad) },
      horizon: { value: HORIZON },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunDir, top, horizon; uniform float time; varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=n(p)*a; p*=2.03; a*=.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(horizon, top, pow(y, 0.45));
          col = mix(col, horizon * 0.9, smoothstep(0.0, -0.08, d.y));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.62, 0.3) * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6);
          col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9993, 0.9997, s) * 4.0;
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.3 + vec2(time * 0.004, 0.0);
            float c = smoothstep(0.52, 0.85, fbm(uv));
            vec3 cc = mix(vec3(0.95, 0.82, 0.7), vec3(1.0, 0.7, 0.45), pow(s, 3.0));
            col = mix(col, cc, c * smoothstep(0.0, 0.15, d.y) * 0.75);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(HORIZON, 0.0021);
    this.scene.background = HORIZON;

    const sun = new THREE.DirectionalLight(0xffd6a8, 3.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xc4d6ee, 0xa98962, 1.7));
  }

  /** Keep sky centered and the shadow frustum around the viewer. */
  update(dt, focus) {
    this.skyUniforms.time.value += dt;
    this.sky.position.copy(focus);
    const snap = 4; // snap to reduce shadow shimmering
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, 200);
  }

  // --- terrain ---------------------------------------------------------------------
  buildTerrain() {
    const size = 4400, seg = 220;
    const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    const colors = new Float32Array(p.count * 3);
    const c1 = new THREE.Color(0xffffff), c2 = new THREE.Color(0xd8c2a0), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, terrainHeight(x, z));
      uv.setXY(i, x / 7, z / 7);
      c.lerpColors(c1, c2, fbm(x / 40 + 100, z / 40, 3));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    M.sand.vertexColors = true;
    const ground = new THREE.Mesh(g, M.sand);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // packed-dirt roads
    const road = M.sand.clone(); road.color = new THREE.Color(0xb49a78); road.vertexColors = false;
    road.polygonOffset = true; road.polygonOffsetFactor = -2;
    const strip = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), road);
      const u = m.geometry.attributes.uv, q = m.geometry.attributes.position;
      for (let i = 0; i < u.count; i++) u.setXY(i, (q.getX(i) + x) / 7, (q.getZ(i) + z) / 7);
      m.position.set(x, 0.01, z); m.receiveShadow = true; this.scene.add(m);
    };
    strip(0, 45, 9, 90); strip(0, -8, 38, 30); strip(-60, -9, 80, 7); strip(60, -9, 80, 7); strip(0, -40, 7, 40);

    // distant mountain ring
    const N = 200, rows = 3, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const hgt = 80 + fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3, 5) * 380;
      const ring = [[1500, -20], [1750, hgt], [1900, hgt * 0.7], [2150, -20]];
      for (const [rad, y] of ring.slice(0, rows + 1)) pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = a + rows + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
    this.scene.add(new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0xc09a74, roughness: 1, flatShading: true, side: THREE.DoubleSide, fog: false })));
  }

  // --- helpers ----------------------------------------------------------------------
  put(obj, x, z, ry = 0, y = 0, collide = null) {
    obj.position.set(x, y, z); obj.rotation.y = ry;
    this.static.add(obj);
    if (collide) this.col.addFoot(x, z, collide[0], collide[1], collide[2], y, ry);
    return obj;
  }

  /** Solid building with dressed facades. door: 'n'|'s'|'e'|'w'. */
  building(x0, z0, x1, z1, h, door = 's', matIdx = 0) {
    const r = this.r;
    const mat = [M.plaster, M.plaster2, M.plaster3][matIdx % 3];
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = this.static;
    part(box(w, h, d), mat, [cx, h / 2, cz], null, null, g);
    this.col.add(x0, 0, z0, x1, h, z1);
    part(box(w + 0.16, 0.22, d + 0.16), M.plasterTrim, [cx, h - 0.3, cz], null, null, g);
    part(box(w + 0.1, 0.35, d + 0.1), M.plasterTrim, [cx, 0.17, cz], null, null, g); // plinth
    // parapet
    for (const [px, pz, pw, pd] of [[cx, z0 + 0.1, w, 0.2], [cx, z1 - 0.1, w, 0.2], [x0 + 0.1, cz, 0.2, d], [x1 - 0.1, cz, 0.2, d]]) {
      part(box(pw, 0.7, pd), mat, [px, h + 0.35, pz], null, null, g);
      this.col.add(px - pw / 2, h, pz - pd / 2, px + pw / 2, h + 0.7, pz + pd / 2);
    }
    const sides = {
      s: { o: [x0, z1], t: [1, 0], n: [0, 1], L: w },
      n: { o: [x1, z0], t: [-1, 0], n: [0, -1], L: w },
      e: { o: [x1, z1], t: [0, -1], n: [1, 0], L: d },
      w: { o: [x0, z0], t: [0, 1], n: [-1, 0], L: d },
    };
    const floors = Math.max(1, Math.floor(h / 2.9));
    for (const [key, s] of Object.entries(sides)) {
      const ry = Math.atan2(s.n[0], s.n[1]);
      const at = (u, y, off) => [s.o[0] + s.t[0] * u + s.n[0] * off, y, s.o[1] + s.t[1] * u + s.n[1] * off];
      const count = Math.floor((s.L - 1.5) / 3.3);
      const doorU = s.L / 2;
      if (key === door) {
        part(box(1.3, 2.3, 0.06), M.darkOpening, at(doorU, 1.15, 0.03), [0, ry, 0], null, g);
        part(box(1.6, 0.2, 0.25), M.plasterTrim, at(doorU, 2.4, 0.08), [0, ry, 0], null, g);
        part(box(1.8, 0.15, 0.7), M.concrete, at(doorU, 0.07, 0.35), [0, ry, 0], null, g);
        const dm = r() < 0.5 ? M.doorWood : M.metalDoor;
        part(box(0.62, 2.2, 0.05), dm, at(doorU - 0.33, 1.1, 0.07), [0, ry, 0], null, g);
        if (r() < 0.6) part(box(0.62, 2.2, 0.05), dm, at(doorU + 0.33, 1.1, 0.07), [0, ry, 0], null, g);
        if (r() < 0.5) { // cloth awning
          const aw = part(new THREE.PlaneGeometry(2.4, 1.3), r() < 0.5 ? M.awning1 : M.awning2, at(doorU, 2.75, 0.6), [0, ry, 0], null, g);
          aw.rotateX(-1.1);
        }
      }
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < count; i++) {
          const u = (s.L / (count + 1)) * (i + 1);
          if (key === door && f === 0 && Math.abs(u - doorU) < 1.6) continue;
          if (r() < 0.12) continue;
          const y = f * 2.9 + 1.7;
          part(box(0.95, 1.15, 0.05), M.darkOpening, at(u, y, 0.02), [0, ry, 0], null, g);
          part(box(1.2, 0.08, 0.2), M.plasterTrim, at(u, y - 0.62, 0.08), [0, ry, 0], null, g);
          part(box(1.2, 0.14, 0.14), M.plasterTrim, at(u, y + 0.64, 0.06), [0, ry, 0], null, g);
          const sh = r();
          if (sh < 0.45) { // open shutters
            for (const sd of [-1, 1]) {
              const p = at(u + sd * 0.72, y, 0.2);
              part(box(0.48, 1.12, 0.04), M.doorWood, p, [0, ry + sd * 0.9, 0], null, g);
            }
          } else if (sh < 0.65) { // bars
            for (let k = -2; k <= 2; k++) part(box(0.025, 1.1, 0.025), M.rust, at(u + k * 0.18, y, 0.08), [0, ry, 0], null, g);
          } else if (sh < 0.75) {
            part(box(0.46, 1.12, 0.04), M.doorWood, at(u - 0.24, y, 0.05), [0, ry, 0], null, g);
            part(box(0.46, 1.12, 0.04), M.doorWood, at(u + 0.24, y, 0.05), [0, ry, 0], null, g);
          }
        }
      }
      // wall-mounted AC units and staining pipes
      if (r() < 0.5) {
        const ac = P.acUnit(); const p = at(s.L * (0.2 + r() * 0.6), 2.9 * floors - 0.9, 0.18);
        ac.position.set(...p); ac.rotation.y = ry; g.add(ac);
      }
      if (r() < 0.4) part(box(0.08, h, 0.08), M.rust, at(0.4, h / 2, 0.06), null, null, g);
    }
    // roof clutter
    const roof = () => [x0 + 1 + r() * (w - 2), z0 + 1 + r() * (d - 2)];
    if (r() < 0.7) { const [x, z] = roof(); this.put(P.waterTank(), x, z, r() * 3, h); }
    if (r() < 0.5) { const [x, z] = roof(); this.put(P.dish(), x, z, r() * 6, h); }
    if (r() < 0.3) { const [x, z] = roof(); this.put(P.crate(0.8), x, z, r(), h); }
    if (r() < 0.35 && w > 6 && d > 6) { // stair hut
      const hx = x0 + 1.6, hz = z0 + 1.6;
      part(box(2.2, 2.2, 2.2), mat, [hx, h + 1.1, hz], null, null, g);
      part(box(2.4, 0.15, 2.4), M.plasterTrim, [hx, h + 2.25, hz], null, null, g);
      this.col.add(hx - 1.1, h, hz - 1.1, hx + 1.1, h + 2.2, hz + 1.1);
    }
  }

  /** Wall segment along X (at z) or Z (at x) with openings [{c,w,y0,y1}] in local coords. */
  wall(axis, fixed, a, b, h, t, mat, openings = []) {
    const pieces = []; // [from, to, y0, y1]
    let cur = a;
    for (const o of [...openings].sort((p, q) => p.c - q.c)) {
      const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
      if (o0 > cur) pieces.push([cur, o0, 0, h]);
      if (o.y0 > 0) pieces.push([o0, o1, 0, o.y0]);
      if (o.y1 < h) pieces.push([o0, o1, o.y1, h]);
      cur = o1;
    }
    if (cur < b) pieces.push([cur, b, 0, h]);
    for (const [p0, p1, y0, y1] of pieces) {
      const len = p1 - p0, mid = (p0 + p1) / 2, hh = y1 - y0;
      if (axis === 'x') {
        part(box(len, hh, t), mat, [mid, y0 + hh / 2, fixed], null, null, this.static);
        this.col.add(p0, y0, fixed - t / 2, p1, y1, fixed + t / 2);
      } else {
        part(box(t, hh, len), mat, [fixed, y0 + hh / 2, mid], null, null, this.static);
        this.col.add(fixed - t / 2, y0, p0, fixed + t / 2, y1, p1);
      }
    }
  }

  /** Enterable command post where the intel laptop sits. */
  buildHQ() {
    const x0 = -9, x1 = 9, z0 = -47, z1 = -33, h = 4.4, t = 0.35, mat = M.plaster3;
    const win = (c) => ({ c, w: 1.2, y0: 1.0, y1: 2.1 });
    this.wall('x', z1, x0, x1, h, t, mat, [{ c: 0, w: 1.6, y0: 0, y1: 2.5 }, win(-5.5), win(5.5)]);
    this.wall('x', z0, x0, x1, h, t, mat, [win(-4), win(4)]);
    this.wall('z', x0, z0, z1, h, t, mat, [win(-40)]);
    this.wall('z', x1, z0, z1, h, t, mat, [win(-40), { c: -44.5, w: 1.3, y0: 0, y1: 2.3 }]);
    this.wall('z', 0, z0, -36, h, 0.25, M.plaster2, [{ c: -42.5, w: 1.3, y0: 0, y1: 2.3 }]); // interior divider (foyer by the door)
    const g = this.static;
    part(box(x1 - x0 + 0.4, 0.3, z1 - z0 + 0.4), M.plaster3, [0, h + 0.15, (z0 + z1) / 2], null, null, g); // roof
    this.col.add(x0, h, z0, x1, h + 0.3, z1);
    part(box(x1 - x0, 0.04, z1 - z0), M.concrete, [0, 0.02, (z0 + z1) / 2], null, null, g); // floor
    for (const [px, pz, pw, pd] of [[0, z0, 18.4, 0.2], [0, z1, 18.4, 0.2], [x0, -40, 0.2, 14.4], [x1, -40, 0.2, 14.4]])
      part(box(pw, 0.6, pd), mat, [px, h + 0.6, pz], null, null, g);
    part(box(2.2, 0.15, 1.2), M.plasterTrim, [0, 2.6, z1 + 0.5], null, null, g); // door canopy
    // interior dressing
    const tbl = P.table(1.8, 0.9); this.put(tbl, 4.5, -41.5, 0, 0, [1.8, 0.9, 0.8]);
    const lap = P.laptop(); lap.position.set(4.3, 0.785, -41.5); lap.rotation.y = 0.3; g.add(lap);
    this.laptopPos = new THREE.Vector3(4.3, 0, -41.5);
    for (let i = 0; i < 6; i++) part(box(0.21, 0.005, 0.29), M.paper, [4.9 + (this.r() - 0.5) * 0.6, 0.79, -41.4 + (this.r() - 0.5) * 0.5], [0, this.r(), 0], null, g);
    this.put(P.chair(), 4.4, -40.8, Math.PI);
    this.put(P.chair(), 5.6, -42.3, 0.4);
    this.put(P.ammoCrate(), 7.8, -45.8, 0, 0, [0.9, 0.5, 0.4]);
    this.put(P.ammoCrate(), 7.8, -45.8, 0.1, 0.36);
    this.put(P.crate(0.9), 1.2, -46, 0.2, 0, [0.9, 0.9, 0.9]);
    this.put(P.table(1.4, 0.7), -4.5, -45.9, 0, 0, [1.4, 0.7, 0.8]);
    part(box(1.9, 0.18, 0.9), M.mattress, [-7.5, 0.09, -38], null, null, g);
    part(box(1.9, 0.18, 0.9), M.mattress, [-7.5, 0.09, -36.6], null, null, g);
    this.put(P.crate(0.7), -1.2, -34.5, 0.4, 0, [0.7, 0.7, 0.7]);
    this.put(P.barrel(M.barrelRed), -1.0, -45.8, 0, 0, [0.6, 0.6, 0.9]);
    // wall map (uses the Codex briefing image)
    const mapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    new THREE.TextureLoader().load('assets/images/briefing_map.jpg', (tx) => { tx.colorSpace = THREE.SRGBColorSpace; mapMat.map = tx; mapMat.needsUpdate = true; });
    const map = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), mapMat);
    map.position.set(x1 - t / 2 - 0.02, 1.8, -41.5); map.rotation.y = -Math.PI / 2;
    map.userData.noMerge = true; g.add(map);
    // hanging bulbs
    for (const [x, z] of [[4.5, -40], [-4.5, -40]]) {
      part(new THREE.SphereGeometry(0.06, 8, 6), M.headlight, [x, 3.4, z], null, null, g);
      part(new THREE.CylinderGeometry(0.005, 0.005, 1.0, 4), M.rubber, [x, 3.9, z], null, null, g);
      const l = new THREE.PointLight(0xffc27a, 6, 9, 1.8); l.position.set(x, 3.3, z); this.scene.add(l);
    }
  }

  buildTown() {
    const r = this.r;
    // main street
    this.building(-17, 42, -6, 54, 6.2, 'e', 0);
    this.building(-16, 26, -6, 38, 3.8, 'e', 1);
    this.building(-18, 10, -6, 22, 6.8, 'e', 2);
    this.building(6, 44, 15, 55, 3.8, 'w', 1);
    this.building(6, 27, 17, 39, 7.0, 'w', 0);
    this.building(6, 11, 14, 23, 4.2, 'w', 2);
    // plaza ring
    this.building(-32, -3, -21, 8, 4.5, 'e', 1);
    this.building(-32, -26, -21, -15, 5.5, 'e', 0);
    this.building(21, -3, 31, 8, 5.2, 'w', 2);
    this.building(21, -26, 33, -15, 6.5, 'w', 1);
    this.building(-26, -46, -13, -31, 5.0, 's', 2);
    this.building(13, -46, 26, -31, 6.0, 's', 0);
    this.buildHQ();

    // outskirts (skyline filler)
    const placed = [];
    for (let tries = 0; tries < 400 && placed.length < 26; tries++) {
      const a = r() * Math.PI * 2, d = 50 + r() * 50;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 5;
      if (z > 35 && Math.abs(x) < 30) continue; // keep LZ open
      if (Math.abs(z + 9) < 7 || Math.abs(x) < 8) continue; // roads
      const w = 7 + r() * 6, dd = 7 + r() * 6;
      if (placed.some(([px, pz, pw, pd]) => Math.abs(px - x) < (pw + w) / 2 + 4 && Math.abs(pz - z) < (pd + dd) / 2 + 4)) continue;
      if (Math.abs(x) < 36 && z > -50 && z < 58) continue; // core town
      placed.push([x, z, w, dd]);
      const sides = ['n', 's', 'e', 'w'];
      this.building(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, 3.5 + Math.floor(r() * 3) * 1.4, sides[Math.floor(r() * 4)], Math.floor(r() * 3));
    }

    // --- props: street --------------------------------------------------------
    this.put(P.jerseyBarrier(), -2.6, 60, 0.1, 0, [3, 0.6, 0.9]);
    this.put(P.jerseyBarrier(), 3.2, 61.5, -0.2, 0, [3, 0.6, 0.9]);
    this.put(P.car({ burnt: true }), -3.2, 33, 0.25, 0, [1.9, 4.5, 1.4]);
    this.put(P.car({ paint: M.truckPaint }), 3.6, 47, Math.PI - 0.08, 0, [1.9, 4.5, 1.4]);
    this.put(P.barrel(M.barrelBlue), -5.2, 45, 0, 0, [0.6, 0.6, 0.9]);
    this.put(P.barrel(M.barrelRed), -5.0, 44.2, 0, 0, [0.6, 0.6, 0.9]);
    this.put(P.crate(1), 5.2, 30, 0.3, 0, [1.1, 1.1, 1]);
    this.put(P.crate(0.8), 5.3, 31.1, 0.1, 0, [0.9, 0.9, 0.8]);
    this.put(P.tirePile(3), -5.2, 25, 0);
    this.put(P.sandbags(3, 3, 5), 2.5, 19, 0.2, 0, [3, 0.5, 0.5]);
    this.put(P.rubble(14, 1.8, 7), -4.8, 20, 0);
    this.put(P.rubble(10, 1.2, 8), 5, 40, 0);
    for (const z of [58, 36, 14]) {
      this.put(P.powerPole(), -5.4, z, 0);
      this.put(P.powerPole(), 5.4, z - 10, 0);
    }
    const wires = [[[-5.4, 58], [-5.4, 36]], [[-5.4, 36], [-5.4, 14]], [[5.4, 48], [5.4, 26]], [[5.4, 26], [5.4, 4]], [[-5.4, 36], [5.4, 26]]];
    for (const [[ax, az], [bx, bz]] of wires) for (const dx of [-0.7, 0.7])
      this.static.add(P.wire(new THREE.Vector3(ax + dx, 7.7, az), new THREE.Vector3(bx + dx, 7.7, bz), 0.9));

    // --- props: plaza ----------------------------------------------------------------
    this.put(P.well(), 0, -8, 0, 0, [2.4, 2.4, 0.85]);
    this.put(P.stall(M.awning1, 1), -14, -2, Math.PI / 2, 0, [2.2, 3, 1.1]);
    this.put(P.stall(M.awning2, 2), -14, -9, Math.PI / 2, 0, [2.2, 3, 1.1]);
    this.put(P.stall(M.awning1, 3), 15, -20, -Math.PI / 2, 0, [2.2, 3, 1.1]);
    this.put(P.car({ burnt: true }), -6, 1.5, 1.2, 0, [4.5, 1.9, 1.4]);
    this.put(P.car({ paint: M.plaster2 }), 13, 1, -0.3, 0, [1.9, 4.5, 1.4]);
    // U-shaped sandbag nest (defend position)
    this.put(P.sandbags(4, 3, 11), 7, -12.5, 0, 0, [4, 0.6, 0.55]);
    this.put(P.sandbags(3, 3, 12), 4.8, -11, Math.PI / 2, 0, [3, 0.6, 0.55]);
    this.put(P.sandbags(3, 3, 13), 9.2, -11, Math.PI / 2, 0, [3, 0.6, 0.55]);
    this.put(P.sandbags(4, 2, 14), -7, -17, 0.1, 0, [4, 0.4, 0.55]);
    this.put(P.sandbags(3, 3, 15), 0, -22, 0, 0, [3, 0.6, 0.55]);
    for (const [x, z] of [[-10, -21], [11, -3], [-17, 5], [17, 5]]) this.put(P.crate(1), x, z, r(), 0, [1.1, 1.1, 1]);
    for (const [x, z] of [[-11, -22], [12, -4], [18, -12], [-18, -12]]) this.put(P.barrel(r() < 0.5 ? M.barrelBlue : M.barrelRed), x, z, 0, 0, [0.6, 0.6, 0.9]);
    for (const [x, z, hh] of [[-19, 6, 7.5], [19, 6, 8], [-19, -22, 6.5], [19, -23, 7], [-8, -28, 7], [9, -28, 6.8], [-4, 64, 8], [7, 66, 7]])
      this.put(P.palm(hh, Math.floor(x * 10 + z)), x, z, 0, 0, [0.5, 0.5, 6]);
    this.put(P.rubble(18, 2.5, 21), 17, -9, 0);
    this.put(P.tirePile(4), -18, -18, 0);
    this.put(P.jerseyBarrier(), 21, -9, Math.PI / 2 + 0.2, 0, [0.9, 3, 0.9]);
    this.put(P.jerseyBarrier(), -21, -9, Math.PI / 2 - 0.15, 0, [0.9, 3, 0.9]);
    this.put(P.car({ burnt: true }), 45, -7, 1.7, 0, [4.5, 1.9, 1.4]);
    this.burningCars = [new THREE.Vector3(-6, 1.2, 1.5), new THREE.Vector3(45, 1.2, -7)];

    // LZ rocks
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2, d = 12 + r() * 30;
      const s = 0.3 + r() * 1.2;
      if (Math.abs(Math.cos(a) * d) < 7) continue; // keep the road clear
      part(new THREE.DodecahedronGeometry(s, 1), M.rubble, [Math.cos(a) * d, s * 0.3, 78 + Math.sin(a) * d], [r() * 3, r() * 3, 0], [1, 0.55, 1.2], this.static);
    }
  }
}
