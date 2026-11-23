// Solara Cay — police response: wanted stars, cruisers, foot officers,
// roadblocks at 4+ stars and the Skywatch helicopter at 5 stars.
// A dispatch roster gives every unit a callsign, a tactical role and a live
// distance readout for the HUD panel.

import * as THREE from 'three';
import { Vehicle, buildPersonMesh } from './entities.js';
import { CAR_MODELS } from './config.js';

const ROLES = ['RAMMING', 'FLANKING', 'PATROL', 'MARKSMAN', 'SHORE WATCH', 'INTERCEPT'];
const NAMES = ['UNIT K-7', 'UNIT K-12', 'UNIT R-3', 'UNIT R-9', 'UNIT S-2', 'UNIT S-5', 'UNIT T-1', 'UNIT T-8', 'SKYWATCH-1', 'UNIT M-4'];

export class PoliceSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.stars = 0;          // 0..5 float heat underneath
    this.heat = 0;
    this.units = [];         // {vehicle, role, name, kind:'car'}
    this.officers = [];      // {mesh, x,z, role, name}
    this.blocks = [];        // roadblock groups {mesh,x,z}
    this.heli = null;
    this.heliLight = null;
    this.seenTimer = 0;      // time since player last seen
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.sirenPhase = false;
    this.sirenTimer = 0;
    this.roadblockStars = 0;
  }

  addHeat(amount) {
    this.heat = Math.min(5.6, this.heat + amount);
    this.stars = Math.max(this.stars, Math.min(5, Math.floor(this.heat + 0.001)));
    if (this.heat >= 1 && this.stars < 1) this.stars = 1;
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(5, n));
    this.heat = Math.max(this.heat, this.stars);
  }

  desiredUnits() {
    return [0, 1, 2, 4, 6, 8][this.stars] || 0;
  }
  desiredOfficers() {
    return [0, 0, 1, 2, 3, 4][this.stars] || 0;
  }

  spawnUnit(player, idx) {
    const model = CAR_MODELS[0];
    const a = (idx / 8) * Math.PI * 2 + Math.random() * 0.7;
    const dist = 55 + Math.random() * 25;
    const x = player.x + Math.sin(a) * dist;
    const z = player.z + Math.cos(a) * dist;
    const v = new Vehicle(this.scene, model, x, z, a + Math.PI, true);
    const unit = { vehicle: v, role: ROLES[idx % ROLES.length], name: NAMES[idx % NAMES.length], kind: 'car', shootT: 0 };
    this.units.push(unit);
    return unit;
  }

  spawnOfficer(player, idx) {
    const mesh = buildPersonMesh(0x1c3f7c, 0x141c30, 0xd9a077);
    const a = Math.random() * Math.PI * 2;
    const x = player.x + Math.sin(a) * 30, z = player.z + Math.cos(a) * 30;
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const o = { mesh, x, z, role: idx % 2 ? 'MARKSMAN' : 'PATROL', name: NAMES[(idx + 4) % NAMES.length], shootT: 0, walkPhase: 0 };
    this.officers.push(o);
    return o;
  }

  spawnRoadblock(player) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 });
    const bx = Math.round(player.x / 46) * 46;
    const bz = player.z + (Math.random() < 0.5 ? 60 : -60);
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 6), mat);
      cone.position.set(-6 + i * 4, 0.6, 0);
      group.add(cone);
    }
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xf4f6f8 }));
    barrier.position.y = 0.8;
    group.add(barrier);
    group.position.set(bx, 0, bz);
    this.scene.add(group);
    this.blocks.push({ mesh: group, x: bx, z: bz });
    this.world.colliders.push({ x: bx, z: bz, hw: 7.5, hd: 1 });
  }

  spawnHeli(player) {
    const g = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 7),
      new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.4, metalness: 0.4 }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5),
      new THREE.MeshStandardMaterial({ color: 0x22262e }));
    tail.position.set(0, 0.4, -5.4);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x111111 }));
    rotor.position.y = 1.5; rotor.name = 'rotor';
    g.add(bodyM, tail, rotor);
    const spot = new THREE.SpotLight(0xfff3c4, 900, 90, 0.32, 0.5, 1.2);
    spot.position.set(0, -1, 0);
    g.add(spot); g.add(spot.target);
    spot.target.position.set(0, -30, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = -16;
    g.add(cone);
    g.position.set(player.x + 30, 30, player.z - 20);
    this.scene.add(g);
    this.heli = { mesh: g, rotor, angle: 0 };
  }

  clearAll() {
    for (const u of this.units) this.scene.remove(u.vehicle.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    for (const b of this.blocks) this.scene.remove(b.mesh);
    if (this.heli) this.scene.remove(this.heli.mesh);
    this.units = []; this.officers = []; this.blocks = []; this.heli = null;
    this.roadblockStars = 0;
  }

  dropStar() {
    this.stars = Math.max(0, this.stars - 1);
    this.heat = this.stars;
    if (this.stars === 0) this.clearAll();
  }

  // Returns events: {busted:bool, shotsAtPlayer:dmg}
  update(dt, player, world, sound) {
    const events = { damage: 0, busted: false };
    if (this.stars <= 0) { this.heat = Math.max(0, this.heat - dt * 0.05); return events; }

    // Visibility: police within 46m or heli overhead keep the player "seen".
    let seen = false;
    for (const u of this.units) {
      const d = Math.hypot(u.vehicle.x - player.x, u.vehicle.z - player.z);
      if (d < 48) seen = true;
    }
    if (this.heli) seen = true;
    if (seen) this.seenTimer = 0; else this.seenTimer += dt;
    if (this.seenTimer > 9) {
      this.heat = Math.max(0, this.heat - dt * 0.22);
      this.stars = Math.min(this.stars, Math.ceil(this.heat));
      if (this.stars <= 0) { this.clearAll(); return events; }
    }

    // Spawning up to the desired strength.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.4;
      if (this.units.length < this.desiredUnits()) this.spawnUnit(player, this.units.length);
      if (this.officers.length < this.desiredOfficers()) this.spawnOfficer(player, this.officers.length);
      if (this.stars >= 4 && this.roadblockStars < this.stars && this.blocks.length < 3) {
        this.spawnRoadblock(player);
        this.roadblockStars = this.stars;
      }
      if (this.stars >= 5 && !this.heli) this.spawnHeli(player);
    }
    if (this.stars < 5 && this.heli) { this.scene.remove(this.heli.mesh); this.heli = null; }

    // Siren blink + sound tick.
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.55;
      this.sirenPhase = !this.sirenPhase;
      if (sound && this.units.length) sound.sirenStep(this.sirenPhase);
      for (const u of this.units) {
        const bar = u.vehicle.mesh.getObjectByName('lightbar');
        if (bar) bar.material.color.setHex(this.sirenPhase ? 0xff2a3c : 0x2a6cff);
      }
    }

    // Cruiser AI: chase, ram, or pull ahead to block depending on role.
    for (const u of this.units) {
      const v = u.vehicle;
      let tx = player.x, tz = player.z;
      if (u.role === 'FLANKING') { tx += Math.cos(player.angle || 0) * 14; tz -= Math.sin(player.angle || 0) * 14; }
      if (u.role === 'INTERCEPT') { tx += Math.sin(player.angle || 0) * 26; tz += Math.cos(player.angle || 0) * 26; }
      const dx = tx - v.x, dz = tz - v.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - v.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      const throttle = dist > 7 ? 1 : 0.25;
      v.drive(dt, { throttle, steer, brake: Math.abs(diff) > 2.4 }, world);
      if (dist < 3.4 && Math.abs(player.speed || 0) > 4) v.hurt(2);
      // Marksman passengers fire at range.
      if ((u.role === 'MARKSMAN') && dist < 34) {
        u.shootT -= dt;
        if (u.shootT <= 0) { u.shootT = 1.1 + Math.random() * 0.7; events.damage += 3 + Math.random() * 4; }
      }
      // Despawn far-away units so fresh ones can spawn near the action.
      if (dist > 190) {
        this.scene.remove(v.mesh);
        u.deadUnit = true;
      }
    }
    this.units = this.units.filter(u => !u.deadUnit);

    // Foot officers: approach and fire; close contact builds the bust meter.
    let contact = false;
    for (const o of this.officers) {
      const dx = player.x - o.x, dz = player.z - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 9) {
        const inv = 1 / Math.max(dist, 0.01);
        o.x += dx * inv * 3.4 * dt;
        o.z += dz * inv * 3.4 * dt;
        o.walkPhase += dt * 7;
      } else if (dist < 3.2 && !player.inCar) {
        contact = true;
      }
      if (dist < 26 && dist > 4) {
        o.shootT -= dt;
        if (o.shootT <= 0) { o.shootT = 1.3 + Math.random(); events.damage += 2 + Math.random() * 3; }
      }
      o.mesh.position.set(o.x, Math.abs(Math.sin(o.walkPhase)) * 0.04, o.z);
      o.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (contact && Math.abs(player.speed || 0) < 1.2) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.2) events.busted = true;
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.5);
    }

    // Helicopter: orbit the player, spotlight pinned, boosts spawn pressure.
    if (this.heli) {
      this.heli.angle += dt * 0.45;
      const hx = player.x + Math.cos(this.heli.angle) * 22;
      const hz = player.z + Math.sin(this.heli.angle) * 22;
      this.heli.mesh.position.set(hx, 30 + Math.sin(this.heli.angle * 2) * 2, hz);
      this.heli.mesh.lookAt(player.x, 0, player.z);
      this.heli.rotor.rotation.y += dt * 28;
    }
    return events;
  }

  roster(player) {
    const out = [];
    for (const u of this.units) {
      out.push({ name: u.name, role: u.role, dist: Math.round(Math.hypot(u.vehicle.x - player.x, u.vehicle.z - player.z)) });
    }
    for (const o of this.officers) {
      out.push({ name: o.name, role: o.role + ' (FOOT)', dist: Math.round(Math.hypot(o.x - player.x, o.z - player.z)) });
    }
    if (this.heli) out.push({ name: 'SKYWATCH-1', role: 'AIR UNIT', dist: Math.round(Math.hypot(this.heli.mesh.position.x - player.x, this.heli.mesh.position.z - player.z)) });
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, 6);
  }
}
