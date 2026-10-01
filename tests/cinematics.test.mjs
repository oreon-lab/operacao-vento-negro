import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import * as THREE from 'three';

const bundled = await build({ stdin: { contents: `
  export { Director, Flight, CabinView } from './src/campaign/Director.js';
  export { Mission1 } from './src/campaign/Mission1.js';
  export { Waiters } from './src/core/utils.js';
  export { VoiceTracks } from './src/core/VoiceTracks.js';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'headless-models', setup(api) {
    api.onLoad({ filter: /models[\\/]helicopter\.js$/ }, () => ({ contents: `
      import * as THREE from 'three';
      export class Helicopter {
        constructor() { this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body); this.time = 0; }
        update(dt) { this.time += dt; }
      }`, resolveDir: process.cwd(), loader: 'js' }));
    api.onLoad({ filter: /models[\\/]props\.js$/ }, () => ({ contents: 'export function technical() {}', loader: 'js' }));
  } }] });
const { Director, Flight, CabinView, Mission1, Waiters, VoiceTracks } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const manifest = JSON.parse(await fs.readFile('public/assets/voices/manifest.json', 'utf8'));
const catalog = JSON.parse(await fs.readFile('src/campaign/dialogue.json', 'utf8'));
assert.equal(manifest.lines.length, 30);
assert.equal(manifest.model, 'eleven_v4', 'Voice pack must use Eleven v4');
for (const line of catalog) {
  const track = manifest.lines.find(t => t.who === line.who && t.text === line.text);
  assert.ok(track, `Missing voice: ${line.id}`);
  assert.equal(track.model, 'eleven_v4', `Old-model recording: ${line.id}`);
  assert.ok(track.tags.length > 0, `Missing delivery direction: ${line.id}`);
  assert.equal(track.spokenText.replace(/\[[^\]]*\]\s*/g, '').trim(), line.text);
  assert.ok(!/\[[^\]]*\]/.test(track.text), 'Audio directions leaked into subtitles');
  assert.ok((await fs.stat(`public/assets/voices/${track.file}`)).size > 1000);
}
assert.equal(new Set(manifest.lines.map(l => l.voiceId)).size, 5);
const captain = manifest.lines.filter(line => line.who === 'moreira');
assert.equal(new Set(captain.map(line => line.voiceId)).size, 1, 'Captain changes voice between lines');
assert.notEqual(captain[0].voiceId, 'pNInz6obpgDQGcFmaJgB', 'Captain still uses the rejected voice');

// A completed flight must stay at its endpoint even if dialogue continues.
const heli = { root: new THREE.Group(), time: 0 };
const flight = new Flight(heli, [new THREE.Vector3(0, 30, 100), new THREE.Vector3(2, 0.45, 80)], 2, { hoverBob: false });
flight.update(2); const landed = heli.root.position.clone();
flight.update(60);
assert.ok(flight.done); assert.equal(flight.t, 2); assert.ok(heli.root.position.equals(landed));
const next = new Flight(heli, [landed, new THREE.Vector3(10, 8, 90)], 5);
const yaw = heli.root.rotation.y;
next.update(0);
assert.equal(heli.root.rotation.y, yaw, 'Flight leg transition snaps the heading');

// Returning from a parented cabin restores a usable scene camera.
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
scene.add(camera); heli.body = new THREE.Group(); heli.root.add(heli.body); scene.add(heli.root);
const cabin = new CabinView({ scene, camera, player: { enabled: true } }, heli, new THREE.Vector3(0.3, 1.86, 1.28));
cabin.attach(); const world = camera.getWorldPosition(new THREE.Vector3()); cabin.detach();
assert.equal(camera.parent, scene); assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(world) < 1e-8);

// Stopping a clip must resolve the pending line and restore effect volume once.
let ducked = false, source;
const node = () => ({ connect(next) { return next; }, disconnect() {} });
const tracks = new VoiceTracks({ ctx: {
  createBufferSource() { source = { ...node(), start() {}, stop() { this.onended?.(); } }; return source; },
  createGain() { return { ...node(), gain: { value: 0 } }; },
}, dialogue: node(), duck(on) { ducked = on; } });
tracks.buffers.set('moreira:Teste', { duration: 3 });
const finished = tracks.play('moreira', 'Teste'); assert.ok(ducked);
tracks.stop(); await finished; assert.equal(ducked, false); assert.equal(tracks.active, null);

async function insertion(skip) {
  const waiters = new Waiters(), subtitles = [], spoken = [], explosions = [];
  const g = { time: 0, timeScale: 1, paused: false, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    input: { mouse: { dx: 0, dy: 0 } }, effects: { shake: 0, addEmitter: () => ({ pos: new THREE.Vector3() }),
      removeEmitter() {}, tracer() {}, explosion(pos) { explosions.push(pos.clone()); } },
    waiters, updatables: new Set(), player: { enabled: false, spawn() {}, applyCamera() {} },
    audio: { radio() {}, explosion() {}, rotor: () => ({ set() {}, interior() {}, stop() {} }) },
    hud: { subtitle(name, text) { subtitles.push({ name, text, time: g.time }); }, setLetterbox() {}, setVisible() {},
      showTitleCard: () => g.director.wait(6) },
    spawn(o) { const root = new THREE.Group(); g.scene.add(root); return { ...o, root, pos: root.position,
      soldier: { ik: {}, time: 0 }, yaw: 0 }; },
  };
  g.hud.fade = (_, ms) => { const end = g.time + ms / 1000; return waiters.until(() => g.time >= end); };
  Object.defineProperty(g, 'skippable', { get() { return this._skip; }, set(value) { this._skip = value; if (!value) this.timeScale = 1; } });
  g.director = new Director(g);
  for (const line of manifest.lines) g.director.tracks.buffers.set(`${line.who}:${line.text}`, { duration: line.duration });
  g.director.tracks.play = (who, text) => {
    const end = g.time + g.director.lineDuration(who, text);
    const event = { who, text, time: g.time, altitude: g.camera.getWorldPosition(new THREE.Vector3()).y };
    spoken.push(event);
    return new Promise(resolve => {
      g.director.tracks.stop = resolve;
      waiters.until(() => g.time >= end).then(resolve);
    });
  };
  const mission = new Mission1(g);
  mission.createSquad();
  let done = false, error, skipped = false;
  mission.intro().then(() => { done = true; }, e => { error = e; done = true; });
  for (let frame = 0; frame < 12000 && !done; frame++) {
    if (skip && !skipped && spoken.length === 2) { g.timeScale = 12; g.director.skip(); skipped = true; }
    const dt = g.timeScale / 60;
    g.time += dt;
    for (const u of g.updatables) u.update(dt);
    waiters.update();
    await Promise.resolve(); await Promise.resolve();
  }
  if (error) throw error;
  assert.ok(done, 'Insertion stalled'); assert.equal(g.timeScale, 1); assert.equal(g.skippable, false);
  assert.equal(g.player.enabled, true); assert.equal(g.camera.parent, g.scene);
  if (skip) {
    assert.equal(spoken.length, 2, 'Queued dialogue played after skipping');
    assert.ok(g.time < 100);
  } else {
    const warning = spoken.find(l => l.text === 'Trinta segundos!');
    const touchdown = spoken.find(l => l.text === 'Pousamos! Fora, fora!');
    assert.ok(Math.abs(touchdown.time - warning.time - 30) < 0.2, 'Landing announcement is out of sync');
    assert.ok(touchdown.altitude < 3, 'Landing announced while airborne');
    assert.equal(spoken.length, 12);
    assert.ok(explosions.every(pos => pos.y > 20), 'Flak continued after landing');
  }
}
await insertion(false);
await insertion(true);
console.log('OK: 30 Eleven v4 voice assets, 5 distinct voices, new captain, delivery directions, clean subtitles, flight endpoints and heading, camera detach, voice cancellation, normal insertion and skip.');
