// First-person weapons: viewmodel scene (arms + gun), ADS, recoil, reload, hitscan.
import * as THREE from 'three';
import { buildM4, buildPistol, buildGrenade } from '../models/weapons.js';
import { M } from '../models/materials.js';
import { part, segment, mergeByMaterial, damp, clamp, rand } from '../core/utils.js';
import { traceShot, ZONE_MULT, Grenade } from './Combat.js';

const DEFS = {
  m4: { name: 'M4A1', auto: true, rpm: 780, dmg: 34, mag: 30, reserve: 210, reload: 2.3, hip: 0.019, ads: 0.0014, kick: 0.0075, yawKick: 0.0026, fov: 50, sound: 'rifle' },
  pistol: { name: 'M9', auto: false, rpm: 420, dmg: 45, mag: 15, reserve: 60, reload: 1.6, hip: 0.016, ads: 0.0035, kick: 0.014, yawKick: 0.0038, fov: 62, sound: 'pistol' },
};

function glove(parent, pos, rot) {
  const h = new THREE.Group(); h.position.set(...pos); h.rotation.set(...rot); parent.add(h);
  part(new THREE.BoxGeometry(0.085, 0.035, 0.1), M.glove, [0, 0, 0], null, null, h);
  for (let i = 0; i < 4; i++) part(new THREE.CapsuleGeometry(0.011, 0.05, 3, 6), M.glove, [-0.03 + i * 0.02, -0.03, -0.045], [0.9, 0, 0], null, h);
  part(new THREE.CapsuleGeometry(0.012, 0.04, 3, 6), M.glove, [0.045, 0.0, -0.02], [0.4, 0, -0.8], null, h);
  part(new THREE.BoxGeometry(0.02, 0.02, 0.05), M.webbing, [0, 0.022, 0.03], null, null, h); // knuckle pad
  return h;
}

