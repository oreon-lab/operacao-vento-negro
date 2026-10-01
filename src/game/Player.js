// First-person controller: movement, collision, stance, health regen, camera.
import * as THREE from 'three';
import { clamp, damp } from '../core/utils.js';

const STAND = 1.72, CROUCH = 1.15, RADIUS = 0.35;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.height = STAND; this.crouching = false; this.sprinting = false;
    this.onGround = true;
    this.health = 100; this.lastHurt = -99; this.dead = false;
    this.bobPhase = 0; this.bobAmt = 0; this.landDip = 0;
    this.stepDist = 0;
    this.enabled = false;
    this.speed = 0;
    this.sens = 0.0022;
  }

  spawn(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.dead = false; this.height = STAND; this.crouching = false;
  }

  get eye() { return this.pos.y + this.height - 0.1; }
  get moving() { return this.speed > 0.5; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.eye, this.pos.z); }

  damage(amount, fromPos) {
    if (this.dead || this.game.godMode) return;
    this.health -= amount;
    this.lastHurt = this.game.time;
    this.game.hud.damageFrom(fromPos, this);
    this.game.audio.hurt();
    this.game.effects.shake = Math.min(1, this.game.effects.shake + 0.25);
    if (this.health <= 0) { this.health = 0; this.dead = true; this.game.onPlayerDeath(); }
  }

  update(dt) {
    const { input, level } = this.game;
    const cam = this.game.camera;
    if (this.enabled && !this.dead) {
      const zoom = this.game.weapons?.aim ? 0.6 : 1;
      this.yaw -= input.mouse.dx * this.sens * zoom;
      this.pitch = clamp(this.pitch - input.mouse.dy * this.sens * zoom, -1.45, 1.45);

      if (input.hit('KeyC') || input.hit('ControlLeft')) this.crouching = !this.crouching;
      let fx = 0, fz = 0;
      if (input.down('KeyW')) fz -= 1; if (input.down('KeyS')) fz += 1;
      if (input.down('KeyA')) fx -= 1; if (input.down('KeyD')) fx += 1;
      const len = Math.hypot(fx, fz) || 1; fx /= len; fz /= len;
      this.sprinting = input.down('ShiftLeft') && fz < 0 && !this.game.weapons?.aim;
      if (this.sprinting) this.crouching = false;
      const speed = this.sprinting ? 6.6 : this.crouching ? 2.2 : this.game.weapons?.aim ? 2.6 : 4.2;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const tx = (fx * c + fz * s) * speed, tz = (-fx * s + fz * c) * speed;
      const k = this.onGround ? 12 : 2;
      this.vel.x = damp(this.vel.x, tx, k, dt); this.vel.z = damp(this.vel.z, tz, k, dt);
      if (input.hit('Space') && this.onGround) { this.vel.y = 5.6; this.onGround = false; this.crouching = false; }
    } else {
      this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt);
    }

    // stance height (can't stand up under something)
    const target = this.crouching ? CROUCH : STAND;
    this.height = damp(this.height, target, 12, dt);

    // integrate + collide
    this.vel.y -= 18 * dt;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    level.col.resolve(this.pos, RADIUS, this.height);
    // soft mission boundary
    const bx = this.pos.x, bz = this.pos.z - 5, bd = Math.hypot(bx, bz);
    if (bd > 96) { this.pos.x = (bx / bd) * 96; this.pos.z = (bz / bd) * 96 + 5; }
    this.pos.y += this.vel.y * dt;
    const ground = level.col.groundAt(this.pos.x, this.pos.z, RADIUS * 0.7, prevY);
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -6) this.landDip = 0.12;
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) this.onGround = false;

    // regen (CoD style)
    if (!this.dead && this.game.time - this.lastHurt > 4.5) this.health = Math.min(100, this.health + 22 * dt);

    // bob & footsteps
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.speed > 0.5) {
      this.bobPhase += dt * this.speed * 1.9;
      this.stepDist += this.speed * dt;
      if (this.stepDist > (this.sprinting ? 2.4 : 1.9)) { this.stepDist = 0; this.game.audio.step(this.sprinting); }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround ? clamp(this.speed / 5, 0, 1.3) : 0, 8, dt);
    this.landDip = damp(this.landDip, 0, 6, dt);

    // recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, this.game.input.mouse.left ? 2.6 : 6.5, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 6, dt);

    if (this.enabled) this.applyCamera(cam);
  }

  applyCamera(cam) {
    const shake = this.game.effects.shake;
    const t = this.game.time;
    const aimK = this.game.weapons?.aim ? 0.25 : 1;
    cam.position.set(
      this.pos.x + Math.cos(this.bobPhase) * 0.035 * this.bobAmt * aimK,
      this.eye + Math.abs(Math.sin(this.bobPhase)) * 0.05 * this.bobAmt * aimK - this.landDip,
      this.pos.z,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + this.recoilPitch + Math.sin(t * 43) * shake * 0.02,
      this.yaw + this.recoilYaw + Math.sin(t * 37) * shake * 0.02,
      Math.sin(this.bobPhase * 0.5) * 0.006 * this.bobAmt + Math.sin(t * 29) * shake * 0.01,
    );
  }
}
