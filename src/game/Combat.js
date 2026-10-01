// Hitscan tracing, damage and grenades shared by player and NPCs.
import * as THREE from 'three';
import { buildGrenade } from '../models/weapons.js';

const ray = new THREE.Raycaster();
ray.layers.set(1);
const _n = new THREE.Vector3();

export const ZONE_MULT = { head: 3.6, body: 1, limb: 0.75 };

/** Nearest hit along a ray: world box or soldier hitbox. */
export function traceShot(game, origin, dir, maxDist = 400, ignore = null) {
  const wd = game.level.col.raycast(origin, dir, maxDist, _n);
  const boxes = [];
  for (const npc of game.npcs) if (!npc.dead && npc !== ignore && !npc.mounted) boxes.push(...npc.soldier.hitboxes);
  ray.set(origin, dir); ray.far = Math.min(maxDist, wd);
  const hits = ray.intersectObjects(boxes, false);
  if (hits.length) {
    const h = hits[0];
    return { dist: h.distance, point: h.point.clone(), npc: h.object.userData.soldier.npc, zone: h.object.userData.zone };
  }
  if (wd < maxDist) return { dist: wd, point: origin.clone().addScaledVector(dir, wd), normal: _n.clone() };
  return { dist: maxDist, point: origin.clone().addScaledVector(dir, maxDist) };
}

export class Grenade {
  constructor(game, pos, vel, thrower = 'player') {
    this.game = game;
    this.mesh = Grenade.template ? Grenade.template.clone() : (Grenade.template = buildGrenade()).clone();
    this.mesh.scale.setScalar(1.3);
    this.mesh.position.copy(pos);
    game.scene.add(this.mesh);
    this.vel = vel.clone(); this.fuse = 3; this.thrower = thrower; this.done = false;
  }

  update(dt) {
    this.fuse -= dt;
    const p = this.mesh.position, step = this.vel.length() * dt;
    this.vel.y -= 14 * dt;
    if (step > 0) {
      const dir = this.vel.clone().normalize();
      const d = this.game.level.col.raycast(p, dir, step + 0.05, _n);
      if (d < step + 0.05) { // bounce off walls
        this.vel.reflect(_n).multiplyScalar(0.4);
      }
    }
    p.addScaledVector(this.vel, dt);
    const g = this.game.level.col.groundAt(p.x, p.z, 0.05, p.y + 0.1, 0.2);
    if (p.y < g + 0.05) { p.y = g + 0.05; this.vel.y = Math.abs(this.vel.y) * 0.3; this.vel.x *= 0.6; this.vel.z *= 0.6; }
    this.mesh.rotation.x += dt * this.vel.length() * 2;
    if (this.fuse <= 0) this.explode();
  }

  explode() {
    this.done = true;
    const game = this.game, p = this.mesh.position.clone();
    p.y += 0.2;
    this.mesh.removeFromParent();
    game.effects.explosion(p);
    game.audio.explosion(p);
    game.alert(p, 80);
    const R = 8;
    for (const npc of game.npcs) {
      if (npc.dead || npc.mounted) continue;
      const c = npc.chestPos();
      const d = c.distanceTo(p);
      if (d < R && game.level.col.lineOfSight(p, c)) npc.takeDamage(160 * (1 - d / R) + 20, c.clone().sub(p).normalize(), 'body', this.thrower === 'player');
    }
    const pe = game.player.eyePos();
    const dp = pe.distanceTo(p);
    game.effects.shake = Math.min(1.5, game.effects.shake + Math.max(0, 1.4 - dp / 25));
    if (dp < R && game.level.col.lineOfSight(p, pe)) game.player.damage(130 * (1 - dp / R), p);
  }
}
