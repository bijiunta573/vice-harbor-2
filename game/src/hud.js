// Solara Cay — HUD: DOM panels + the round minimap.
// The HUD is deliberately dense, in the genre's grammar: wanted stars and
// cash top-right, mission tracker with stage count, a police dispatch panel
// with named units and roles, crew abilities with cooldown sweeps, weapon
// slots, vehicle readouts, district banner with a standing meter, and a
// circular minimap with blips and a north marker.

import { districtAt, rankFor, WEAPONS, CREW } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.map = $('minimap');
    this.mctx = this.map.getContext('2d');
    this.bannerTimer = 0;
    this.lastDistrict = '';
    this.msgTimer = 0;
    this.dialogueQueue = [];
    this.onDialogueDone = null;
    this.dialogueActive = false;
  }

  show(el, on = true) { const e = $(el); if (e) e.style.display = on ? '' : 'none'; }

  setStars(stars, heat) {
    const el = $('stars');
    let html = '';
    for (let i = 0; i < 5; i++) {
      const on = i < stars;
      html += `<span class="star ${on ? 'on' : ''} ${stars >= 5 && on ? 'flash' : ''}">★</span>`;
    }
    el.innerHTML = html;
    $('airwarn').style.display = stars >= 5 ? '' : 'none';
    $('heatbar').style.width = `${Math.min(100, (heat / 5) * 100)}%`;
  }

  setCashClock(cash, clockText, day) {
    $('cash').textContent = '$' + cash.toLocaleString('en-US');
    $('clock').textContent = `${clockText} · DAY ${day}`;
  }

  setRank(rp) {
    const { cur, next } = rankFor(rp);
    $('rank').textContent = cur.title;
    const pct = next ? ((rp - cur.rp) / (next.rp - cur.rp)) * 100 : 100;
    $('rpbar').style.width = `${Math.max(0, Math.min(100, pct))}%`;
    $('rptext').textContent = next ? `${rp} RP → ${next.title.split('·')[1].trim()} at ${next.rp}` : `${rp} RP · MAX RANK`;
  }

  setHealth(health, armour) {
    $('healthbar').style.width = `${Math.max(0, health)}%`;
    $('armourbar').style.width = `${Math.max(0, armour)}%`;
    $('healthtext').textContent = `${Math.ceil(Math.max(0, health))}`;
  }

  setWeapon(weapons, current) {
    const strip = $('weapons');
    let html = '';
    weapons.forEach((w, i) => {
      const def = WEAPONS[i];
      const ammo = def.ammo === Infinity ? '∞' : `${w.inMag}/${w.ammo}`;
      html += `<div class="wslot ${i === current ? 'sel' : ''}"><b>${def.key}</b> ${def.name}<span>${ammo}</span></div>`;
    });
    strip.innerHTML = html;
  }

  setVehicle(driving, name, kmh, damage, radioName) {
    $('vehicle').style.display = driving ? '' : 'none';
    if (!driving) return;
    $('vehname').textContent = name;
    $('speed').textContent = `${kmh}`;
    $('dmgbar').style.width = `${100 - damage}%`;
    $('dmgtext').textContent = `DMG ${Math.round(damage)}%`;
    $('radio').textContent = radioName ? `♪ ${radioName}` : '♪ RADIO OFF';
  }

  setTracker(tracker, race) {
    const box = $('tracker');
    if (race) {
      box.style.display = '';
      $('mname').textContent = 'STREET RACE — PALMA GRAND LINE';
      $('mstage').textContent = `CHECKPOINT ${race.idx}/${race.total}`;
      $('mobj').textContent = `Next gate ${Math.round(race.time)}s · hit the gold pillar`;
      return;
    }
    if (!tracker) { box.style.display = 'none'; return; }
    box.style.display = '';
    $('mname').textContent = tracker.name;
    $('mstage').textContent = `STAGE ${tracker.stage}/${tracker.stages}`;
    $('mobj').textContent = tracker.surviveLeft != null
      ? `${tracker.objective} — ${tracker.surviveLeft}s`
      : tracker.objective;
  }

  setDispatch(rows, stars) {
    const box = $('dispatch');
    if (!stars || !rows.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    $('dispatch-title').textContent = `POLICE RESPONSE — ${rows.length} UNITS`;
    $('dispatch-rows').innerHTML = rows.map(r =>
      `<div class="drow"><span class="dname">${r.name}</span><span class="drole">${r.role}</span><span class="ddist">${r.dist}m</span></div>`).join('');
  }

  setCrew(crewState) {
    $('crew-rows').innerHTML = CREW.map((c, i) => {
      const left = Math.max(0, crewState[i].readyAt - crewState.now);
      const pct = left > 0 ? Math.round((left / c.cooldown) * 100) : 0;
      return `<div class="crow"><span class="ckey">${c.key}</span><span class="cname">${c.name}<small>${c.role}</small></span><span class="ccd">${left > 0 ? Math.ceil(left) + 's' : 'READY'}</span><span class="ccbar" style="width:${pct}%"></span></div>`;
    }).join('');
  }

  districtBanner(x, z, standing) {
    const d = districtAt(x, z);
    if (d.id !== this.lastDistrict) {
      this.lastDistrict = d.id;
      $('dname').textContent = d.name.toUpperCase();
      $('dblurb').textContent = d.blurb;
      $('dbanner').classList.add('show');
      this.bannerTimer = 3.4;
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= 1 / 60;
      if (this.bannerTimer <= 0) $('dbanner').classList.remove('show');
    }
    const s = standing[d.id] || 0;
    $('standing').style.width = `${Math.min(100, s)}%`;
    $('standingtext').textContent = `STANDING ${Math.floor(s)}%${s >= 60 ? ' · LOCAL PERK ACTIVE' : ''}`;
    return d;
  }

  message(text, seconds = 3) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    this.msgTimer = seconds;
  }

  updateTimers(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) $('toast').classList.remove('show');
    }
  }

  // Dialogue: portrait box with speaker name; click/Enter advances.
  playDialogue(lines, done) {
    this.dialogueQueue = [...lines];
    this.onDialogueDone = done || null;
    this.dialogueActive = true;
    this.nextDialogue();
  }

  nextDialogue() {
    const box = $('dialogue');
    const line = this.dialogueQueue.shift();
    if (!line) {
      box.style.display = 'none';
      this.dialogueActive = false;
      if (this.onDialogueDone) { const f = this.onDialogueDone; this.onDialogueDone = null; f(); }
      return;
    }
    box.style.display = 'block';
    $('dspeaker').textContent = line[0];
    $('dtext').textContent = line[1];
    const hue = (line[0].charCodeAt(0) * 47) % 360;
    $('dportrait').style.background = `linear-gradient(160deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 70% 32%))`;
    $('dportrait').textContent = line[0].split(' ').map(w => w[0]).join('').slice(0, 2);
  }

  get dialogueOpen() { return this.dialogueActive; }

  // Round minimap: roads, water edge, blips.
  drawMinimap(state) {
    const ctx = this.mctx, W = 190, C = W / 2, R = 88;
    const { player, police, missions, traffic, packages, lookoutUntil, now } = state;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1d2b26'; ctx.fillRect(0, 0, W, W);
    const scale = R / 150; // 300m across the map
    const px = (x) => C + (x - player.x) * scale;
    const pz = (z) => C + (z - player.z) * scale;
    // water ring
    ctx.strokeStyle = '#14586e'; ctx.lineWidth = 16;
    ctx.strokeRect(px(-280), pz(-280), 560 * scale, 560 * scale);
    // roads
    ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = 3;
    for (let i = -4; i <= 4; i++) {
      const c = i * 46;
      ctx.beginPath(); ctx.moveTo(px(c), pz(-235)); ctx.lineTo(px(c), pz(235)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-235), pz(c)); ctx.lineTo(px(235), pz(c)); ctx.stroke();
    }
    const blip = (x, z, color, r = 3) => {
      const bx = px(x), bz = pz(z);
      if ((bx - C) ** 2 + (bz - C) ** 2 > (R - 4) ** 2) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(bx, bz, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const t of traffic) blip(t.vehicle.x, t.vehicle.z, '#c9ced6', 2);
    if (missions) {
      const t = missions.currentStage && missions.state === 'active' ? missions.currentStage() : null;
      if (t) blip(t.x, t.z, '#ffd94d', 4.5);
      const rt = missions.raceTarget && missions.raceTarget();
      if (rt) blip(rt.x, rt.z, '#ffd94d', 4.5);
    }
    const reveal = now < lookoutUntil;
    if (packages && (reveal || packages.packagesFound > 0)) {
      for (const p of packages.packages) if (!p.userData.taken) blip(p.userData.x, p.userData.z, '#ff8c3a', 2.5);
    }
    if (police) {
      for (const u of police.units) blip(u.vehicle.x, u.vehicle.z, '#ff3548', 3);
      for (const o of police.officers) blip(o.x, o.z, '#ff7a8a', 2.5);
      if (police.heli) blip(police.heli.mesh.position.x, police.heli.mesh.position.z, '#ffffff', 3);
    }
    // player arrow
    ctx.translate(C, C);
    ctx.rotate(-(player.angle || 0) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // ring + north
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
    ctx.fillText('N', C - 4, 16);
  }
}
