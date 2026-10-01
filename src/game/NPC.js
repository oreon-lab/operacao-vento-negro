// Soldier AI shared by squadmates and insurgents.
import * as THREE from 'three';
import { Soldier } from '../models/soldier.js';
import { clamp, damp, rand } from '../core/utils.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class NPC {
  /**
   * @param {object} game
   * @param {object} o  {team:'ally'|'enemy', type, name, pos, yaw, hp, static, goal}
   */
  constructor(game, o) {
    this.game = game;
    this.team = o.team;
    this.name = o.name || '';
    this.soldier = new Soldier({ type: o.type || (o.team === 'ally' ? 'friendly' : 'enemy'), weapon: o.weapon || (o.team === 'ally' ? 'm4' : 'ak'), seed: o.seed ?? Math.floor(Math.random() * 1e6) });
    this.soldier.npc = this;
    this.root = this.soldier.root;
    this.pos = this.root.position;
    this.pos.copy(o.pos || _v.set(0, 0, 0));
    this.yaw = o.yaw ?? 0; this.root.rotation.y = this.yaw;
    this.hp = o.hp ?? (o.team === 'ally' ? 1e9 : 100);
    this.invulnerable = o.team === 'ally';
    this.static = !!o.static; // rooftop shooters hold position
    this.goal = o.goal ? o.goal.clone() : null;
    this.run = false;
    this.dead = false; this.deadT = 0;
    this.target = null; this.targetVisible = false; this.lastSeen = -99; this.lastSeenPos = new THREE.Vector3();
    this.informed = false;
    this.alerted = !!o.alerted;
    this.thinkT = Math.random() * 0.3;
    this.burst = 0; this.shotT = rand(0.8, 1.6); this.reaction = 0;
    this.coverT = rand(1, 3); this.peek = true;
    this.useCover = !!o.cover;
    this.accuracy = o.accuracy ?? (o.team === 'ally' ? 0.24 : 0.3);
    this.stuckT = 0; this.sideStep = 0; this.lastPos = this.pos.clone();
    this.searchPos = this.pos.clone();
    this.searchDone = false;
    this.lastTarget = null;
    this.shuffleT = rand(0.4, 1.4); this.shuffleDir = 1;
    this.scanT = 0; this.scanYaw = this.yaw;
    this.mounted = false;
    this.gameY = this.pos.y;
    this.soldier.carry = 'low';
    game.scene.add(this.root);
  }

  chestPos(out = new THREE.Vector3()) { return this.soldier.b.chest.localToWorld(out.set(0, 0.12, 0)); }
  eyePos(out = new THREE.Vector3()) { return this.soldier.headWorld(out); }

  /** Learning about a sighting or a noise: stay alert and remember the spot. */
  hear(pos, spread = 0) {
    if (this.dead) return;
    this.alerted = true;
    this.informed = true;
    this.lastSeenPos.copy(pos);
    if (spread) { this.lastSeenPos.x += rand(-spread, spread); this.lastSeenPos.z += rand(-spread, spread); }
    this.lastSeen = this.game.time;
    if (!this.searchDone || this.searchPos.distanceTo(this.lastSeenPos) > 4) {
      this.searchPos.copy(this.lastSeenPos);
      this.searchDone = false;
    }
  }

  takeDamage(dmg, dir, zone, byPlayer) {
    if (this.dead) return false;
    this.alerted = true;
    if (byPlayer && this.team === 'enemy') {
      this.target = this.game.playerTarget;
      this.reaction = rand(0.25, 0.5);
      this.hear(this.game.player.eyePos(_v), 2.5);
    }
    if (this.useCover) { this.peek = false; this.coverT = rand(1.2, 2.2); }
    if (this.invulnerable) return false;
    this.hp -= dmg;
    if (this.hp <= 0) { this.kill(dir); return true; }
    this.soldier.crouchTarget = this.useCover ? 1 : 0;
    return false;
  }

  kill(dir) {
    this.dead = true;
    this.soldier.die(dir);
    this.game.onNPCKilled(this);
  }

  /** Candidate targets from the opposing team (nearest visible wins, current target preferred). */
  findTarget() {
    const g = this.game, eye = this.eyePos(_a);
    const range = this.alerted ? 90 : 45;
    let best = null, bestScore = Infinity;
    const consider = (t, chest, weight = 1) => {
      const d = eye.distanceTo(chest);
      if (d > range) return;
      // unaware enemies only notice in front of them
      if (!this.alerted) {
        _w.subVectors(chest, eye).setY(0).normalize();
        const fwd = _b.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        if (fwd.dot(_w) < 0.2) return;
      }
      if (!g.level.col.lineOfSight(eye, chest)) return;
      const score = d * weight * (t === this.target ? 0.7 : 1);
      if (score < bestScore) { bestScore = score; best = t; }
    };
    if (this.team === 'enemy') {
      if (g.player.enabled && !g.player.dead) consider(g.playerTarget, g.player.eyePos(_v).setY(g.player.eye - 0.3), 0.85);
      for (const n of g.npcs) if (n.team === 'ally' && !n.dead && !n.mounted) consider(n, n.chestPos(_v));
    } else {
      for (const n of g.npcs) if (n.team === 'enemy' && !n.dead && !n.mounted && !n.stealth) consider(n, n.chestPos(_v));
    }
    return best;
  }

  targetPoint(out) {
    const t = this.target;
    if (t === this.game.playerTarget) return this.game.player.eyePos(out).setY(this.game.player.eye - 0.35);
    return t.chestPos(out);
  }

  update(dt) {
    const s = this.soldier;
    if (this.mounted) { s.update(dt); return; }
    if (this.dead) { this.deadT += dt; if (this.deadT < 3) s.update(dt); return; }
    const g = this.game;

    // --- perception -------------------------------------------------------------
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.25 + Math.random() * 0.15;
      if (this.target && (this.target.dead || (this.target === g.playerTarget && g.player.dead))) this.target = null;
      const t = this.findTarget();
      if (t) {
        const fresh = t !== this.target;
        if (fresh) this.reaction = this.team === 'enemy' ? rand(0.5, 1.0) : rand(0.2, 0.5);
        this.target = t; this.targetVisible = true; this.lastSeen = g.time; this.alerted = true; this.informed = true;
        this.targetPoint(this.lastSeenPos);
        this.searchPos.copy(this.lastSeenPos).add(_b.set(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
        this.searchDone = false;
        if (fresh && t !== this.lastTarget) { this.lastTarget = t; g.callout(this, this.lastSeenPos); }
      } else {
        this.targetVisible = false;
        if (this.target && this.informed && g.time - this.lastSeen > 24 && !this.goal) { this.target = null; this.alerted = false; }
      }
    }
    const engaged = this.target && this.targetVisible;

    // --- movement ----------------------------------------------------------------
    let speed = 0;
    if (!this.static) {
      let goal = this.goal;
      const atGoal = goal ? this.pos.distanceTo(goal) < 2.5 : false;
      const searching = this.team === 'enemy' && this.alerted && !this.targetVisible && this.informed && g.time - this.lastSeen < 14;
      if (searching && (!goal || atGoal)) goal = this.searchPos;
      if (goal) {
        _v.subVectors(goal, this.pos).setY(0);
        const d = _v.length();
        if (d > (goal === this.searchPos ? 4.5 : 0.6)) {
          const max = engaged ? 1.6 : this.run ? 4.2 : 2.2;
          speed = Math.min(max, d * 2);
          _v.normalize();
          if (this.sideStep > 0) { this.sideStep -= dt; _v.set(_v.z * this.sideDir, 0, -_v.x * this.sideDir); }
          this.pos.addScaledVector(_v, speed * dt);
          if (!engaged) this.faceYaw(Math.atan2(_v.x, _v.z), dt, 6);
          // stuck detection -> sidestep
          this.stuckT += dt;
          if (this.stuckT > 0.8) {
            if (this.pos.distanceTo(this.lastPos) < 0.3) { this.sideStep = 0.9; this.sideDir = Math.random() < 0.5 ? 1 : -1; }
            this.stuckT = 0; this.lastPos.copy(this.pos);
          }
        } else if (goal === this.goal && this.goalYaw != null && !engaged) this.faceYaw(this.goalYaw, dt, 4);
        else if (this.alerted && !engaged) { if (goal === this.searchPos) this.searchDone = true; this.scan(dt); }
      } else if (this.team === 'enemy' && this.alerted && this.informed && g.time - this.lastSeen < 24) {
        this.scan(dt);
      }
      if (engaged && !this.useCover) this.shuffle(dt);
      const y = this.pos.y;
      g.level.col.resolve(this.pos, 0.34, 1.7);
      this.pos.y = g.level.col.groundAt(this.pos.x, this.pos.z, 0.2, y);
    } else if (!engaged && this.alerted && this.informed && g.time - this.lastSeen < 24) {
      this.scan(dt);
    }
    s.speed = damp(s.speed, speed, 8, dt);

    // --- combat -----------------------------------------------------------------
    if (engaged) {
      const tp = this.targetPoint(_w);
      _v.subVectors(tp, this.pos);
      this.faceYaw(Math.atan2(_v.x, _v.z), dt, 8);
      const flat = Math.hypot(_v.x, _v.z);
      s.aimPitch = clamp(Math.atan2(tp.y - (this.pos.y + 1.45), flat), -0.8, 0.8);
      s.carry = 'aim';
      this.reaction -= dt;
      // cover behaviour: pop up to shoot, duck to reload
      if (this.useCover) {
        this.coverT -= dt;
        if (this.coverT <= 0) { this.peek = !this.peek; this.coverT = this.peek ? rand(2, 3.5) : rand(1, 2); }
        s.crouchTarget = this.peek ? 0 : 1;
      }
      if (this.reaction <= 0 && (!this.useCover || this.peek)) {
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.burst <= 0) this.burst = Math.floor(rand(3, 7));
          this.fireAt(tp);
          this.burst--;
          this.shotT = this.burst > 0 ? 0.11 : this.team === 'ally' ? rand(0.55, 1.1) : rand(0.7, 1.6);
        }
      }
    } else {
      s.aimPitch = damp(s.aimPitch, 0, 4, dt);
      s.carry = this.alerted ? 'aim' : 'low';
      if (this.useCover && this.alerted) s.crouchTarget = 1;
    }
    this.root.rotation.y = this.yaw;
    s.update(dt);
  }

  faceYaw(target, dt, k) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, k * dt);
  }

  /** Slow side-step while trading fire so they are not static targets. */
  shuffle(dt) {
    this.shuffleT -= dt;
    if (this.shuffleT <= 0) { this.shuffleT = rand(0.7, 1.7); this.shuffleDir = Math.random() < 0.5 ? -1 : 1; }
    const rate = this.team === 'ally' ? 0.8 : 1.1;
    this.pos.x += Math.cos(this.yaw) * this.shuffleDir * rate * dt;
    this.pos.z -= Math.sin(this.yaw) * this.shuffleDir * rate * dt;
  }

  /** Sweep the weapon around while holding at a search spot. */
  scan(dt) {
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = rand(1.2, 2.6); this.scanYaw = this.yaw + rand(-1.5, 1.5); }
    this.faceYaw(this.scanYaw, dt, 1.4);
  }

  fireAt(tp) {
    const g = this.game, s = this.soldier;
    const muzzle = s.muzzleWorld(new THREE.Vector3());
    s.recoil = 1;
    g.effects.muzzle(muzzle, _a.subVectors(tp, muzzle).normalize(), false);
    g.audio.shot(s.gunKind === 'ak' ? 'ak' : 'rifle', muzzle, this.team === 'ally' ? 0.55 : 0.8);
    if (this.team === 'enemy') g.wake(muzzle, 40);

    const dist = muzzle.distanceTo(tp);
    let chance = this.accuracy * clamp(1.2 - dist / 70, 0.25, 1.1);
    const isPlayer = this.target === g.playerTarget;
    if (isPlayer) {
      const p = g.player;
      if (p.crouching) chance *= 0.65;
      if (p.speed > 3) chance *= 0.7;
      chance *= g.difficulty;
      if (g.time - p.lastHurt < 0.5) chance *= 0.5; // spread damage out a bit
    }
    const hit = Math.random() < chance;
    const end = tp.clone();
    if (!hit) end.add(_b.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(0.6 + dist * 0.03));
    // bullets still stop at walls
    const dir = _v.subVectors(end, muzzle).normalize();
    const wd = g.level.col.raycast(muzzle, dir, 300, _w);
    const blocked = wd < muzzle.distanceTo(end) - 0.2;
    const impact = blocked ? muzzle.clone().addScaledVector(dir, wd) : end;
    if (Math.random() < 0.3) g.effects.tracer(muzzle, impact);

    if (hit && !blocked) {
      if (isPlayer) g.player.damage(rand(8, 13), muzzle);
      else this.target.takeDamage(this.team === 'ally' ? rand(12, 22) : 10, dir.clone(), 'body', false), g.effects.blood(impact, dir);
    } else {
      if (blocked || dist > 0) {
        const n = blocked ? _w : null;
        if (blocked) g.effects.impact(impact, n.clone());
      }
      if (isPlayer && !blocked) {
        // near miss
        const pe = g.player.eyePos(_a);
        if (pe.distanceTo(impact) < 4 || Math.random() < 0.3) g.audio.whiz();
      }
    }
  }
}
