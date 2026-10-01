// Mission 1 — "Vento Negro": helicopter insertion, street ambush, command post raid,
// courtyard defense and extraction.
import * as THREE from 'three';
import { Helicopter } from '../models/helicopter.js';
import { technical } from '../models/props.js';
import { Flight, CabinView } from './Director.js';
import { rand } from '../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// seat positions in heli-local space (floor at y≈0.63)
const SEATS = {
  player: V(0.3, 1.86, 1.28),
  vieira: { pos: V(0.9, 0.625, -2.3), yaw: 0 },
  souza: { pos: V(-0.9, 0.625, -2.3), yaw: 0 },
  lima: { pos: V(-0.3, 0.625, -2.3), yaw: 0 },
  moreira: { pos: V(0.35, 0.63, -0.9), yaw: 0 },
};

export class Mission1 {
  constructor(game) {
    this.game = game;
    this.d = game.director;
    this.stats = { start: 0 };
  }

  // --- helpers -----------------------------------------------------------------
  createSquad() {
    const g = this.game;
    this.squad = {
      moreira: g.spawn({ team: 'ally', type: 'captain', name: 'Cap. Moreira', seed: 7 }),
      vieira: g.spawn({ team: 'ally', name: 'Sgt. Vieira', seed: 21 }),
      souza: g.spawn({ team: 'ally', name: 'Cb. Souza', seed: 33 }),
      lima: g.spawn({ team: 'ally', name: 'Sd. Lima', seed: 48 }),
    };
    this.squadList = Object.values(this.squad);
  }

  /** Put the squad in a helicopter cabin as seated (non-AI) models. */
  mountSquad(heli) {
    for (const [key, n] of Object.entries(this.squad)) {
      const s = SEATS[key];
      n.mounted = true;
      heli.body.add(n.root);
      n.pos.copy(s.pos); n.root.rotation.set(0, s.yaw, 0); n.yaw = s.yaw;
      n.soldier.pose = key === 'moreira' ? 'stand' : 'sit';
      n.soldier.carry = 'low'; n.soldier.speed = 0; n.soldier.crouchTarget = 0;
    }
    const cap = this.squad.moreira.soldier;
    cap.ik.L = null;
    this.capHandle = V(0.75, 2.54, -0.9);
  }

  dismount(positions) {
    const g = this.game;
    this.squadList.forEach((n, i) => {
      n.root.removeFromParent(); g.scene.add(n.root);
      n.mounted = false; n.soldier.pose = 'stand'; n.soldier.ik.L = null;
      n.pos.copy(positions[i]); n.yaw = 0; n.root.rotation.set(0, 0, 0);
      n.goal = null;
    });
  }

  /** Captain animation while standing in the cabin. */
  cabinActors(heli, dt, lookAtPlayer = true) {
    const cap = this.squad.moreira.soldier;
    cap.ik.L = heli.body.localToWorld(this.capHandle.clone());
    const speaker = this.d.speaker;
    const target = speaker && this.squad[speaker]?.pos;
    cap.headYaw = lookAtPlayer ? Math.sin(this.game.time * 0.4) * 0.15 : 1.2;
    for (const k of ['vieira', 'souza', 'lima']) {
      const s = this.squad[k].soldier;
      const n = this.squad[k];
      s.headYaw = target && speaker !== k
        ? THREE.MathUtils.clamp(Math.atan2(-(target.x - n.pos.x), -(target.z - n.pos.z)) - n.yaw, -0.8, 0.8)
        : Math.sin(this.game.time * 0.3 + s.time) * 0.15;
    }
  }

  squadGoals(points, run = false) {
    this.squadList.forEach((n, i) => { n.goal = points[i] ? points[i].clone() : null; n.run = run; n.goalYaw = Math.PI; });
  }

  wave(list) { return list.map((o) => this.game.spawnEnemy({ accuracy: 0.26, ...o })); }
  cleared(list) { return () => this.game.alive(list) === 0; }

