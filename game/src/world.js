// Solara Cay — procedural low-poly island city built with three.js.
// A street grid over a coastal island: nine named districts, emissive-window
// buildings, palm trees, a harbour with piers, the Ember Bridge, a beach ring
// and warm dusk water. Everything is generated from a seeded RNG so the
// island is identical on every visit.

import * as THREE from 'three';
import { CITY, DISTRICTS } from './config.js';

export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BUILDING_COLORS = [0xf2e3c9, 0xe8b4a0, 0xcfe3ea, 0xf5d76e, 0xd9c7e7, 0xa8d5ba, 0xf0f0f0, 0xe5989b, 0x84a9c0, 0xffd6a5];

export class World {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = [];   // {x,z,hw,hd} building footprints for collision
    this.roads = [];       // street centrelines for traffic routing
    this.spawnPoints = [];
    this.buildLights(scene);
    this.buildGround();
    this.buildStreets();
    this.buildBlocks();
    this.buildHarbour();
    this.buildBridge();
    this.buildLandmarks();
  }

  buildLights(scene) {
    scene.fog = new THREE.Fog(0x2b1a33, 190, 620);
    const hemi = new THREE.HemisphereLight(0xffd9a0, 0x33455e, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb066, 1.6);
    sun.position.set(-160, 120, 60);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7fb2ff, 0.35);
    fill.position.set(120, 80, -100);
    scene.add(fill);
    // Sky dome: big gradient sphere (vertex colours, dusk grade).
    const skyGeo = new THREE.SphereGeometry(900, 16, 10);
    const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x2a2356), mid = new THREE.Color(0xb84a6e), low = new THREE.Color(0xff9e57);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900;
      tmp.copy(y > 0.25 ? top : mid);
      if (y < 0.25) tmp.lerp(low, 1 - Math.max(0, (y + 0.12) / 0.37));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  buildGround() {
    const { island } = CITY;
    // Water
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x14586e, roughness: 0.35, metalness: 0.35, emissive: 0x0a2e3d })
    );
    water.rotation.x = -Math.PI / 2; water.position.y = -1.4;
    this.scene.add(water);
    this.water = water;
    // Sand beach ring
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(island + 90, island + 90),
      new THREE.MeshStandardMaterial({ color: 0xe8cf9a, roughness: 1 })
    );
    sand.rotation.x = -Math.PI / 2; sand.position.y = -0.25;
    this.scene.add(sand);
    // Island slab (grass/asphalt base)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(island, 1.2, island),
      new THREE.MeshStandardMaterial({ color: 0x596b52, roughness: 1 })
    );
    base.position.y = -0.6;
    this.scene.add(base);
    // City pavement plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(470, 0.24, 470),
      new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.95 })
    );
    plate.position.y = 0.02;
    this.scene.add(plate);
  }

  streetLines() {
    const lines = [];
    for (let i = -CITY.half; i <= CITY.half; i++) lines.push(i * CITY.block);
    return lines;
  }

  buildStreets() {
    const lines = this.streetLines();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e2f36, roughness: 0.9 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
    for (const c of lines) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadHalf * 2, 470), roadMat);
      v.rotation.x = -Math.PI / 2; v.position.set(c, 0.16, 0);
      this.scene.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(470, CITY.roadHalf * 2), roadMat);
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.16, c);
      this.scene.add(h);
      this.roads.push(c);
    }
    // Dashed centre lines as two instanced meshes (one draw call each).
    const dashGeoV = new THREE.PlaneGeometry(0.5, 6);
    const dashGeoH = new THREE.PlaneGeometry(6, 0.5);
    const dashCount = lines.length * 30;
    const dashesV = new THREE.InstancedMesh(dashGeoV, lineMat, dashCount);
    const dashesH = new THREE.InstancedMesh(dashGeoH, lineMat, dashCount);
    const dm = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    let dn = 0;
    for (const c of lines) {
      for (let d = -225; d < 225; d += 15) {
        dm.copy(rot).setPosition(c, 0.2, d);
        dashesV.setMatrixAt(dn, dm);
        dm.copy(rot).setPosition(d, 0.2, c);
        dashesH.setMatrixAt(dn, dm);
        dn++;
      }
    }
    dashesV.count = dn; dashesH.count = dn;
    this.scene.add(dashesV); this.scene.add(dashesH);
    // Street lamps (emissive dots, cheap points of light in the dusk)
    const lampGeo = new THREE.SphereGeometry(0.55, 6, 5);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffca7a });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.4, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46 });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, 200);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, 200);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const x of lines) for (const z of lines) {
      if (n >= 200) break;
      if ((x + z) % 3 !== 0) continue;
      m.setPosition(x + 8, 5.6, z + 8); lamps.setMatrixAt(n, m);
      m.setPosition(x + 8, 2.7, z + 8); poles.setMatrixAt(n, m);
      n++;
    }
    lamps.count = n; poles.count = n;
    this.scene.add(lamps); this.scene.add(poles);
  }

  buildBlocks() {
    const rng = this.rng;
    const lines = this.streetLines();
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    const winMat2 = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    for (let bi = 0; bi < lines.length - 1; bi++) {
      for (let bj = 0; bj < lines.length - 1; bj++) {
        const cx = (lines[bi] + lines[bi + 1]) / 2;
        const cz = (lines[bj] + lines[bj + 1]) / 2;
        const roll = rng();
        if (roll < 0.14) { this.buildPark(cx, cz); continue; }
        if (roll < 0.2) { this.buildLot(cx, cz); continue; }
        // 1-2 buildings per block
        const count = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < count; k++) {
          const ox = (rng() - 0.5) * 20, oz = (rng() - 0.5) * 20;
          const w = 9 + rng() * 9, d = 9 + rng() * 9;
          const downtownBoost = (Math.abs(cx) < 60 && Math.abs(cz) < 60) ? 26 : 0;
          const hgt = 7 + rng() * rng() * 26 + downtownBoost;
          const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
          const geo = new THREE.BoxGeometry(w, hgt, d);
          const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
          const b = new THREE.Mesh(geo, mat);
          b.position.set(cx + ox, hgt / 2 + 0.14, cz + oz);
          this.scene.add(b);
          this.colliders.push({ x: cx + ox, z: cz + oz, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
          // Emissive window strips on the street face (cheap planes)
          const rows = Math.min(3, Math.floor(hgt / 6));
          for (let r = 0; r < rows; r++) {
            if (rng() < 0.5) continue;
            const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 0.7), rng() < 0.5 ? winMat : winMat2);
            strip.position.set(cx + ox, 3 + r * 4.4, cz + oz + d / 2 + 0.06);
            this.scene.add(strip);
          }
          // Rooftop box
          if (rng() < 0.5) {
            const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4),
              new THREE.MeshStandardMaterial({ color: 0x777777 }));
            top.position.set(cx + ox, hgt + 0.9, cz + oz);
            this.scene.add(top);
          }
          // Neon sign on some downtown blocks
          if (downtownBoost && rng() < 0.45) {
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6),
              new THREE.MeshBasicMaterial({ color: [0xff5d8f, 0x37c8d9, 0xffd94d][Math.floor(rng() * 3)] }));
            sign.position.set(cx + ox, hgt * 0.62, cz + oz + d / 2 + 0.12);
            this.scene.add(sign);
          }
        }
      }
    }
  }

  buildPark(cx, cz) {
    const rng = this.rng;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x4e7d46, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(cx, 0.18, cz);
    this.scene.add(lawn);
    for (let i = 0; i < 5; i++) this.addPalm(cx + (rng() - 0.5) * 24, cz + (rng() - 0.5) * 24);
  }

  buildLot(cx, cz) {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 1 }));
    lot.rotation.x = -Math.PI / 2; lot.position.set(cx, 0.18, cz);
    this.scene.add(lot);
    this.spawnPoints.push({ x: cx, z: cz });
  }

  addPalm(x, z) {
    const rng = this.rng;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 1 }));
    trunk.position.set(x, 2.75, z);
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    this.scene.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 1.4, 5.7, z + Math.sin(a) * 1.4);
      frond.rotation.set(0.5, -a, 0);
      this.scene.add(frond);
    }
    this.colliders.push({ x, z, hw: 0.5, hd: 0.5 });
  }

  buildHarbour() {
    // Piers reaching south into the water + moored boats + cranes.
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const px = -180 + i * 42;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 52), wood);
      pier.position.set(px, 0.1, 268);
      this.scene.add(pier);
      for (let b = 0; b < 2; b++) {
        const boat = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 9),
          new THREE.MeshStandardMaterial({ color: [0xffffff, 0xe2483d, 0x3d7de2][(i + b) % 3] }));
        hull.position.y = 0.4;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3),
          new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
        cabin.position.set(0, 1.6, -0.6);
        boat.add(hull, cabin);
        boat.position.set(px + (b ? 7 : -7), -0.7, 258 + b * 16);
        this.scene.add(boat);
      }
    }
    // Port Cinder cranes
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xd97b2f, roughness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const cx = 120 + i * 34, cz = 196;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), craneMat);
      leg.position.set(cx, 13, cz);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), craneMat);
      arm.position.set(cx + 8, 25, cz);
      this.scene.add(leg, arm);
      this.colliders.push({ x: cx, z: cz, hw: 1.6, hd: 1.6 });
    }
    // Container stacks
    const contColors = [0xc23b2e, 0x2e6fc2, 0x2ea35e, 0xd9a441];
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(11, 4.4, 4.6),
        new THREE.MeshStandardMaterial({ color: contColors[i % 4], roughness: 0.8 }));
      c.position.set(118 + (i % 5) * 13, 2.3 + Math.floor(i / 7) * 4.4, 168 + Math.floor((i % 7) / 5) * 8);
      this.scene.add(c);
      this.colliders.push({ x: c.position.x, z: c.position.z, hw: 5.7, hd: 2.5 });
    }
  }

  buildBridge() {
    // The Ember Bridge: a causeway north over the bay inlet.
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 120), deckMat);
    deck.position.set(0, 1.6, -300);
    this.scene.add(deck);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xd9573b, roughness: 0.6 });
    for (const tz of [-262, -338]) {
      for (const tx of [-6, 6]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 30, 1.6), towerMat);
        tower.position.set(tx, 15, tz);
        this.scene.add(tower);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 1.6), towerMat);
      cross.position.set(0, 28, tz);
      this.scene.add(cross);
    }
    const glow = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.3, 120),
      new THREE.MeshBasicMaterial({ color: 0xff8c4a }));
    glow.position.set(0, 2.3, -300);
    this.scene.add(glow);
  }

  buildLandmarks() {
    // The Ember sign on Bayview hill + a lighthouse + scattered palms on the beach.
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
    const letters = 'EMBER';
    for (let i = 0; i < letters.length; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.6), signMat);
      p.position.set(-14 + i * 7, 7, -238);
      this.scene.add(p);
    }
    const hill = new THREE.Mesh(new THREE.ConeGeometry(46, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x51683f, roughness: 1 }));
    hill.position.set(0, 0, -252);
    this.scene.add(hill);
    const light = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 16, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    tower.position.y = 8;
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3 }));
    lampRoom.position.y = 17.4;
    light.add(tower, lampRoom);
    light.position.set(238, 0, 238);
    this.scene.add(light);
    this.colliders.push({ x: 238, z: 238, hw: 3.4, hd: 3.4 });
    const rng = this.rng;
    for (let i = 0; i < 36; i++) {
      const a = rng() * Math.PI * 2;
      const r = 262 + rng() * 22;
      this.addPalm(Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  // Resolve a position out of building colliders; returns corrected {x,z}.
  collide(x, z, radius = 0.6) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const px = c.hw + radius - Math.abs(dx);
      const pz = c.hd + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) x = c.x + (dx > 0 ? c.hw + radius : -c.hw - radius);
        else z = c.z + (dz > 0 ? c.hd + radius : -c.hd - radius);
      }
    }
    const lim = 268;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x, z };
  }

  update(dt, t) {
    if (this.water) this.water.position.y = -1.4 + Math.sin(t * 0.5) * 0.08;
  }
}
