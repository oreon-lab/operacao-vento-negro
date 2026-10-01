// Pooled visual effects: GPU point particles, tracers, muzzle lights, casings, decals.
import * as THREE from 'three';
import { rand } from '../core/utils.js';

const MAX = 2500;

class ParticleSystem {
  constructor(scene, additive) {
    this.n = 0;
    this.p = new Float32Array(MAX * 3); this.v = new Float32Array(MAX * 3);
    this.c = new Float32Array(MAX * 4); this.s = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.s0 = new Float32Array(MAX); this.s1 = new Float32Array(MAX);
    this.a0 = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('color', this.colAttr); g.setAttribute('size', this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float scale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec4 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          float a = smoothstep(0.5, 0.0, r); a *= a;
          gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  emit(pos, vel, { life = 1, size = [0.3, 1], color = [1, 1, 1], alpha = 1, gravity = 0, drag = 0 } = {}) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.p.set([pos.x, pos.y, pos.z], i * 3); this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.life[i] = 0; this.max[i] = life; this.s0[i] = size[0]; this.s1[i] = size[1];
    this.col.set(color, i * 3); this.a0[i] = alpha; this.grav[i] = gravity; this.drag[i] = drag;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.kill(i); continue; }
      const t = this.life[i] / this.max[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.c[i * 4] = this.col[i * 3]; this.c[i * 4 + 1] = this.col[i * 3 + 1]; this.c[i * 4 + 2] = this.col[i * 3 + 2];
      this.c[i * 4 + 3] = this.a0[i] * fade;
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = true;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, w] of [[this.p, 3], [this.v, 3], [this.col, 3], [this.c, 4]]) for (let k = 0; k < w; k++) arr[i * w + k] = arr[j * w + k];
    for (const arr of [this.s, this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag]) arr[i] = arr[j];
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.add = new ParticleSystem(scene, true);
    this.norm = new ParticleSystem(scene, false);
    this.emitters = [];

