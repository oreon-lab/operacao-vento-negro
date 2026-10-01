// Owns every system and runs the frame loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Waiters } from '../core/utils.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Level } from '../world/Level.js';
import { Effects } from './Effects.js';
import { Player } from './Player.js';
import { Weapons } from './Weapons.js';
import { NPC } from './NPC.js';
import { HUD } from '../ui/HUD.js';
import { Director } from '../campaign/Director.js';

export class Game {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.autoClear = false;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 5000);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.waiters = new Waiters();
    this.time = 0; this.paused = false; this.difficulty = 1; this.timeScale = 1; this._skip = false;
    this.npcs = []; this.grenades = []; this.updatables = new Set();

    // image-based ambient so metal/plastic surfaces don't render pitch black
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.35;

    this.level = new Level(this.scene);
    this.effects = new Effects(this.scene, this.camera);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.weapons.scene.environment = env; this.weapons.scene.environmentIntensity = 0.9;
    this.hud = new HUD(this);
    this.director = new Director(this);
    const game = this;
    this.playerTarget = { isPlayer: true, get dead() { return game.player.dead; } };
    this.checkpoint = { pos: new THREE.Vector3(0, 0, 74), yaw: 0 };
    for (const p of this.level.burningCars) this.effects.addEmitter(p, 'fire');

    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
  }

  /** Cinematics flag: Enter fast-forwards while true. */
  get skippable() { return this._skip; }
  set skippable(v) { this._skip = v; if (!v) this.timeScale = 1; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.weapons.resize(w / h);
    const scale = (h * this.renderer.getPixelRatio() * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.effects.add.mat.uniforms.scale.value = this.effects.norm.mat.uniforms.scale.value = scale;
  }

  start() { this.renderer.setAnimationLoop(() => this.frame()); }

  frame() {
    // Preserve elapsed time on slower frames so recorded speech and flight agree.
    const dt = this.clock.getDelta() * this.timeScale;
    if (!this.paused) this.update(dt);
    this.render();
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    // Cinematics follow real elapsed time; physics stays bounded after a stall.
    const physicsDt = Math.min(0.05, dt);
    this.player.update(physicsDt);
    this.weapons.update(physicsDt);
    for (const u of this.updatables) u.update(dt);
    for (const n of this.npcs) n.update(physicsDt);
    for (const g of this.grenades) g.update(physicsDt);
    this.grenades = this.grenades.filter((g) => !g.done);
    this.effects.update(dt);
    this.level.update(dt, this.camera.getWorldPosition(_v));
    this.hud.update(dt);
    this.waiters.update();
    this.audio.setListener(this.camera);
    this.cullBodies();
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    this.weapons.render(r);
  }

  spawn(o) { const n = new NPC(this, o); this.npcs.push(n); return n; }
  spawnEnemy(o) { return this.spawn({ team: 'enemy', ...o }); }
  alive(list) { return list.filter((n) => !n.dead).length; }

  /** Gunfire/explosions wake up nearby enemies and give them a position to check. */
  alert(pos, radius) {
    for (const n of this.npcs) {
      if (n.team !== 'enemy' || n.dead || n.targetVisible) continue;
      if (n.pos.distanceTo(pos) >= radius) continue;
      if (n.alerted && this.time - n.lastSeen < 2.5) continue;
      n.hear(pos, 5);
    }
  }

  /** Nearby friendly gunfire only perks sentries up (no position to investigate). */
  wake(pos, radius) {
    for (const n of this.npcs) {
      if (n.team !== 'enemy' || n.dead || n.alerted) continue;
      if (n.pos.distanceTo(pos) < radius) n.alerted = true;
    }
  }

  /** One soldier shouts a sighting to nearby teammates. */
  callout(from, pos, radius = 34) {
    for (const n of this.npcs) {
      if (n.dead || n === from || n.team !== from.team || n.targetVisible) continue;
      if (n.pos.distanceTo(from.pos) > radius) continue;
      n.hear(pos, 5);
    }
  }

  onNPCKilled(npc) { this.kills = (this.kills || 0) + 1; }

  cullBodies() {
    const dead = this.npcs.filter((n) => n.dead);
    if (dead.length <= 14) return;
    const n = dead[0];
    n.root.removeFromParent();
    this.npcs.splice(this.npcs.indexOf(n), 1);
  }

  onPlayerDeath() {
    this.hud.flashNotice('VOCÊ FOI ABATIDO', 2800);
    document.querySelector('#deathfx').classList.add('show');
    setTimeout(() => {
      document.querySelector('#deathfx').classList.remove('show');
      this.player.spawn(this.checkpoint.pos, this.checkpoint.yaw);
      this.weapons.refill();
      for (const n of this.npcs) if (n.team === 'enemy' && !n.dead && n.pos.distanceTo(this.checkpoint.pos) < 12) n.kill(new THREE.Vector3());
      this.hud.flashNotice('CHECKPOINT');
    }, 3000);
  }

  setCheckpoint(pos, yaw = this.player.yaw) {
    this.checkpoint = { pos: pos.clone(), yaw };
    this.hud.flashNotice('CHECKPOINT', 1600);
  }
}
const _v = new THREE.Vector3();
