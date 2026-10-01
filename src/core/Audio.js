// Synthesized effects and a separate dialogue bus for recorded voice tracks.
import * as THREE from 'three';

export class Audio {
  constructor() { this.ctx = null; }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.dialogue = ctx.createGain(); this.dialogue.gain.value = 0.9;
    this.dialogue.connect(comp);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
  }

  get t() { return this.ctx.currentTime; }

  duck(on) {
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.32 : 0.8, this.t, 0.12);
  }

  setPaused(paused) {
    if (!this.ctx) return;
    if (paused) return this.ctx.suspend();
    return this.ctx.resume();
  }

  src(loop = false) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }
  filter(type, f, q = 1) { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
  env(peak, a, d, t0 = this.t) {
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    return g;
  }
  /** Output node: positional when pos is given. */
  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.getWorldPosition(_v), f = cam.getWorldDirection(_f);
    this.lastCam = (this.lastCam || new THREE.Vector3()).copy(p);
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  shot(kind = 'rifle', pos = null, vol = 1) {
    if (!this.ctx) return;
    const t = this.t, o = this.out(pos);
    const far = pos && this.lastCam ? Math.min(1, pos.distanceTo(this.lastCam) / 80) : 0;
    // crack
    const n = this.src(), hp = this.filter('lowpass', (kind === 'pistol' ? 5000 : 7000) * (1 - far * 0.7));
    const g = this.env((kind === 'ak' ? 1.0 : 0.9) * vol, 0.002, kind === 'pistol' ? 0.12 : 0.18);
    n.connect(hp).connect(g).connect(o); n.start(t); n.stop(t + 0.4);
    // body thump
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'ak' ? 150 : 180, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const og = this.env(0.9 * vol, 0.002, 0.14);
    osc.connect(og).connect(o); osc.start(t); osc.stop(t + 0.2);
    // tail / echo off buildings
    const n2 = this.src(), lp = this.filter('lowpass', 900);
    const g2 = this.env(0.25 * vol, 0.03, 0.9, t + 0.02);
    n2.connect(lp).connect(g2).connect(o); n2.start(t); n2.stop(t + 1.2);
  }

  explosion(pos) {
    if (!this.ctx) return;
    const t = this.t, o = this.out(pos);
    const n = this.src(), lp = this.filter('lowpass', 3000);
    lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    const g = this.env(2.2, 0.005, 2.2);
    n.connect(lp).connect(g).connect(o); n.start(t); n.stop(t + 2.5);
    const osc = this.ctx.createOscillator(); osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(25, t + 0.6);
    const og = this.env(1.6, 0.005, 0.8); osc.connect(og).connect(o); osc.start(t); osc.stop(t + 1);
  }

  click(freq = 2500, vol = 0.3, delay = 0) {
    if (!this.ctx) return;
    const t = this.t + delay;
    const n = this.src(), bp = this.filter('bandpass', freq, 3), g = this.env(vol, 0.001, 0.05, t);
    n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.1);
  }

  reload(dur) {
    this.click(1800, 0.4, 0.15); this.click(900, 0.3, 0.25); // mag out
    this.click(1400, 0.5, dur * 0.65); this.click(2600, 0.3, dur * 0.7); // mag in
    this.click(3200, 0.45, dur * 0.88); // bolt
  }

  hit(head = false) {
    if (!this.ctx) return;
    const t = this.t, o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.value = head ? 1800 : 1200;
    const g = this.env(0.07, 0.001, 0.06); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.t, n = this.src(), lp = this.filter('lowpass', 400), g = this.env(0.7, 0.005, 0.25);
    n.connect(lp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.3);
  }

  whiz() {
    if (!this.ctx) return;
    const t = this.t, n = this.src(), bp = this.filter('bandpass', 3000, 6);
    bp.frequency.setValueAtTime(4500, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.15);
    const g = this.env(0.25, 0.01, 0.15); n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.2);
  }

  step(run) {
    if (!this.ctx) return;
    const t = this.t, n = this.src(), lp = this.filter('lowpass', run ? 900 : 650);
    const g = this.env(run ? 0.22 : 0.13, 0.005, 0.09); n.connect(lp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.15);
  }

  radio() {
    if (!this.ctx) return;
    const t = this.t, n = this.src(), bp = this.filter('bandpass', 2200, 1.5), g = this.env(0.18, 0.005, 0.14);
    n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.2);
    const o = this.ctx.createOscillator(); o.frequency.value = 1600; const og = this.env(0.05, 0.005, 0.08, t + 0.02);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.15);
  }

  /** Continuous rotor sound; returns controller {set(vol, pos)}. */
  rotor() {
    const ctx = this.ctx;
    const n = this.src(true), lp = this.filter('lowpass', 500);
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 5.2;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45; lfo.connect(lfoAmt).connect(chop.gain);
    const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 62;
    const wlp = this.filter('lowpass', 300); const wg = ctx.createGain(); wg.gain.value = 0.12;
    const turb = ctx.createOscillator(); turb.frequency.value = 2900; const tg = ctx.createGain(); tg.gain.value = 0.012;
    const vol = ctx.createGain(); vol.gain.value = 0;
    const pan = ctx.createPanner(); pan.panningModel = 'equalpower'; pan.refDistance = 12; pan.rolloffFactor = 0.8;
    n.connect(lp).connect(chop).connect(vol);
    whine.connect(wlp).connect(wg).connect(vol); turb.connect(tg).connect(vol);
    vol.connect(pan).connect(this.master);
    for (const s of [n, lfo, whine, turb]) s.start();
    let stopped = false;
    return {
      set: (v, pos) => {
        if (stopped) return;
        vol.gain.setTargetAtTime(v, this.t, 0.3);
        if (pos) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
      },
      interior: (on) => { lp.frequency.setTargetAtTime(on ? 380 : 700, this.t, 0.3); },
      stop: () => {
        if (stopped) return;
        stopped = true;
        for (const source of [n, lfo, whine, turb]) source.stop();
        for (const node of [n, lp, chop, lfo, lfoAmt, whine, wlp, wg, turb, tg, vol, pan]) node.disconnect();
      },
    };
  }

  startWind() {
    const n = this.src(true), lp = this.filter('lowpass', 380), g = this.ctx.createGain(); g.gain.value = 0.07;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13; const a = this.ctx.createGain(); a.gain.value = 0.04;
    lfo.connect(a).connect(g.gain); lfo.start();
    n.connect(lp).connect(g).connect(this.master); n.start();
  }
}
const _v = new THREE.Vector3(), _f = new THREE.Vector3();