  // --- script -------------------------------------------------------------------
  async run() {
    const g = this.game, d = this.d, hud = g.hud;
    this.createSquad();
    // ?fase=rua|invasao|defesa jumps straight to a chapter (handy for testing)
    const phases = ['intro', 'rua', 'invasao', 'defesa'];
    const start = Math.max(0, phases.indexOf(new URLSearchParams(location.search).get('fase')));
    if (start === 0) await this.intro(); else this.quickStart(phases[start]);
    this.stats.start = g.time;
    if (start <= 1) await this.street();
    if (start <= 2) await this.raid(); else this.leftovers = [];
    await this.defend();
    await this.extraction();
    return { time: g.time - this.stats.start, ...g.weapons.stats };
  }

  async intro() {
    const g = this.game, d = this.d, hud = g.hud;
    hud.fade(1, 0);
    const heli = new Helicopter();
    g.scene.add(heli.root);
    this.mountSquad(heli);
    // Separate flight legs keep the briefing, flak and final approach in sync.
    let flight = new Flight(heli, [
      V(-760, 95, 1150), V(-520, 80, 850), V(-240, 62, 560), V(90, 50, 330),
    ], 2 + d.blockDuration('line-01', 'line-06') + 2, { ease: 'smooth' });
    flight.update(0);
    const cabin = new CabinView(g, heli, SEATS.player);
    cabin.attach();
    const rotor = g.audio.rotor(); rotor.set(0.9); rotor.interior(true);
    const dust = g.effects.addEmitter(V(0, 0, 0), 'dust', { strength: 0 });
    const driver = {
      update: (dt) => {
        flight.update(dt); heli.update(dt); cabin.update(dt);
        this.cabinActors(heli, dt);
        const alt = heli.root.position.y;
        dust.pos.set(heli.root.position.x, 0, heli.root.position.z);
        dust.strength = Math.max(0, 1 - alt / 22);
        rotor.set(0.9, g.camera.getWorldPosition(new THREE.Vector3()));
      },
    };
    hud.setLetterbox(true);
    g.skippable = true;
    await hud.showTitleCard(['OPERAÇÃO VENTO NEGRO', 'Arredores de Al-Harim — 06:12', 'Sgt. Ramos · Destacamento Vento Negro']);
    g.updatables.add(driver);
    hud.fade(0, 2500);
    await d.wait(2);
    await d.say('piloto', 'Vento Negro, aqui é Falcão. Aproximando da zona de pouso.');
    await d.say('moreira', 'Atenção, equipe! O alvo é o vilarejo de Al-Harim.');
    await d.say('moreira', 'A inteligência diz que o comandante Rashid guarda um laptop com as rotas de armas da região.');
    await d.say('moreira', 'Entramos pelo sul, limpamos o pátio central e pegamos o laptop no posto de comando.');
    await d.say('vieira', 'E se o Rashid não estiver lá, senhor?');
    await d.say('moreira', 'Então levamos tudo o que ele deixou pra trás. Ninguém fica para trás.');
    await d.until(() => flight.done);
    flight = new Flight(heli, [V(90, 50, 330), V(86, 44, 260), V(80, 36, 190)],
      d.blockDuration('line-07', 'line-08') + 2, { ease: 'smooth' });
    // anti-aircraft fire
    this.flak(heli, flight);
    await d.say('piloto', 'Fogo antiaéreo às três horas! Segurem-se!');
    await d.say('souza', 'Isso passou perto demais!');
    await d.until(() => flight.done);
    flight = new Flight(heli, [V(80, 36, 190), V(20, 16, 112), V(2, 0.45, 80)], 30);
    await d.say('piloto', 'Trinta segundos!');
    await d.say('moreira', 'Travar e carregar! Ramos, você fica colado em mim.');
    await d.until(() => flight.done);
    await d.say('piloto', 'Pousamos! Fora, fora!');
    await d.say('moreira', 'Vai, vai, vai!');
    await d.wait(0.6);
    await hud.fade(1, 700);

    // --- disembark ---
    g.skippable = false;
    g.updatables.delete(driver);
    cabin.detach();
    this.dismount([V(-2.5, 0, 72), V(3, 0, 72.5), V(-1.2, 0, 69.5), V(2, 0, 69)]);
    g.player.spawn(V(1.5, 0, 75), 0);
    g.player.enabled = true;
    g.player.applyCamera(g.camera);
    g.checkpoint = { pos: V(1.5, 0, 75), yaw: 0 };
    rotor.interior(false);
    const leave = new Flight(heli, [V(2, 0.45, 80), V(4, 8, 90), V(40, 40, 60), V(250, 110, -300), V(700, 200, -900)], 26, { ease: 'in', hoverBob: false });
    const leaver = {
      update: (dt) => {
        leave.update(dt); heli.update(dt);
        dust.pos.set(heli.root.position.x, 0, heli.root.position.z);
        dust.strength = Math.max(0, 1 - heli.root.position.y / 22);
        rotor.set(Math.max(0, 1 - leave.t / 26), heli.root.position);
        if (leave.done) { g.updatables.delete(leaver); heli.root.removeFromParent(); g.effects.removeEmitter(dust); rotor.stop(); }
      },
    };
    g.updatables.add(leaver);
    hud.setLetterbox(false);
    hud.setVisible(true);
    hud.fade(0, 900);
  }