    // tracers
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.008, 0.008, 1, 5, 1, true).rotateX(Math.PI / 2);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m);
      this.tracers.push({ m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, active: false });
    }
    // flash lights (fixed count so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2); scene.add(l); this.lights.push({ l, t: 0, peak: 0 });
    }
    this.lightIdx = 0;
    // brass casings
    this.casings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.005, 0.005, 0.045, 6), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 }), 60);
    this.casings.frustumCulled = false; this.casings.count = 60; scene.add(this.casings);
    this.casingData = Array.from({ length: 60 }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: 0, t: 99 }));
    this.casingIdx = 0;
    // bullet hole decals
    const dc = document.createElement('canvas'); dc.width = dc.height = 64;
    const g = dc.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(10,8,6,1)'); grd.addColorStop(0.25, 'rgba(25,20,15,0.9)'); grd.addColorStop(0.5, 'rgba(60,50,40,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1,
    }), 120);
    this.decals.count = 0; this.decalIdx = 0; this.decals.frustumCulled = false; scene.add(this.decals);
    this.shake = 0;
    this.buildDust();
  }

  buildDust() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = rand(-30, 30);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf0dcb8, size: 0.04, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  flash(pos, peak = 6, color = 0xffb060, range = 12) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = range; L.peak = peak; L.t = 0; L.dur = range > 20 ? 0.35 : 0.06;
  }

  muzzle(pos, dir, big = false) {
    for (let i = 0; i < (big ? 6 : 4); i++) {
      _v.copy(dir).multiplyScalar(rand(2, 8)).add(_w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)));
      this.add.emit(pos, _v, { life: rand(0.03, 0.07), size: [big ? 0.25 : 0.18, 0.05], color: [1, 0.7, 0.3], alpha: 1 });
    }
    this.norm.emit(pos, _v.copy(dir).multiplyScalar(1.5).add(_w.set(0, 0.4, 0)), { life: 0.7, size: [0.1, 0.6], color: [0.7, 0.68, 0.64], alpha: 0.25, drag: 2 });
    this.flash(pos, big ? 8 : 5);
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.active = true; t.from.copy(from); t.dir.subVectors(to, from); t.dist = t.dir.length(); t.dir.normalize(); t.t = 0;
    // incoming rounds: stop short of the camera so they don't fill the screen
    const cam = this.camera.getWorldPosition(_w);
    if (to.distanceTo(cam) < 3) t.dist = Math.max(0, t.dist - 3);
    t.m.visible = true;
  }

  impact(pos, normal, surface = 'wall') {
    const n = normal || Y;
    const dustCol = surface === 'metal' ? [0.9, 0.8, 0.6] : [0.78, 0.66, 0.5];
    for (let i = 0; i < 6; i++) {
      _v.copy(n).multiplyScalar(rand(1, 3)).add(_w.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)));
      this.norm.emit(pos, _v, { life: rand(0.4, 0.9), size: [0.08, rand(0.4, 0.8)], color: dustCol, alpha: 0.5, gravity: 1, drag: 3 });
    }
    for (let i = 0; i < 5; i++) {
      _v.copy(n).multiplyScalar(rand(2, 6)).add(_w.set(rand(-2, 2), rand(0, 3), rand(-2, 2)));
      this.add.emit(pos, _v, { life: rand(0.1, 0.3), size: [0.04, 0.01], color: [1, 0.75, 0.4], gravity: 9 });
    }
    if (normal) this.decal(pos, normal);
  }

  blood(pos, dir) {
    for (let i = 0; i < 10; i++) {
      _v.copy(dir).multiplyScalar(rand(0.5, 2.5)).add(_w.set(rand(-1, 1), rand(-0.5, 1.2), rand(-1, 1)));
      this.norm.emit(pos, _v, { life: rand(0.3, 0.6), size: [0.08, rand(0.25, 0.5)], color: [0.45, 0.02, 0.02], alpha: 0.85, gravity: 4, drag: 2 });
    }
  }

  decal(pos, normal) {
    const i = this.decalIdx++ % 120;
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    _m.compose(_v.copy(pos).addScaledVector(normal, 0.01), _q, _w.setScalar(rand(0.7, 1.3)));
    this.decals.setMatrixAt(i, _m);
    this.decals.count = Math.min(120, Math.max(this.decals.count, i + 1));
    this.decals.instanceMatrix.needsUpdate = true;
  }

  casing(pos, vel) {
    const c = this.casingData[this.casingIdx++ % 60];
    c.p.copy(pos); c.v.copy(vel); c.r.set(rand(0, 3), rand(0, 3), rand(0, 3)); c.w = rand(10, 25); c.t = 0;
  }

  explosion(pos) {
    for (let i = 0; i < 40; i++) {
      _v.set(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(3, 12));
      this.add.emit(pos, _v, { life: rand(0.25, 0.6), size: [rand(1, 2), rand(2, 4)], color: [1, rand(0.4, 0.7), 0.15], drag: 4 });
    }
    for (let i = 0; i < 30; i++) {
      _v.set(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1)).multiplyScalar(rand(1, 5));
      this.norm.emit(_w.copy(pos).add(_v.clone().multiplyScalar(0.2)), _v, { life: rand(2, 4), size: [1.5, rand(5, 8)], color: [0.28, 0.25, 0.22], alpha: 0.7, drag: 1.5, gravity: -0.4 });
    }
    for (let i = 0; i < 30; i++) {
      _v.set(rand(-1, 1), rand(0.5, 2), rand(-1, 1)).multiplyScalar(rand(5, 15));
      this.add.emit(pos, _v, { life: rand(0.5, 1.2), size: [0.08, 0.03], color: [1, 0.8, 0.4], gravity: 12 });
    }
    for (let i = 0; i < 20; i++) {
      _v.set(rand(-1, 1), rand(0, 0.3), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9));
      this.norm.emit(pos, _v, { life: rand(1, 2), size: [0.5, 3], color: [0.7, 0.6, 0.45], alpha: 0.6, drag: 3 });
    }
    this.flash(pos, 60, 0xffa040, 30);
  }

  /** Persistent emitter: 'fire' (flames + smoke column) or 'dust' (rotor wash). */
  addEmitter(pos, type, opts = {}) { const e = { pos, type, acc: 0, ...opts }; this.emitters.push(e); return e; }
  removeEmitter(e) { this.emitters.splice(this.emitters.indexOf(e), 1); }

  update(dt) {
    for (const e of this.emitters) {
      e.acc += dt;
      if (e.type === 'fire') {
        while (e.acc > 0.03) {
          e.acc -= 0.03;
          this.add.emit(_w.copy(e.pos).add(_v.set(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), _v.set(rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3)),
            { life: rand(0.4, 0.8), size: [rand(0.6, 1), 0.2], color: [1, rand(0.35, 0.6), 0.1], alpha: 0.8 });
          if (Math.random() < 0.5) this.norm.emit(_w.copy(e.pos).add(_v.set(0, 1, 0)), _v.set(rand(-0.3, 0.3) + 0.8, rand(2.5, 4), rand(-0.3, 0.3) - 0.4),
            { life: rand(6, 9), size: [1, rand(6, 10)], color: [0.12, 0.11, 0.1], alpha: 0.45, drag: 0.1 });
        }
      } else if (e.type === 'dust' && e.strength > 0) {
        while (e.acc > 0.02) {
          e.acc -= 0.02;
          const a = rand(0, Math.PI * 2), r = rand(2, 6);
          _w.set(e.pos.x + Math.cos(a) * r, 0.3, e.pos.z + Math.sin(a) * r);
          _v.set(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(rand(6, 14) * e.strength);
          this.norm.emit(_w, _v, { life: rand(1.2, 2.2), size: [1, rand(4, 7)], color: [0.8, 0.68, 0.5], alpha: 0.35 * e.strength, drag: 1.2 });
        }
      }
    }
    this.add.update(dt); this.norm.update(dt);
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.t += dt;
      const speed = 380, len = Math.min(2.2, t.dist);
      const head = Math.min(t.dist, t.t * speed), tail = Math.max(0, head - len);
      if (tail >= t.dist - 0.01) { t.active = false; t.m.visible = false; continue; }
      t.m.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.m.quaternion.setFromUnitVectors(_v.set(0, 0, 1), t.dir);
      t.m.scale.set(1, 1, Math.max(0.01, head - tail));
    }
    for (const L of this.lights) {
      L.t += dt;
      L.l.intensity = L.t < L.dur ? L.peak * (1 - L.t / L.dur) : 0;
    }
    for (let i = 0; i < 60; i++) {
      const c = this.casingData[i];
      if (c.t < 3) {
        c.t += dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
        c.r.x += c.w * dt; c.r.z += c.w * 0.7 * dt;
        if (c.p.y < 0.01) { c.p.y = 0.01; c.v.multiplyScalar(0.3); c.v.y = Math.abs(c.v.y) * 0.4; c.w *= 0.5; }
      }
      _m.compose(c.p, _q.setFromEuler(c.r), _w.setScalar(1));
      this.casings.setMatrixAt(i, _m);
    }
    this.casings.instanceMatrix.needsUpdate = true;
    // ambient dust wraps around the camera
    const dp = this.dust.geometry.attributes.position, cam = this.camera.getWorldPosition(_w);
    for (let i = 0; i < dp.count; i++) {
      let x = dp.getX(i) + dt * 0.6, y = dp.getY(i) + Math.sin(i + x) * dt * 0.05, z = dp.getZ(i) + dt * 0.2;
      if (x - cam.x > 30) x -= 60; if (x - cam.x < -30) x += 60;
      if (z - cam.z > 30) z -= 60; if (z - cam.z < -30) z += 60;
      if (y - cam.y > 15) y -= 30; if (y - cam.y < -15) y += 30;
      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
