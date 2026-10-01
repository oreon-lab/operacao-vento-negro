// Entry: menu → briefing → campaign → results.
import { initMaterials, loadImageTextures } from './models/materials.js';
import { Game } from './game/Game.js';
import { Mission1 } from './campaign/Mission1.js';

const $ = (s) => document.querySelector(s);
const show = (id, on = true) => $(id).classList.toggle('show', on);

const BRIEF = [
  'ALVO: Vilarejo de Al-Harim, 40 km a leste da fronteira.',
  'SITUAÇÃO: Milícia do comandante Rashid controla o vilarejo. Um laptop no posto de comando contém as rotas de contrabando de armas da região.',
  'MISSÃO: Inserção por helicóptero ao sul. Avançar pela rua principal, limpar o pátio central, invadir o posto de comando e recuperar a inteligência.',
  'EXTRAÇÃO: Falcão 1-1 retorna ao pátio após a coleta. Esperem resistência pesada.',
  'COMANDANTE EM CAMPO: Cap. Moreira.',
];

let game, state = 'menu';

function pauseGame(paused) {
  game.paused = paused;
  show('#pause', paused);
  game.audio.setPaused(paused);
  if (paused) globalThis.speechSynthesis?.pause(); else globalThis.speechSynthesis?.resume();
}

async function boot() {
  await new Promise((r) => setTimeout(r, 50)); // let the loading text paint
  initMaterials();
  loadImageTextures();
  game = new Game($('#game'));
  game.start();
  if (import.meta.env.DEV) window.__game = game; // console debugging
  // idle menu camera slowly orbits the town
  game.camera.position.set(60, 30, 90);
  game.updatables.add({ update: () => {
    if (state !== 'menu' && state !== 'briefing') return;
    const t = game.time * 0.03;
    game.camera.position.set(Math.sin(t) * 90, 26, Math.cos(t) * 90 + 5);
    game.camera.lookAt(0, 4, -5);
  } });
  $('#loading').textContent = 'Pronto.';
  $('#btn-start').disabled = false;

  game.input.onLockChange = (locked) => {
    if (state !== 'playing') return;
    pauseGame(!locked);
  };
}

$('#btn-start').disabled = true;
$('#btn-controls').onclick = () => $('#controls').classList.toggle('hidden');
$('#btn-start').onclick = async () => {
  game.audio.init();
  game.director.tts = $('#opt-tts').checked;
  game.voicesReady = game.director.prepare();
  state = 'briefing';
  show('#menu', false); show('#briefing');
  const body = $('#brief-body'); body.innerHTML = '';
  for (const line of BRIEF) {
    const p = document.createElement('p'); body.appendChild(p);
    for (const ch of line) { p.textContent += ch; if (state !== 'briefing') return; await new Promise((r) => setTimeout(r, 12)); }
  }
};
$('#btn-deploy').onclick = () => startMission();
$('#pause').onclick = () => { pauseGame(false); game.input.lock(); };
$('#btn-again').onclick = () => location.reload();

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'playing' && !game.paused) {
    pauseGame(true);
    document.exitPointerLock?.();
  }
  if (e.code === 'Enter' && game?.skippable && !game.paused) { game.timeScale = 12; game.director.skip(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    pauseGame(true);
    document.exitPointerLock?.();
  }
});

async function startMission() {
  if (state !== 'briefing') return;
  state = 'loading';
  $('#btn-deploy').disabled = true;
  $('#btn-deploy').textContent = 'PREPARANDO ÁUDIO…';
  await game.voicesReady;
  state = 'playing';
  show('#briefing', false);
  game.input.lock();
  const mission = new Mission1(game);
  const res = await mission.run();
  state = 'complete';
  game.director.skip();
  document.exitPointerLock?.();
  game.hud.setVisible(false);
  game.hud.setLetterbox(false);
  const mm = Math.floor(res.time / 60), ss = Math.floor(res.time % 60);
  const acc = res.shots ? Math.round((res.hits / res.shots) * 100) : 0;
  $('#stats').innerHTML = `
    <div><span>Tempo</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
    <div><span>Abates</span><b>${res.kills}</b></div>
    <div><span>Tiros na cabeça</span><b>${res.heads}</b></div>
    <div><span>Precisão</span><b>${acc}%</b></div>`;
  show('#complete');
  game.hud.fade(0, 800);
}

boot();