  quickStart(phase) {
    const g = this.game;
    const at = { rua: [V(1.5, 0, 75), 72], invasao: [V(0, 0, 6), -2], defesa: [V(4, 0, -34), -30] }[phase];
    this.dismount([-2.5, 3, -1.2, 2].map((x, i) => V(x, 0, at[1] - (i > 1 ? 3 : 0))));
    g.player.spawn(at[0], 0); g.player.enabled = true;
    g.checkpoint = { pos: at[0].clone(), yaw: 0 };
    g.hud.setVisible(true); g.hud.fade(0, 300);
  }

  flak(heli, flight) {
    const g = this.game;
    let n = 0, next = g.time;
    const bursts = { update: () => {
      if (flight.done || n >= 15) { g.updatables.delete(bursts); return; }
      if (g.time < next) return;
      n++; next = g.time + 0.35;
      const hp = heli.root.position;
      const from = V(hp.x + rand(60, 120), 0, hp.z + rand(-80, 40));
      for (let i = 0; i < 4; i++) g.effects.tracer(from, V(hp.x + rand(-25, 25), hp.y + rand(-5, 25), hp.z + rand(-30, 10)));
      if (n % 3 === 0) {
        const p = V(hp.x + rand(-18, 18), hp.y + rand(4, 14), hp.z + rand(-25, 5));
        g.effects.explosion(p); g.audio.explosion(p);
        g.effects.shake = Math.min(1.2, g.effects.shake + 0.5);
        flight.extraRoll += rand(-0.15, 0.15);
      }
    } };
    g.updatables.add(bursts);
  }

