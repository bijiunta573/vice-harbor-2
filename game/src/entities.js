// Solara Cay — vehicles, pedestrians and the player avatar.
// Low-poly procedural meshes; arcade car physics with drift and damage;
// traffic cars follow the street grid; pedestrians stroll and flee.

import * as THREE from 'three';
import { CAR_MODELS, CITY } from './config.js';
import { makeRng } from './world.js';

const bodyMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });

export function buildCarMesh(model, police = false) {
  const g = new THREE.Group();
  const color = police ? 0xf4f6f8 : model.color;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat(color));
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  g.add(body, cabin);
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.3, 4.44), bodyMat(0x1c3f7c));
    stripe.position.y = 0.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
    bar.position.set(0, 1.48, -0.2);
    bar.name = 'lightbar';
    g.add(stripe, bar);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 8);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  hl.position.set(0, 0.62, 2.22);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3548 }));
  tl.position.set(0, 0.66, -2.22);
  g.add(hl, tl);
  g.userData.wheels = wheels;
  return g;
}

export function buildPersonMesh(shirt, pants, skin = 0xc98d64) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.3), bodyMat(pants));
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), bodyMat(shirt));
  torso.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), bodyMat(skin));
  head.position.y = 1.76;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.16), bodyMat(shirt));
  armL.position.set(-0.4, 1.14, 0);
  const armR = armL.clone(); armR.position.x = 0.4;
  g.add(legs, torso, head, armL, armR);
  g.userData = { legs, torso, armL, armR };
  return g;
}

export class Vehicle {
  constructor(scene, model, x, z, angle, police = false) {
    this.model = model;
    this.mesh = buildCarMesh(model, police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;       // 0..100
    this.occupied = false;
    this.police = police;
    this.dead = false;
    this.smokeT = 0;
  }
  get pos() { return this.mesh.position; }
  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * 0.06;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }
  // Arcade drive step. input: {throttle -1..1, steer -1..1, brake bool}
  drive(dt, input, world) {
    if (this.dead) { this.speed *= Math.pow(0.4, dt); this.syncMesh(); return; }
    const dmgFactor = 1 - Math.min(0.55, this.damage / 180);
    const top = this.model.top * dmgFactor;
    const accel = this.model.accel * dmgFactor;
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    } else if (input.throttle > 0) {
      this.speed += accel * dt * (this.speed < 0 ? 2.2 : 1);
    } else if (input.throttle < 0) {
      this.speed -= accel * 0.7 * dt * (this.speed > 0 ? 2.2 : 1);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    }
    this.speed = Math.max(-top * 0.42, Math.min(top, this.speed));
    // Steering scales with speed; handbrake-style drift widens the slide.
    const sf = Math.min(1, Math.abs(this.speed) / 9);
    this.steer += ((input.steer || 0) - this.steer) * Math.min(1, dt * 7);
    const turn = this.steer * 1.55 * sf * (this.speed >= 0 ? 1 : -1);
    this.angle += turn * dt * (input.drift ? 1.5 : 1);
    const vx = Math.sin(this.angle) * this.speed;
    const vz = Math.cos(this.angle) * this.speed;
    let nx = this.x + vx * dt, nz = this.z + vz * dt;
    const before = { x: this.x, z: this.z };
    const fixed = world.collide(nx, nz, 1.5);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      if (Math.abs(this.speed) > 9) this.hurt(Math.abs(this.speed) * 0.55);
      this.speed *= 0.35;
    }
    this.x = fixed.x; this.z = fixed.z;
    void before;
    this.syncMesh();
  }
  hurt(amount) {
    this.damage = Math.min(100, this.damage + amount);
    if (this.damage >= 100 && !this.dead) this.dead = true;
  }
}

