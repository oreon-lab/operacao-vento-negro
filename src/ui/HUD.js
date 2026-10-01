// DOM HUD: crosshair, ammo, compass, objectives, waypoint, subtitles, fades, damage.
import * as THREE from 'three';

const $ = (sel) => document.querySelector(sel);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.el.innerHTML = `
      <div id="vignette"></div><div id="bloodfx"></div>
      <div id="crosshair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
      <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
      <div id="dmgind"></div>
      <div id="compass"><div id="compass-strip"></div><div id="compass-obj">◆</div><div class="compass-mid"></div></div>
      <div id="objective"><div class="obj-title">OBJETIVO</div><div class="obj-text"></div></div>
      <div id="waypoint"><div class="wp-icon"></div><div class="wp-dist"></div></div>
      <div id="ammo"><div class="wname"></div><div class="wcount"><span class="mag">30</span><span class="res">/ 120</span></div><div class="nades"></div></div>
      <div id="prompt"><span></span><div class="bar"><div></div></div></div>
      <div id="notice"></div>
      <div id="squadtags"></div>`;
    this.cross = $('#crosshair'); this.hitEl = $('#hitmarker');
    this.strip = $('#compass-strip'); this.compObj = $('#compass-obj');
    this.objEl = $('#objective'); this.objText = $('.obj-text');
    this.wp = $('#waypoint'); this.wpDist = $('.wp-dist');
    this.ammoEl = $('#ammo'); this.magEl = $('#ammo .mag'); this.resEl = $('#ammo .res'); this.wname = $('#ammo .wname'); this.nades = $('#ammo .nades');
    this.vign = $('#vignette'); this.blood = $('#bloodfx');
    this.prompt = $('#prompt'); this.promptText = $('#prompt span'); this.promptBar = $('#prompt .bar div');
    this.notice = $('#notice'); this.dmg = $('#dmgind'); this.tags = $('#squadtags');
    this.fadeEl = $('#fade'); this.letterbox = $('#letterbox'); this.subs = $('#subtitles'); this.titleCard = $('#titlecard');
    this.objective = null; this.waypoint = null;
    this.hitT = 0;
    this.buildCompass();
    this.setVisible(false);
  }

  buildCompass() {
    const labels = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let rep = -1; rep <= 1; rep++) for (let d = 0; d < 360; d += 15) {
      const x = (d + rep * 360) * 4;
      html += labels[d] ? `<span class="c-lbl" style="left:${x}px">${labels[d]}</span>` : `<span class="c-tick" style="left:${x}px">${d % 45 ? '' : ''}</span>`;
    }
    this.strip.innerHTML = html;
  }

  setVisible(v) { this.el.classList.toggle('hidden', !v); }

  setObjective(text) {
    this.objective = text;
    this.objText.textContent = text || '';
    this.objEl.classList.toggle('show', !!text);
    this.objEl.classList.remove('flash'); void this.objEl.offsetWidth; this.objEl.classList.add('flash');
  }

  setWaypoint(v) { this.waypoint = v; }

  hitmarker(kill, head) {
    this.hitEl.className = 'show' + (kill ? ' kill' : '') + (head ? ' head' : '');
    this.hitT = kill ? 0.35 : 0.18;
  }

  damageFrom(pos, player) {
    if (!pos) return;
    const ang = Math.atan2(pos.x - player.pos.x, pos.z - player.pos.z);
    const rel = ang - (player.yaw + Math.PI);
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    d.style.transform = `rotate(${-rel}rad)`;
    this.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  showPrompt(text, progress = null) {
    this.prompt.classList.toggle('show', !!text);
    if (text) this.promptText.innerHTML = text;
    this.prompt.querySelector('.bar').style.display = progress == null ? 'none' : 'block';
    if (progress != null) this.promptBar.style.width = `${progress * 100}%`;
  }

  flashNotice(text, ms = 2500) {
    this.notice.textContent = text; this.notice.classList.add('show');
    clearTimeout(this.noticeT); this.noticeT = setTimeout(() => this.notice.classList.remove('show'), ms);
  }

  fade(to, ms = 800) {
    const from = Number(getComputedStyle(this.fadeEl).opacity);
    const start = this.game.time;
    this.fadeEl.style.transitionDuration = '0ms';
    if (!ms) { this.fadeEl.style.opacity = to; return Promise.resolve(); }
    return this.game.waiters.until(() => {
      const progress = Math.min(1, (this.game.time - start) / (ms / 1000));
      this.fadeEl.style.opacity = from + (to - from) * progress;
      return progress >= 1;
    });
  }

  setLetterbox(on) { this.letterbox.classList.toggle('on', on); }

  subtitle(speaker, text, color = '#e8d8a0') {
    if (!text) { this.subs.classList.remove('show'); return; }
    this.subs.innerHTML = `<b style="color:${color}">${speaker}:</b> ${text}`;
    this.subs.classList.add('show');
  }

  async showTitleCard(lines) {
    this.titleCard.innerHTML = '';
    this.titleCard.classList.add('show');
    for (const line of lines) {
      const div = document.createElement('div'); this.titleCard.appendChild(div);
      const start = this.game.time;
      await this.game.waiters.until(() => {
        const count = Math.min(line.length, Math.floor((this.game.time - start) / 0.038));
        div.textContent = line.slice(0, count);
        return count === line.length;
      });
      await this.game.director.wait(0.25);
    }
    await this.game.director.wait(2.2);
    this.titleCard.classList.remove('show');
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.weapons, cam = g.camera;
    // crosshair
    const pxPerRad = (innerHeight * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    const spreadPx = 6 + w.spread * pxPerRad;
    this.cross.style.setProperty('--gap', `${spreadPx}px`);
    this.cross.style.opacity = w.aimT > 0.5 || p.sprinting ? 0 : 1;
    this.hitT -= dt; if (this.hitT <= 0) this.hitEl.className = '';
    // ammo
    const s = w.cur;
    this.wname.textContent = s.def.name;
    this.magEl.textContent = s.ammo; this.magEl.classList.toggle('low', s.ammo <= s.def.mag * 0.25);
    this.resEl.textContent = `/ ${s.reserve}`;
    this.nades.innerHTML = '<i></i>'.repeat(w.grenades);
    // health
    const h = p.health / 100;
    this.vign.style.opacity = (1 - h) * 0.9;
    this.blood.style.opacity = h < 0.45 ? (0.45 - h) * 2 : 0;
    // compass
    const heading = ((-p.yaw * 180) / Math.PI) % 360;
    const hdg = (heading + 360) % 360;
    this.strip.style.transform = `translateX(${210 - hdg * 4}px)`;
    if (this.waypoint) {
      const ang = Math.atan2(this.waypoint.x - p.pos.x, -(this.waypoint.z - p.pos.z)) * 180 / Math.PI;
      let rel = ((ang - hdg + 540) % 360) - 180;
      this.compObj.style.display = Math.abs(rel) < 52 ? 'block' : 'none';
      this.compObj.style.left = `${210 + rel * 4}px`;
    } else this.compObj.style.display = 'none';
    // 3D waypoint
    if (this.waypoint && p.enabled) {
      const v = _v.copy(this.waypoint).setY(this.waypoint.y + 1.2).project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - 40; }
      x = Math.max(40, Math.min(innerWidth - 40, x)); y = Math.max(60, Math.min(innerHeight - 60, y));
      this.wp.style.display = 'block';
      this.wp.style.transform = `translate(${x}px, ${y}px)`;
      this.wpDist.textContent = `${Math.round(p.pos.distanceTo(this.waypoint))}m`;
    } else this.wp.style.display = 'none';
    // squad name tags
    let tags = '';
    for (const n of g.npcs) {
      if (n.team !== 'ally' || n.dead || n.mounted || !n.name || !p.enabled) continue;
      const hp = n.eyePos(_v); hp.y += 0.35;
      const d = hp.distanceTo(cam.position);
      if (d > 35) continue;
      hp.project(cam); if (hp.z > 1) continue;
      tags += `<div class="tag" style="transform:translate(${(hp.x * 0.5 + 0.5) * innerWidth}px,${(-hp.y * 0.5 + 0.5) * innerHeight}px)">${n.name}</div>`;
    }
    this.tags.innerHTML = tags;
  }
}
const _v = new THREE.Vector3();