  async street() {
    const g = this.game, d = this.d, hud = g.hud, s = this.squad;
    await d.wait(0.8);
    d.say('moreira', 'Comigo! Em formação, subindo a rua principal.');
    d.objective('Avance com o esquadrão pela rua principal', V(0, 0, 16));
    this.squadGoals([V(-2.5, 0, 50), V(3, 0, 52), V(-3.5, 0, 55), V(3.5, 0, 57)]);
    await d.until(() => g.player.pos.z < 58 || g.time > 1e9);
    this.squadGoals([V(-3, 0, 36), V(3.2, 0, 38), V(-3.8, 0, 42), V(3.8, 0, 43)]);
    await d.until(() => g.player.pos.z < 46 || s.moreira.pos.z < 37.5);
    d.say('moreira', 'Olhos nos telhados. Isso aqui está quieto demais.');
    await d.until(() => g.player.pos.z < 40);

    // --- ambush ---
    const waveA = this.wave([
      { pos: V(-6.8, 6.8, 14), yaw: Math.PI * 0.9, static: true, cover: true, alerted: true },
      { pos: V(6.8, 7.0, 30), yaw: -Math.PI * 0.6, static: true, cover: true, alerted: true },
      { pos: V(6.8, 4.2, 15), yaw: Math.PI, static: true, cover: true },
      { pos: V(-4.5, 0, -1), yaw: Math.PI },
      { pos: V(-13, 0, -5.5), yaw: Math.PI, cover: true },
      { pos: V(12, 0, -4.3), yaw: Math.PI, cover: true },
      { pos: V(-16.5, 0, 3.5), yaw: Math.PI },
      { pos: V(2, 0, -25), yaw: Math.PI, goal: V(3, 0, -4) },
      { pos: V(-2, 0, -28), yaw: Math.PI, goal: V(-2, 0, 2) },
    ]);
    this.squadGoals([V(-4.2, 0, 31), V(4.3, 0, 33), V(-4.5, 0, 36), V(4.2, 0, 37)]);
    await d.wait(0.6);
    d.say('moreira', 'Contato! Telhados, à frente! Abram fogo!');
    d.objective('Elimine a resistência no pátio central');
    g.setCheckpoint(V(0, 0, 44), 0);
    await d.until(() => g.alive(waveA) <= 5);
    d.say('vieira', 'Telhado da esquerda limpo! Avançando!');
    this.squadGoals([V(-4.3, 0, 21), V(4.5, 0, 26), V(-4.8, 0, 25), V(4.8, 0, 28)]);
    await d.until(() => g.alive(waveA) <= 2);
    this.squadGoals([V(-4, 0, 9), V(4, 0, 9), V(-3, 0, 14), V(3, 0, 14)]);
    await d.until(this.cleared(waveA));
    await d.wait(1);
    await d.say('souza', 'Área limpa!');
  }

  async raid() {
    const g = this.game, d = this.d;
    this.squadGoals([V(-2.5, 0, -24), V(3.5, 0, -26), V(-6, 0, -20), V(6.5, 0, -21)]);
    await d.say('moreira', 'Pátio limpo. O posto de comando fica ao norte. Ramos, você entra primeiro. Nós cobrimos.');
    d.objective('Invada o posto de comando', V(0, 0, -32));
    g.setCheckpoint(V(0, 0, 6), Math.PI * 0);
    const inside = this.wave([
      { pos: V(-5, 0, -40), yaw: 0.3, accuracy: 0.35 },
      { pos: V(6.5, 0, -37.5), yaw: -0.8, accuracy: 0.35 },
      { pos: V(-7, 0, -45), yaw: 0.6, accuracy: 0.35 },
    ]);
    await d.until(() => g.player.pos.z < -16);
    const court = this.wave([
      { pos: V(14, 0, -52), goal: V(5, 0, -29.5), alerted: true },
      { pos: V(-15, 0, -52), goal: V(-6, 0, -29), alerted: true },
    ]);
    d.say('lima', 'Movimento nos flancos do prédio!');
    for (const n of inside) n.stealth = true; // squad can't clear the building for you
    await d.until(() => g.player.pos.z < -31);
    for (const n of inside) n.stealth = false;
    g.setCheckpoint(V(0, 0, -30), 0);
    await d.until(() => g.player.pos.z < -33.5);
    d.objective('Recupere a inteligência', g.level.points.laptop.clone().setY(0.8));
    // hold E at the laptop
    let progress = 0, last = g.time;
    await d.until(() => {
      const dt = g.time - last; last = g.time;
      const near = g.player.pos.distanceTo(g.level.points.laptop) < 1.9 && !g.player.dead;
      if (near && g.input.down('KeyE')) progress += dt / 2.2; else progress = Math.max(0, progress - dt);
      g.hud.showPrompt(near ? 'Segure <b>[E]</b> para coletar o laptop' : null, near ? Math.min(1, progress) : null);
      return progress >= 1;
    });
    g.hud.showPrompt(null);
    g.audio.click(1500, 0.5);
    g.hud.flashNotice('INTELIGÊNCIA COLETADA');
    this.leftovers = [...inside, ...court];
  }

