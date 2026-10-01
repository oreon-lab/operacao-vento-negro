// Campaign scripting primitives: dialogue (subtitles + radio + TTS), objectives,
// helicopter flights and seated-cabin cinematics.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { VoiceTracks } from '../core/VoiceTracks.js';
import dialogue from './dialogue.json';

export const CAST = {
  moreira: { name: 'Cap. Moreira', color: '#f2c14e', pitch: 0.8, rate: 1.05 },
  vieira: { name: 'Sgt. Vieira', color: '#8fd3ff', pitch: 1.0, rate: 1.1 },
  souza: { name: 'Cb. Souza', color: '#9be08a', pitch: 0.7, rate: 1.1 },
  lima: { name: 'Sd. Lima', color: '#ffa98a', pitch: 1.2, rate: 1.15 },
  piloto: { name: 'Falcão 1-1', color: '#c7b8ff', pitch: 1.05, rate: 1.1, radio: true },
  hq: { name: 'Comando', color: '#c7b8ff', pitch: 0.9, rate: 1.0, radio: true },
};

let voice = null;
function pickVoice() {
  const vs = globalThis.speechSynthesis?.getVoices?.() || [];
  voice = vs.find((v) => /pt-BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
}
if (typeof speechSynthesis !== 'undefined') { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export class Director {
  constructor(game) {
    this.game = game; this.tts = true; this.line = Promise.resolve();
    this.tracks = new VoiceTracks(game.audio);
    this.speaker = null; this.cancelSpeech = null;
  }

  prepare() { return this.tracks.load(); }

  lineDuration(who, text) {
    return (this.tts && this.tracks.duration(who, text)) || Math.max(1.6, text.length * 0.055);
  }

  sequenceDuration(lines) {
    return lines.reduce((total, [who, text]) => total + this.lineDuration(who, text) + 0.25, 0);
  }

  blockDuration(first, last) {
    const from = dialogue.findIndex(line => line.id === first);
    const to = dialogue.findIndex(line => line.id === last);
    return this.sequenceDuration(dialogue.slice(from, to + 1).map(line => [line.who, line.text]));
  }

  skip() {
    this.tracks.stop();
    this.cancelSpeech?.();
    globalThis.speechSynthesis?.cancel();
    this.game.hud.subtitle(null);
  }

  wait(sec) { const t = this.game.time + sec; return this.game.waiters.until(() => this.game.time >= t); }
  until(pred) { return this.game.waiters.until(pred); }

  /** Queue a line so it never cuts off the one still playing. */
  say(who, text, extra = 0) {
    this.line = this.line.then(() => this.speakLine(who, text, extra));
    return this.line;
  }

  /** Fire the utterance; resolves when the voice is done (no-op without TTS). */
  speak(text, c) {
    if (!this.tts || !voice || typeof speechSynthesis === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.pitch = c.pitch; u.rate = c.rate; u.volume = 0.9;
      const done = () => resolve();
      this.cancelSpeech = done;
      u.onend = done; u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }

  /** Speak a line; the subtitle stays up until the voice finishes. */
  async speakLine(who, text, extra = 0) {
    const c = CAST[who];
    const g = this.game;
    if (g.skippable && g.timeScale > 1) return;
    await g.waiters.until(() => !g.paused);
    if (g.skippable && g.timeScale > 1) return;
    this.speaker = who;
    if (c.radio) g.audio.radio();
    g.hud.subtitle(c.name, text, c.color);
    const t0 = g.time;
    const recorded = this.tts ? this.tracks.play(who, text, c.radio) : null;
    if (recorded) {
      await recorded;
      if (extra > 0) await this.wait(extra);
    } else {
      const minDur = Math.max(1.6, text.length * 0.055) + extra;
      await Promise.all([
        g.waiters.until(() => g.time - t0 >= minDur),
        Promise.race([this.speak(text, c), this.wait(minDur + Math.max(3, text.length * 0.1))]),
      ]);
      this.cancelSpeech = null;
      globalThis.speechSynthesis?.cancel();
    }
    await g.waiters.until(() => !g.paused);
    this.speaker = null;
    g.hud.subtitle(null);
    await this.wait(0.25);
  }

  objective(text, waypoint = null) {
    this.game.hud.setObjective(text);
    this.game.hud.setWaypoint(waypoint);
    if (text) this.game.audio.click(700, 0.25);
  }
}

/** Moves a Helicopter along a Catmull-Rom path with banking/pitch derived from motion. */
export class Flight {
  constructor(heli, points, duration, { ease = 'out', hoverBob = true } = {}) {
    this.heli = heli;
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.T = duration; this.t = 0; this.ease = ease; this.hoverBob = hoverBob;
    this.prevYaw = null; this.bank = 0; this.pitch = 0; this.done = false;
    this.extraRoll = 0;
    this.yaw = heli.root.userData.flightHeading ?? null;
  }

  u(x) {
    x = clamp(x, 0, 1);
    if (this.ease === 'out') return 1 - Math.pow(1 - x, 2.2);
    if (this.ease === 'in') return Math.pow(x, 2);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  update(dt) {
    this.t = Math.min(this.T, this.t + dt);
    const x = this.t / this.T;
    const u = this.u(x), u2 = this.u(x + 0.01);
    const p = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(Math.min(0.999, u));
    const speed = (u2 - u) * this.curve.getLength() / (this.T * 0.01);
    const targetYaw = Math.atan2(-tan.x, -tan.z);
    if (this.yaw == null) this.yaw = targetYaw;
    const turn = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += turn * (1 - Math.exp(-dt * 3));
    const yaw = this.yaw;
    this.heli.root.userData.flightHeading = yaw;
    if (this.prevYaw == null) this.prevYaw = yaw;
    let dy = yaw - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.prevYaw = yaw;
    const yawRate = dt > 0 ? dy / dt : 0;
    this.bank += (clamp(-yawRate * 0.9, -0.5, 0.5) - this.bank) * Math.min(1, dt * 2);
    this.pitch += (clamp(-speed / 160, -0.25, 0.05) + (x > 0.85 && this.ease === 'out' ? 0.08 : 0) - this.pitch) * Math.min(1, dt * 1.5);
    this.extraRoll *= Math.max(0, 1 - dt * 2);
    const tt = this.heli.time;
    const bob = this.hoverBob ? Math.sin(tt * 1.3) * 0.15 : 0;
    const r = this.heli.root;
    r.position.set(p.x, p.y + bob, p.z);
    r.rotation.order = 'YXZ';
    r.rotation.set(this.pitch + Math.sin(tt * 0.9) * 0.01, yaw, this.bank + this.extraRoll + Math.sin(tt * 0.7) * 0.012);
    this.speed = speed;
    if (this.t >= this.T) this.done = true;
  }
}

/** Seated first-person view inside a helicopter cabin with limited free look. */
export class CabinView {
  constructor(game, heli, seat) {
    this.game = game; this.heli = heli;
    this.seat = seat; // local position
    this.yaw = 0; this.pitch = -0.05;
  }

  attach() {
    const cam = this.game.camera;
    this.heli.body.add(cam);
    cam.position.copy(this.seat);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
    cam.fov = 72; cam.updateProjectionMatrix();
    this.game.player.enabled = false;
  }

  detach() {
    const cam = this.game.camera;
    this.game.scene.attach(cam);
  }

  update(dt) {
    const m = this.game.input.mouse, g = this.game;
    this.yaw = clamp(this.yaw - m.dx * 0.002, -1.9, 1.9);
    this.pitch = clamp(this.pitch - m.dy * 0.002, -0.9, 0.7);
    const cam = g.camera, sh = g.effects.shake, t = g.time;
    cam.position.set(this.seat.x + Math.sin(t * 23) * 0.004, this.seat.y + Math.sin(t * 19) * 0.006, this.seat.z);
    cam.rotation.set(this.pitch + Math.sin(t * 41) * sh * 0.03, this.yaw + Math.sin(t * 37) * sh * 0.03, Math.sin(t * 29) * sh * 0.02);
  }
}