function arms(gun, kind) {
  const g = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (kind === 'm4') {
    glove(g, [0, -0.05, 0.035], [0.3, 0, -0.2]);
    segment(V(0.01, -0.07, 0.08), V(0.09, -0.2, 0.35), 0.036, M.camoFriendly, g);
    segment(V(0.09, -0.2, 0.35), V(0.16, -0.32, 0.65), 0.05, M.camoFriendly, g);
    part(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 10), M.glove, [0.02, -0.08, 0.1], [-0.75, 0, 0.3], null, g);
    glove(g, [-0.01, -0.07, -0.3], [0.1, 0, 1.4]);
    segment(V(-0.03, -0.1, -0.27), V(-0.13, -0.24, 0.02), 0.036, M.camoFriendly, g);
    segment(V(-0.13, -0.24, 0.02), V(-0.24, -0.36, 0.3), 0.05, M.camoFriendly, g);
    part(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 10), M.glove, [-0.045, -0.12, -0.24], [-0.9, 0, -0.6], null, g);
  } else {
    glove(g, [0, -0.045, 0.03], [0.3, 0, -0.2]);
    segment(V(0.0, -0.07, 0.08), V(0.06, -0.2, 0.32), 0.036, M.camoFriendly, g);
    glove(g, [-0.025, -0.06, 0.02], [0.3, 0, 0.6]);
    segment(V(-0.03, -0.08, 0.07), V(-0.12, -0.21, 0.3), 0.036, M.camoFriendly, g);
  }
  mergeByMaterial(g, { shadows: false });
  gun.add(g);
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(DEFS.m4.fov, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdde6f0, 0x806040, 1.6));
    const d = new THREE.DirectionalLight(0xffd6a8, 2.2); d.position.set(1, 2, 1); this.scene.add(d);
    this.root = new THREE.Group(); this.scene.add(this.root);

    this.slots = {};
    for (const [key, build] of [['m4', buildM4], ['pistol', buildPistol]]) {
      const model = build();
      arms(model, key);
      const def = DEFS[key];
      const flash = this.makeFlash(); flash.position.copy(model.userData.muzzle); model.add(flash);
      model.visible = false;
      this.root.add(model);
      this.slots[key] = { key, def, model, flash, ammo: def.mag, reserve: def.reserve,
        hip: key === 'm4' ? new THREE.Vector3(0.15, -0.165, -0.4) : new THREE.Vector3(0.13, -0.14, -0.4),
        ads: new THREE.Vector3(0, -model.userData.sightY, key === 'm4' ? -0.27 : -0.34) };
    }
    this.cur = this.slots.m4; this.cur.model.visible = true;
    this.grenades = 3;
    this.aim = false; this.aimT = 0;
    this.cool = 0; this.reloading = 0; this.switching = 0; this.pendingSwitch = null;
    this.kick = 0; this.kickRot = 0; this.flashT = 0;
    this.sway = new THREE.Vector2(); this.sprintT = 0;
    this.spread = 0.03;
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0 };
    this.throwT = 0;
    this.nadeModel = buildGrenade(); this.nadeModel.visible = false; this.nadeModel.position.set(0.1, -0.12, -0.35); this.root.add(this.nadeModel);
  }

  makeFlash() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(0.3, 'rgba(255,190,90,0.9)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grd; g.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.fill();
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const f = new THREE.Group();
    part(new THREE.PlaneGeometry(0.16, 0.16), mat, [0, 0, 0], null, null, f);
    part(new THREE.PlaneGeometry(0.1, 0.3), mat, [0, 0, -0.12], [Math.PI / 2, 0, 0], null, f);
    part(new THREE.PlaneGeometry(0.1, 0.3), mat, [0, 0, -0.12], [Math.PI / 2, Math.PI / 2, 0], null, f);
    f.visible = false;
    return f;
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  refill() { for (const s of Object.values(this.slots)) { s.ammo = s.def.mag; s.reserve = s.def.reserve; } this.grenades = 3; }

  switchTo(key) {
    if (this.cur.key === key || this.switching > 0) return;
    this.pendingSwitch = key; this.switching = 0.5; this.reloading = 0;
    this.game.audio.click(1200, 0.3);
  }

  startReload() {
    const s = this.cur;
    if (this.reloading > 0 || s.ammo >= s.def.mag || s.reserve <= 0) return;
    this.reloading = s.def.reload;
    this.game.audio.reload(s.def.reload);
  }

  update(dt) {
    const g = this.game, input = g.input, p = g.player;
    const active = p.enabled && !p.dead;
    this.root.visible = active;
    if (!active) { this.aim = false; return; }
    const s = this.cur, def = s.def;

    // --- input ---------------------------------------------------------------
    if (input.hit('Digit1')) this.switchTo('m4');
    if (input.hit('Digit2')) this.switchTo('pistol');
    if (input.mouse.wheel) this.switchTo(this.cur.key === 'm4' ? 'pistol' : 'm4');
    if (input.hit('KeyR')) this.startReload();
    if (input.hit('KeyG') && this.grenades > 0 && this.throwT <= 0 && this.reloading <= 0) this.throwGrenade();
    this.aim = input.mouse.right && this.reloading <= 0 && this.switching <= 0 && !p.sprinting && this.throwT <= 0;
    this.aimT = damp(this.aimT, this.aim ? 1 : 0, 14, dt);
    this.sprintT = damp(this.sprintT, p.sprinting ? 1 : 0, 8, dt);

    this.cool -= dt;
    const trigger = def.auto ? input.mouse.left : input.mouse.leftPressed;
    if (trigger && this.cool <= 0 && this.reloading <= 0 && this.switching <= 0 && this.throwT <= 0 && !p.sprinting) {
      if (s.ammo > 0) this.fire();
      else if (input.mouse.leftPressed) { g.audio.click(3000, 0.4); this.startReload(); }
    }

    // --- timers ---------------------------------------------------------------
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = def.mag - s.ammo, take = Math.min(need, s.reserve);
        s.ammo += take; s.reserve -= take;
      }
    }
    if (this.switching > 0) {
      const before = this.switching;
      this.switching -= dt;
      if (before > 0.25 && this.switching <= 0.25 && this.pendingSwitch) {
        this.cur.model.visible = false;
        this.cur = this.slots[this.pendingSwitch]; this.cur.model.visible = true; this.pendingSwitch = null;
      }
    }
    if (this.throwT > 0) {
      this.throwT -= dt;
      this.nadeModel.visible = this.throwT > 0.45;
    }

    // --- viewmodel pose --------------------------------------------------------
    const m = this.cur.model, a = this.aimT;
    this.sway.x = damp(this.sway.x - input.mouse.dx * 0.00018, 0, 9, dt);
    this.sway.y = damp(this.sway.y + input.mouse.dy * 0.00018, 0, 9, dt);
    this.kick = damp(this.kick, 0, 16, dt); this.kickRot = damp(this.kickRot, 0, 12, dt);
    const bobK = p.bobAmt * (1 - a * 0.85), ph = p.bobPhase;
    const pos = new THREE.Vector3().lerpVectors(this.cur.hip, this.cur.ads, a);
    pos.x += Math.cos(ph) * 0.012 * bobK + this.sway.x * (1 - a * 0.7);
    pos.y += -Math.abs(Math.sin(ph)) * 0.012 * bobK + this.sway.y * (1 - a * 0.7) - p.landDip * 0.3;
    pos.z += this.kick;
    const rot = new THREE.Euler(this.kickRot + this.sway.y * 2, this.sway.x * 2, Math.cos(ph) * 0.02 * bobK);
    // idle breathing
    const br = Math.sin(g.time * 1.6) * 0.003 * (1 - a * 0.8);
    pos.y += br;
    // sprint
    const sp = this.sprintT;
    pos.x -= 0.04 * sp; pos.y -= 0.06 * sp; rot.y += 0.75 * sp; rot.x -= 0.25 * sp; rot.z += 0.2 * sp;
    // reload / switch / throw dip
    if (this.reloading > 0) {
      const t = 1 - this.reloading / def.reload;
      const tilt = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      rot.z += tilt * 0.55; rot.x += tilt * 0.25; pos.y -= tilt * 0.05;
      const mag = m.userData.mag;
      const out = t < 0.4 ? clamp((t - 0.1) / 0.25, 0, 1) : t < 0.55 ? 1 : 1 - clamp((t - 0.55) / 0.2, 0, 1);
      mag.position.copy(m.userData.magPos).add(new THREE.Vector3(0, -0.25 * out, 0.05 * out));
      mag.visible = !(t > 0.35 && t < 0.5);
    } else { m.userData.mag.position.copy(m.userData.magPos); m.userData.mag.visible = true; }
    if (this.switching > 0) { const k = Math.sin((this.switching / 0.5) * Math.PI); pos.y -= k * 0.3; rot.x -= k * 0.8; }
    if (this.throwT > 0) { const k = Math.sin(clamp(this.throwT / 0.7, 0, 1) * Math.PI); pos.y -= k * 0.25; rot.x -= k * 0.6; }
    m.position.copy(pos); m.rotation.copy(rot);

    // FOV zoom
    const baseFov = 72, adsFov = this.cur.key === 'm4' ? 52 : 62;
    g.camera.fov = baseFov + (adsFov - baseFov) * a; g.camera.updateProjectionMatrix();
    this.camera.fov = def.fov - a * 4; this.camera.updateProjectionMatrix();

    // spread for crosshair / accuracy
    const move = clamp(p.speed / 4, 0, 1.5);
    const target = (def.hip * (1 + move * 1.05 + (p.onGround ? 0 : 1.4)) * (p.crouching ? 0.65 : 1)) * (1 - a) + def.ads * a * (1 + move);
    this.spread = damp(this.spread, target, 14, dt);
    s.flash.visible = this.flashT > 0; this.flashT -= dt;
  }

  /** Viewmodel point (gun local) -> world, matching where the barrel is drawn on screen. */
  viewPoint(local, out) {
    const m = this.cur.model, cam = this.game.camera;
    m.updateMatrixWorld(true);
    out.copy(local).applyMatrix4(m.matrixWorld);
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
    out.x *= k; out.y *= k;
    return out.applyMatrix4(cam.matrixWorld);
  }

  muzzleWorld(out = new THREE.Vector3()) { return this.viewPoint(this.cur.model.userData.muzzle, out); }

  fire() {
    const g = this.game, s = this.cur, def = s.def, p = g.player;
    s.ammo--; this.cool = 60 / def.rpm; this.stats.shots++;
    const cam = g.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const sp = this.spread + this.kickRot * 0.03;
    const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, dir);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
    dir.addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
    const hit = traceShot(g, origin, dir, 500);

    const muzzle = this.muzzleWorld();
    g.effects.tracer(muzzle, hit.point);
    g.effects.muzzle(muzzle, dir, false);
    g.effects.casing(this.viewPoint(s.model.userData.eject || s.model.userData.muzzle, new THREE.Vector3()),
      right.clone().multiplyScalar(rand(1.5, 2.5)).addScaledVector(up, rand(1, 2)).addScaledVector(dir, -0.5));
    g.audio.shot(def.sound, null, 0.9);
    g.alert(origin, 55);

    if (hit.npc) {
      const dmg = def.dmg * ZONE_MULT[hit.zone] * (hit.dist > 80 ? 0.8 : 1);
      const killed = hit.npc.takeDamage(dmg, dir, hit.zone, true);
      g.effects.blood(hit.point, dir);
      if (hit.npc.team === 'enemy') {
        this.stats.hits++;
        g.hud.hitmarker(killed, hit.zone === 'head');
        g.audio.hit(hit.zone === 'head');
        if (killed) { this.stats.kills++; if (hit.zone === 'head') this.stats.heads++; }
      }
    } else if (hit.normal) g.effects.impact(hit.point, hit.normal);

    // recoil
    this.kick += 0.03 + (this.aimT < 0.5 ? 0.01 : 0);
    this.kickRot += 0.05;
    p.recoilPitch += def.kick * (1 - this.aimT * 0.35);
    p.recoilYaw += (Math.random() - 0.5) * def.yawKick * 2;
    this.flashT = 0.05; s.flash.rotation.z = Math.random() * Math.PI;
  }

  throwGrenade() {
    const g = this.game;
    this.grenades--; this.throwT = 0.7;
    setTimeout(() => {
      const cam = g.camera;
      const o = cam.getWorldPosition(new THREE.Vector3());
      const d = cam.getWorldDirection(new THREE.Vector3());
      const v = d.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4, 0));
      g.grenades.push(new Grenade(g, o.addScaledVector(d, 0.6), v, 'player'));
      g.audio.click(900, 0.4);
    }, 350);
  }

  render(renderer) {
    if (!this.root.visible) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