  async defend() {
    const g = this.game, d = this.d;
    await d.say('moreira', 'Falcão, aqui é Vento Negro Seis. Pacote em mãos. Solicito extração no pátio central.');
    await d.say('piloto', 'Entendido, Vento Negro. Falcão a noventa segundos. Aguentem firme.');
    d.say('moreira', 'Noventa segundos! Todos para o pátio, posições defensivas! Eles estão vindo!');
    this.squadGoals([V(5.6, 0, -11.2), V(8.6, 0, -11.2), V(-7, 0, -16), V(-1, 0, -20.5)]);
    for (const n of this.leftovers) if (!n.dead) n.alerted = true;
    g.setCheckpoint(V(7, 0, -10), 0);
    const T = 90, t0 = g.time;
    const all = [];
    const spawns = [
      { from: V(0, 0, -64), to: () => V(rand(-10, 10), 0, rand(-30, -27)) },
      { from: V(-22, 0, -60), to: () => V(rand(-15, -10), 0, rand(-29, -25)) },
      { from: V(22, 0, -60), to: () => V(rand(10, 15), 0, rand(-29, -25)) },
      { from: V(-62, 0, -9), to: () => V(rand(-21, -17), 0, rand(-13, -6)) },
    ];
    let next = 4, truck = false, alarm = false;
    await d.until(() => {
      const left = Math.max(0, T - (g.time - t0));
      const m = Math.floor(left / 60), s = Math.floor(left % 60);
      g.hud.objText.textContent = `Defenda o pátio até a extração — ${m}:${String(s).padStart(2, '0')}`;
      g.hud.objEl.classList.add('show');
      if (g.time - t0 > next && left > 8) {
        next += 11;
        if (g.alive(all) < 7) {
          const sp = spawns[Math.floor(Math.random() * spawns.length)];
          for (let i = 0; i < 3; i++) all.push(g.spawnEnemy({ pos: sp.from.clone().add(V(rand(-2, 2), 0, rand(-2, 2))), goal: sp.to(), alerted: true, cover: Math.random() < 0.5, accuracy: 0.22 }));
        }
        if (!alarm) { alarm = true; d.say('vieira', 'Inimigos chegando pelo norte!'); }
      }
      if (!truck && g.time - t0 > 38) { truck = true; this.technical(all); }
      return left <= 0;
    });
    this.defenders = all;
  }

  technical(list) {
    const g = this.game, d = this.d;
    const t = technical();
    t.rotation.y = -Math.PI / 2; // drive toward -X
    t.position.set(80, 0, -9);
    g.scene.add(t);
    const stop = 27;
    let gunner = g.spawnEnemy({ pos: V(80, 0.55, -9), static: true, alerted: true, accuracy: 0.3 });
    gunner.hp = 90;
    const driver = {
      update: (dt) => {
        if (t.position.x > stop) {
          t.position.x = Math.max(stop, t.position.x - dt * 12);
          for (const w of t.userData.wheels) w.rotation.x -= dt * 30;
          if (t.position.x === stop) {
            g.level.col.addFoot(stop, -9, 2.1, 5.4, 1.6, 0, Math.PI / 2);
            for (const goal of [V(18, 0, -8), V(19, 0, -14), V(17, 0, -3)])
              list.push(g.spawnEnemy({ pos: V(stop - 1.5, 0, -9 + rand(-1.5, 1.5)), goal, alerted: true, cover: true, accuracy: 0.22 }));
            g.updatables.delete(driver);
          }
        }
        // gunner rides in the bed
        const bed = t.localToWorld(V(0, 0.55, -1.6));
        gunner.pos.copy(bed);
      },
    };
    g.updatables.add(driver);
    list.push(gunner);
    d.say('souza', 'Técnica! Picape com metralhadora pelo leste!');
  }