export class TrafficCar {
  constructor(scene, rng, world) {
    const model = CAR_MODELS[Math.floor(rng() * CAR_MODELS.length)];
    const lines = world.roads;
    this.axis = rng() < 0.5 ? 'x' : 'z';
    this.line = lines[Math.floor(rng() * lines.length)];
    this.along = (rng() - 0.5) * 420;
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 9 + rng() * 6;
    this.lane = 3.4;
    this.vehicle = new Vehicle(scene, model, 0, 0, 0);
    this.place(0);
  }
  place() {
    const off = this.lane * this.dir;
    if (this.axis === 'z') {
      this.vehicle.x = this.line + off;
      this.vehicle.z = this.along;
      this.vehicle.angle = this.dir > 0 ? 0 : Math.PI;
    } else {
      this.vehicle.x = this.along;
      this.vehicle.z = this.line - off;
      this.vehicle.angle = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.vehicle.syncMesh();
  }
  update(dt, world) {
    this.along += this.dir * this.speed * dt;
    if (this.along > 235) this.along = -235;
    if (this.along < -235) this.along = 235;
    // Occasionally turn at an intersection to keep the grid alive.
    this.place();
  }
}

export class Pedestrian {
  constructor(scene, rng) {
    const shirts = [0xe2e2e2, 0xd94f30, 0x3d7de2, 0x35c48d, 0xf5d76e, 0xd65db1];
    this.mesh = buildPersonMesh(shirts[Math.floor(rng() * shirts.length)], 0x2c3242);
    this.x = (rng() - 0.5) * 420;
    this.z = (rng() - 0.5) * 420;
    this.angle = rng() * Math.PI * 2;
    this.speed = 1.1 + rng() * 0.9;
    this.fleeing = 0;
    this.dead = false;
    this.walkPhase = rng() * 9;
    scene.add(this.mesh);
  }
  update(dt, world, threat) {
    if (this.dead) return;
    let sp = this.speed;
    if (threat) {
      const dx = this.x - threat.x, dz = this.z - threat.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 340) { this.angle = Math.atan2(dx, dz); sp = 4.4; this.fleeing = 1.5; }
    }
    if (this.fleeing > 0) this.fleeing -= dt;
    this.walkPhase += dt * (sp > 2 ? 11 : 6);
    let nx = this.x + Math.sin(this.angle) * sp * dt;
    let nz = this.z + Math.cos(this.angle) * sp * dt;
    // Keep pedestrians near sidewalks: snap to road edges when crossing blocks.
    const fixed = world.collide(nx, nz, 0.45);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) this.angle += 1.9;
    this.x = fixed.x; this.z = fixed.z;
    if (Math.random() < dt * 0.05) this.angle += (Math.random() - 0.5) * 1.6;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * 0.05, this.z);
    this.mesh.rotation.y = this.angle;
    const swing = Math.sin(this.walkPhase) * 0.4;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
    this.mesh.userData.legs.rotation.x = Math.sin(this.walkPhase) * 0.18;
  }
  knockDown() {
    this.dead = true;
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = 0.25;
  }
}

export function spawnTraffic(scene, world, count, seed = 21) {
  const rng = makeRng(seed);
  const cars = [];
  for (let i = 0; i < count; i++) cars.push(new TrafficCar(scene, rng, world));
  return cars;
}

export function spawnParkedCars(scene, world, count, seed = 33) {
  // Parked cars sit in the parking lane of a real street, nose along the
  // road, so the player can always reach one and drive straight off.
  const rng = makeRng(seed);
  const cars = [];
  const lines = world.roads;
  for (let i = 0; i < count; i++) {
    const model = CAR_MODELS[Math.floor(rng() * CAR_MODELS.length)];
    const line = lines[Math.floor(rng() * lines.length)];
    const along = (rng() - 0.5) * 400;
    const side = rng() < 0.5 ? 5.4 : -5.4;
    let x, z, angle;
    if (rng() < 0.5) { x = line + side; z = along; angle = side > 0 ? 0 : Math.PI; }
    else { x = along; z = line + side; angle = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
    const v = new Vehicle(scene, model, x, z, angle);
    v.syncMesh();
    cars.push(v);
  }
  return cars;
}

export function spawnPedestrians(scene, count, seed = 45) {
  const rng = makeRng(seed + count);
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(new Pedestrian(scene, rng));
  return peds;
}

export { CITY };
