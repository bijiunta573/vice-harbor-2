// Solara Cay — story missions (staged), street races, chop-shop deliveries
// and the 12 hidden ember packages scattered over the island.

import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { makeRng } from './world.js';

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;              // next story mission
    this.active = null;          // {mission, stage}
    this.state = 'idle';         // idle | intro | active | done
    this.introQueue = [];
    this.surviveLeft = 0;
    this.marker = null;
    this.buildMarker();
    // Hidden packages
    this.packages = [];
    this.packagesFound = 0;
    this.buildPackages();
    // Race state
    this.race = null;
    // Chop-shop target
    this.chop = { x: 150, z: 8, active: false };
  }

  buildMarker() {
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 26, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 13;
    this.marker.visible = false;
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -12.4;
    this.marker.add(ring);
  }

  buildPackages() {
    const rng = makeRng(99);
    const geo = new THREE.OctahedronGeometry(0.85);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c3a });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, mat);
      const x = (rng() - 0.5) * 430, z = (rng() - 0.5) * 430;
      m.position.set(x, 1.4, z);
      m.userData = { x, z, taken: false, phase: rng() * 9 };
      this.scene.add(m);
      this.packages.push(m);
    }
  }

  available() {
    return this.index < MISSIONS.length && this.state === 'idle';
  }

  startNext() {
    if (!this.available()) return null;
    const mission = MISSIONS[this.index];
    this.active = { mission, stage: 0 };
    this.state = 'intro';
    this.introQueue = [...mission.intro];
    return mission;
  }

  finishIntro() {
    this.state = 'active';
    this.armStage();
  }

  armStage() {
    const s = this.currentStage();
    if (!s) return;
    this.marker.visible = true;
    this.marker.position.x = s.x;
    this.marker.position.z = s.z;
    if (s.kind === 'survive') this.surviveLeft = s.seconds;
  }

  currentStage() {
    if (!this.active) return null;
    return this.active.mission.stages[this.active.stage] || null;
  }

  tracker() {
    if (!this.active) return null;
    const m = this.active.mission;
    const s = this.currentStage();
    return {
      name: `MISSION ${this.index + 1} — ${m.name.toUpperCase()}`,
      stage: this.active.stage + 1,
      stages: m.stages.length,
      objective: s ? s.text : '',
      giver: m.giver,
      surviveLeft: s && s.kind === 'survive' ? Math.ceil(this.surviveLeft) : null,
    };
  }

  // Returns events the main loop reacts to.
  update(dt, player) {
    const ev = { stageDone: false, missionDone: false, cash: 0, rp: 0, msg: '' };
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 0.8;
    }
    for (const p of this.packages) {
      if (p.userData.taken) continue;
      p.rotation.y += dt * 1.6;
      p.position.y = 1.4 + Math.sin(performance.now() / 400 + p.userData.phase) * 0.25;
    }
    if (this.state !== 'active' || !this.active) return ev;
    const s = this.currentStage();
    if (!s) return ev;
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (s.kind === 'survive') {
      if (d < 30) {
        this.surviveLeft -= dt;
        if (this.surviveLeft <= 0) return this.advance(ev);
      }
      return ev;
    }
    const radius = s.kind === 'deliver' ? 8 : 6;
    if (d < radius) {
      if (s.kind === 'deliver' && !player.inCar) { ev.msg = 'You need a vehicle for this delivery.'; return ev; }
      return this.advance(ev);
    }
    return ev;
  }

  advance(ev) {
    const m = this.active.mission;
    this.active.stage++;
    ev.stageDone = true;
    if (this.active.stage >= m.stages.length) {
      ev.missionDone = true;
      ev.cash = m.cash; ev.rp = m.rp;
      this.index++;
      this.active = null;
      this.state = 'idle';
      this.marker.visible = false;
    } else {
      this.armStage();
    }
    return ev;
  }

  checkPackages(player, onFound) {
    for (const p of this.packages) {
      if (p.userData.taken) continue;
      const d = Math.hypot(player.x - p.userData.x, player.z - p.userData.z);
      if (d < 3.2) {
        p.userData.taken = true;
        p.visible = false;
        this.packagesFound++;
        onFound(this.packagesFound);
      }
    }
  }

  // Street race: a 5-checkpoint time trial starting at the Palma start line.
  startRace() {
    const pts = [
      { x: -168, z: -8 }, { x: -60, z: 60 }, { x: 40, z: 110 },
      { x: 130, z: 20 }, { x: 60, z: -90 }, { x: 30, z: -168 },
    ];
    this.race = { pts, idx: 0, time: 0, best: this.raceBest || null };
    this.marker.visible = true;
    this.marker.position.x = pts[0].x;
    this.marker.position.z = pts[0].z;
    return this.race;
  }

  updateRace(dt, player) {
    if (!this.race) return null;
    this.race.time += dt;
    const p = this.race.pts[this.race.idx];
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < 9) {
      this.race.idx++;
      if (this.race.idx >= this.race.pts.length) {
        const t = this.race.time;
        if (!this.raceBest || t < this.raceBest) this.raceBest = t;
        this.race = null;
        if (this.state !== 'active') this.marker.visible = false;
        return { finished: true, time: t };
      }
      const np = this.race.pts[this.race.idx];
      this.marker.position.x = np.x;
      this.marker.position.z = np.z;
      return { checkpoint: this.race.idx, total: this.race.pts.length };
    }
    return null;
  }

  raceTarget() {
    if (!this.race) return null;
    const p = this.race.pts[this.race.idx];
    return { x: p.x, z: p.z, idx: this.race.idx, total: this.race.pts.length, time: this.race.time };
  }
}