  async extraction() {
    const g = this.game, d = this.d;
    d.say('piloto', 'Falcão na área! Descendo no pátio, mantenham a zona quente longe de mim!');
    const heli = new Helicopter();
    g.scene.add(heli.root);
    const LAND = V(0, 0.5, -17);
    const flight = new Flight(heli, [V(230, 85, 150), V(110, 50, 75), V(30, 22, 15), V(2, 8, -6), V(0, 2.5, -13), LAND], 20); // final leg heads north
    const rotor = g.audio.rotor();
    const dust = g.effects.addEmitter(V(), 'dust', { strength: 0 });
    let gunT = 0;
    const driver = {
      update: (dt) => {
        if (!flight.done) flight.update(dt);
        heli.update(dt);
        dust.pos.set(heli.root.position.x, 0, heli.root.position.z);
        dust.strength = Math.max(0, 1 - heli.root.position.y / 22);
        rotor.set(1.1, heli.root.position);
        // door gunner suppresses remaining enemies on final approach
        gunT -= dt;
        if (flight.t > 10 && gunT <= 0) {
          gunT = 0.08;
          const targets = g.npcs.filter((n) => n.team === 'enemy' && !n.dead);
          if (targets.length) {
            const tgt = targets[Math.floor(Math.random() * targets.length)];
            const from = heli.body.localToWorld(V(1.8, 1.5, -2.3));
            g.effects.tracer(from, tgt.chestPos());
            g.audio.shot('rifle', from, 0.5);
            if (Math.random() < 0.08) tgt.takeDamage(200, V(0, -1, 0), 'body', false);
          }
        }
      },
    };
    g.updatables.add(driver);
    await d.until(() => flight.done);
    g.level.col.add(-1.25, 0, -23.5, 1.25, 3, -8);
    d.objective('Embarque no helicóptero', V(1.8, 0.5, -18));
    d.say('moreira', 'Extração no chão! Todos a bordo! Ramos, vamos!');
    this.squadGoals([V(2.2, 0, -18.5), V(2.2, 0, -16), V(2.6, 0, -17.2), V(2.4, 0, -15)], true);
    await d.until(() => g.player.pos.distanceTo(V(1.8, 0, -18)) < 2.6 && !g.player.dead);
    d.objective(null);
    await g.hud.fade(1, 700);
    // --- outro in the cabin ---
    g.hud.setVisible(false);
    g.hud.setLetterbox(true);
    for (const n of g.npcs) if (n.team === 'enemy' && !n.dead) n.kill(V());
    g.updatables.delete(driver);
    this.mountSquad(heli);
    g.player.enabled = false;
    const cabin = new CabinView(g, heli, SEATS.player);
    cabin.attach();
    rotor.interior(true);
    const out = new Flight(heli, [LAND, V(0, 12, -30), V(-40, 45, -140), V(-200, 90, -420), V(-500, 140, -900)], 30, { ease: 'in' });
    const outroDriver = {
      update: (dt) => {
        out.update(dt); heli.update(dt); cabin.update(dt); this.cabinActors(heli, dt);
        dust.pos.set(heli.root.position.x, 0, heli.root.position.z);
        dust.strength = Math.max(0, 1 - heli.root.position.y / 22);
        rotor.set(0.9, g.camera.getWorldPosition(new THREE.Vector3()));
      },
    };
    g.updatables.add(outroDriver);
    g.hud.fade(0, 1200);
    g.skippable = true;
    await d.wait(2);
    await d.say('piloto', 'Todos a bordo. Decolando.');
    await d.say('moreira', 'Bom trabalho, Ramos. Rashid vai ter uma manhã muito ruim.');
    await d.say('vieira', 'Café no quartel, capitão?');
    await d.say('moreira', 'Café no quartel. Vamos pra casa.');
    await d.wait(2);
    await g.hud.fade(1, 1500);
    g.skippable = false;
    g.updatables.delete(outroDriver);
    cabin.detach();
    this.squadList.forEach(n => n.root.removeFromParent());
    heli.root.removeFromParent();
    g.effects.removeEmitter(dust);
    rotor.stop();
  }
}
