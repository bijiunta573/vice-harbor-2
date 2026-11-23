// Solara Cay — Isle of Embers: main game loop and glue.
// Third-person open-world crime game: on-foot + driving with a lerped chase
// camera, traffic and pedestrians, a 0–5 star police response with cruisers,
// foot officers, roadblocks and a helicopter, staged story missions, crew
// abilities, weapons, radio, district standing, rank/RP, side activities
// (street races, chop-shop deliveries, hidden packages) and a local save.

import * as THREE from 'three';
import { World } from './world.js';
import { Vehicle, buildPersonMesh, spawnTraffic, spawnParkedCars, spawnPedestrians } from './entities.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { WEAPONS, CREW, RADIO_STATIONS, SAVE_KEY, districtAt } from './config.js';

// ---------------------------------------------------------------- setup
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2144);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(0, 8, -14);

const world = new World(scene, 7);
const hud = new Hud();
const sound = new SoundEngine();
const police = new PoliceSystem(scene, world);
const missions = new MissionSystem(scene);
const traffic = spawnTraffic(scene, world, 14);
const parked = spawnParkedCars(scene, world, 16);
const peds = spawnPedestrians(scene, 22);

// Player avatar
const playerMesh = buildPersonMesh(0xffd94d, 0x22304a, 0xb97a52);
scene.add(playerMesh);
const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.55),
  new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.6 }));
gunMesh.position.set(0.34, 1.32, 0.3);
gunMesh.visible = false;
playerMesh.add(gunMesh);

// Particle pool (pooled, no per-frame allocation)
const PMAX = 300;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xffb056, size: 0.5, transparent: true, opacity: 0.9 });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
const particles = [];
for (let i = 0; i < PMAX; i++) { particles.push({ life: 0, vx: 0, vy: 0, vz: 0 }); pPos[i * 3 + 1] = -50; }
let pCursor = 0;
function burst(x, y, z, n, color) {
  if (color) pMat.color.setHex(color);
  for (let k = 0; k < n; k++) {
    const p = particles[pCursor];
    p.life = 0.5 + Math.random() * 0.5;
    p.vx = (Math.random() - 0.5) * 7; p.vy = Math.random() * 6; p.vz = (Math.random() - 0.5) * 7;
    pPos[pCursor * 3] = x; pPos[pCursor * 3 + 1] = y; pPos[pCursor * 3 + 2] = z;
    pCursor = (pCursor + 1) % PMAX;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const p = particles[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy -= 9 * dt;
    pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += p.vz * dt;
    if (p.life <= 0) pPos[i * 3 + 1] = -50;
  }
  pGeo.attributes.position.needsUpdate = true;
}

// Tracer lines pool for gunfire
const tracers = [];
for (let i = 0; i < 8; i++) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerCursor = 0;
function tracer(from, to) {
  const t = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % tracers.length;
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.life = 0.07;
  t.line.material.opacity = 0.9;
}

// ---------------------------------------------------------------- state
const S = {
  mode: 'menu', // menu | play | pause | busted | wasted | end
  x: 1, z: 1, angle: 0, speed: 0,
  health: 100, armour: 0,
  cash: 250, rp: 0, day: 1, clockMin: 18 * 60,
  inCar: null,
  weapon: 1,
  weapons: WEAPONS.map(w => ({ ammo: w.ammo === Infinity ? Infinity : w.ammo, inMag: w.mag === Infinity ? Infinity : w.mag })),
  lastShot: 0, reloadingUntil: 0,
  crew: CREW.map(() => ({ readyAt: 0 })),
  crewNow: 0,
  standing: {},
  packages: 0,
  lookoutUntil: 0,
  camAngle: 0, camDist: 9,
  mouseDown: false, aimYaw: 0,
  shake: 0,
  radioOn: false, station: 0,
  chopReady: true,
  stats: { missionsDone: 0, carsStolen: 0, racesWon: 0, chops: 0 },
};
const playerView = { x: S.x, z: S.z, angle: 0, speed: 0, inCar: false };
function refreshPlayerView() {
  if (S.inCar) {
    playerView.x = S.inCar.x; playerView.z = S.inCar.z;
    playerView.angle = S.inCar.angle; playerView.speed = S.inCar.speed; playerView.inCar = true;
  } else {
    playerView.x = S.x; playerView.z = S.z;
    playerView.angle = S.angle; playerView.speed = S.speed; playerView.inCar = false;
  }
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.mode === 'play') {
    if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
    if (hud.dialogueOpen && (e.code === 'Enter')) hud.nextDialogue();
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 5) selectWeapon(n - 1);
    }
    if (e.code === 'KeyF') toggleCar();
    if (e.code === 'KeyT') cycleRadio();
    if (e.code === 'KeyM') interactMission();
    if (e.code === 'KeyQ') useCrew(0);
    if (e.code === 'KeyE') useCrew(1);
    if (e.code === 'KeyR') useCrew(2);
  } else if (S.mode === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resumeGame();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', (e) => { if (e.target === canvas) { S.mouseDown = true; sound.ensure(); } });
addEventListener('mouseup', () => { S.mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (S.mode === 'play' && !S.inCar) S.aimYaw -= e.movementX * 0.0022;
});
document.getElementById('dialogue').addEventListener('click', () => { if (S.mode === 'play') hud.nextDialogue(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- save
function saveGame() {
  const data = {
    cash: S.cash, rp: S.rp, day: S.day, standing: S.standing,
    missionIndex: missions.index, packages: missions.packagesFound,
    stats: S.stats, weapons: S.weapons.map(w => ({ ammo: w.ammo === Infinity ? -1 : w.ammo, inMag: w.inMag === Infinity ? -1 : w.inMag })),
    taken: missions.packages.map(p => p.userData.taken),
    raceBest: missions.raceBest || null,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  hud.message('Game saved.');
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S.cash = d.cash; S.rp = d.rp; S.day = d.day; S.standing = d.standing || {};
    missions.index = d.missionIndex || 0;
    missions.packagesFound = d.packages || 0;
    S.stats = d.stats || S.stats;
    if (d.weapons) d.weapons.forEach((w, i) => { if (S.weapons[i]) { S.weapons[i].ammo = w.ammo < 0 ? Infinity : w.ammo; S.weapons[i].inMag = w.inMag < 0 ? Infinity : w.inMag; } });
    if (d.taken) d.taken.forEach((t, i) => { if (t && missions.packages[i]) { missions.packages[i].userData.taken = true; missions.packages[i].visible = false; } });
    if (d.raceBest) missions.raceBest = d.raceBest;
    return true;
  } catch { return false; }
}
if (loadGame()) document.getElementById('btn-continue').style.display = '';

// ---------------------------------------------------------------- flow
function showScreen(id) {
  for (const s of ['menu-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'end-screen'])
    document.getElementById(s).style.display = s === id ? '' : 'none';
}
function startGame(fresh) {
  sound.ensure();
  if (fresh) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
    Object.assign(S, { cash: 250, rp: 0, day: 1, health: 100, armour: 0, standing: {}, stats: { missionsDone: 0, carsStolen: 0, racesWon: 0, chops: 0 } });
    missions.index = 0; missions.packagesFound = 0;
    for (const p of missions.packages) { p.userData.taken = false; p.visible = true; }
    S.weapons = WEAPONS.map(w => ({ ammo: w.ammo === Infinity ? Infinity : w.ammo, inMag: w.mag === Infinity ? Infinity : w.mag }));
  }
  S.x = 1; S.z = 1; S.angle = 0; S.inCar = null;
  police.clearAll(); police.stars = 0; police.heat = 0;
  S.mode = 'play';
  showScreen(null);
  document.getElementById('hud').style.display = '';
  hud.message(fresh ? 'Welcome to Solara Cay. Press M to take Mama Luz\'s first job.' : 'Welcome back to Solara Cay.', 4);
}
function pauseGame() {
  if (S.mode !== 'play') return;
  S.mode = 'pause';
  document.getElementById('pause-stats').textContent =
    `Cash $${S.cash} · ${S.rp} RP · Missions ${S.stats.missionsDone}/6 · Packages ${missions.packagesFound}/12 · Races won ${S.stats.racesWon} · Cars stolen ${S.stats.carsStolen}`;
  showScreen('pause-screen');
}
function resumeGame() { S.mode = 'play'; showScreen(null); }
function endRun(kind) {
  S.mode = kind;
  police.clearAll(); police.stars = 0; police.heat = 0;
  const fine = Math.min(S.cash, kind === 'busted' ? 200 : 150);
  S.cash -= fine;
  S.health = 100;
  if (S.inCar) { S.x = S.inCar.x; S.z = S.inCar.z; S.inCar.occupied = false; S.inCar = null; }
  S.x = 1; S.z = 1;
  if (kind === 'busted') sound.busted();
  showScreen(kind + '-screen');
  saveGame();
}
document.getElementById('btn-start').onclick = () => startGame(true);
document.getElementById('btn-continue').onclick = () => startGame(false);
document.getElementById('btn-resume').onclick = resumeGame;
document.getElementById('btn-save').onclick = () => { saveGame(); };
document.getElementById('btn-quit').onclick = () => { S.mode = 'menu'; showScreen('menu-screen'); document.getElementById('hud').style.display = 'none'; };
document.getElementById('btn-busted-ok').onclick = () => { S.mode = 'play'; showScreen(null); };
document.getElementById('btn-wasted-ok').onclick = () => { S.mode = 'play'; showScreen(null); };
document.getElementById('btn-end-ok').onclick = () => { S.mode = 'play'; showScreen(null); };

// ---------------------------------------------------------------- actions
function selectWeapon(i) {
  if (S.inCar) return;
  S.weapon = i;
  gunMesh.visible = i > 0;
  sound.blip(600 + i * 60, 0.05, 'square', 0.1);
}
function nearestCar(x, z, maxD) {
  let best = null, bd = maxD;
  for (const v of [...parked, ...traffic.map(t => t.vehicle)]) {
    if (v.occupied || v.dead) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function toggleCar() {
  if (S.inCar) {
    const v = S.inCar;
    S.x = v.x + Math.cos(v.angle) * 2.4; S.z = v.z - Math.sin(v.angle) * 2.4;
    v.occupied = false; S.inCar = null;
    playerMesh.visible = true;
    sound.setRadio(false, S.station);
    S.radioOn = false;
    return;
  }
  const v = nearestCar(S.x, S.z, 4.2);
  if (v) {
    S.inCar = v; v.occupied = true;
    S.stats.carsStolen++;
    playerMesh.visible = false;
    gunMesh.visible = false;
    police.addHeat(0.35);
    hud.message(`You took the ${v.model.name}. T for radio, F to get out.`);
    if (v.damage > 55) hud.message('This ride is beat up — Bruno (E) can patch it.', 3.5);
  }
}
function cycleRadio() {
  if (!S.inCar) return;
  if (!S.radioOn) { S.radioOn = true; S.station = 0; }
  else { S.station = (S.station + 1) % RADIO_STATIONS.length; if (S.station === 0 && Math.random() < 0.3) { /* keep cycling feel */ } }
  if (S.station === 2 && !S.radioOn) S.radioOn = true;
  sound.setRadio(S.radioOn, S.station);
  hud.message(`♪ ${RADIO_STATIONS[S.station].name} — ${RADIO_STATIONS[S.station].style}`);
}
function interactMission() {
  if (missions.race) { missions.race = null; missions.marker.visible = false; hud.message('Race abandoned.'); return; }
  if (missions.available()) {
    const m = missions.startNext();
    if (m) {
      hud.playDialogue(m.intro, () => missions.finishIntro());
      hud.message(`${m.name} — a job from ${m.giver}.`);
      return;
    }
  }
  // Near the Palma start line with no mission running: offer the race.
  const d = Math.hypot(S.x - (-168), S.z - (-8));
  if (d < 14 || (S.inCar && Math.hypot(S.inCar.x + 168, S.inCar.z + 8) < 16)) {
    missions.startRace();
    hud.message('STREET RACE — Palma Grand Line! Hit every gold pillar. Best time pays $700.');
    return;
  }
  if (missions.index >= 6) hud.message('Story complete. Races (M at Palma), chop shop (steal & deliver to the Foundry), packages remain.');
  else hud.message('No job waiting here. Press M anywhere to take the next story job.');
}
function useCrew(i) {
  const now = S.crewNow;
  const c = S.crew[i];
  if (now < c.readyAt) { hud.message(`${CREW[i].name} needs ${Math.ceil(c.readyAt - now)}s.`); return; }
  c.readyAt = now + CREW[i].cooldown;
  if (i === 0) { // driver: plate swap
    if (police.stars > 0) { police.dropStar(); hud.message('NIA swaps the plates — wanted level dropped!'); burst(S.x, 1.5, S.z, 14, 0x37c8d9); }
    else hud.message('NIA: "No heat to lose right now."');
  } else if (i === 1) { // mechanic
    if (S.inCar) { S.inCar.damage = Math.max(0, S.inCar.damage - 70); S.inCar.dead = S.inCar.damage >= 100; hud.message('BRUNO patches the ride up.'); }
    S.armour = Math.min(100, S.armour + 40);
    hud.message('BRUNO hands you a fresh vest (+40 armour).');
    sound.cash();
  } else { // lookout
    S.lookoutUntil = now + 14;
    hud.message('SABLE marks every unit and package on your map (14s).');
    sound.pickup();
  }
}

function addCrime(amount, msg) {
  police.addHeat(amount);
  if (msg) hud.message(msg, 2.2);
}
function gainStanding(districtId, amount) {
  S.standing[districtId] = Math.min(100, (S.standing[districtId] || 0) + amount);
}
function reward(cash, rp, districtId) {
  S.cash += cash; S.rp += rp;
  if (districtId) gainStanding(districtId, 9);
  sound.cash();
}

// ---------------------------------------------------------------- combat
function tryShoot(now) {
  if (S.inCar || hud.dialogueOpen) return;
  const def = WEAPONS[S.weapon];
  const st = S.weapons[S.weapon];
  if (now - S.lastShot < def.rate) return;
  if (st.inMag <= 0) {
    if (def.mag !== Infinity) { S.reloadingUntil = now + def.reload; st.inMag = Math.min(def.mag, st.ammo); st.ammo -= st.inMag; sound.blip(300, 0.1, 'square', 0.12); }
    S.lastShot = now;
    return;
  }
  S.lastShot = now;
  if (st.inMag !== Infinity) st.inMag--;
  sound.shot(def.id);
  const pellets = def.pellets || 1;
  const origin = { x: S.x, y: 1.45, z: S.z };
  for (let p = 0; p < pellets; p++) {
    const yaw = S.aimYaw + (Math.random() - 0.5) * def.spread * 2;
    const dirx = Math.sin(yaw), dirz = Math.cos(yaw);
    let bestT = def.range, best = null, bestKind = '';
    const test = (x, z, r, obj, kind) => {
      const rx = x - S.x, rz = z - S.z;
      const t = rx * dirx + rz * dirz;
      if (t < 0.5 || t > bestT) return;
      const perp = Math.abs(rx * dirz - rz * dirx);
      if (perp < r) { bestT = t; best = obj; bestKind = kind; }
    };
    for (const ped of peds) if (!ped.dead) test(ped.x, ped.z, 0.7, ped, 'ped');
    for (const o of police.officers) test(o.x, o.z, 0.7, o, 'officer');
    for (const u of police.units) test(u.vehicle.x, u.vehicle.z, 2.1, u.vehicle, 'car');
    for (const t of traffic) test(t.vehicle.x, t.vehicle.z, 2.1, t.vehicle, 'car');
    for (const v of parked) test(v.x, v.z, 2.1, v, 'car');
    const end = { x: S.x + dirx * bestT, y: 1.3, z: S.z + dirz * bestT };
    if (def.id !== 'fists') tracer(origin, end);
    if (best) {
      burst(end.x, 1.2, end.z, 5, bestKind === 'car' ? 0xffb056 : 0xff5d5d);
      if (bestKind === 'ped') {
        best.knockDown();
        addCrime(1.1, 'You flattened a pedestrian — the Cay is watching!');
      } else if (bestKind === 'officer') {
        best.hp = (best.hp || 40) - def.dmg;
        if (best.hp <= 0) {
          police.scene.remove(best.mesh);
          police.officers.splice(police.officers.indexOf(best), 1);
          addCrime(1.4);
        }
      } else if (bestKind === 'car') {
        best.hurt(def.dmg * 0.24);
        if (best.police) addCrime(0.8);
      }
    } else if (def.id !== 'fists') {
      addCrime(0.22);
    }
  }
}

// ---------------------------------------------------------------- update
const camTarget = new THREE.Vector3();
let last = performance.now();
let simNow = 0;
let simAcc = 0;
const SIM_STEP = 1 / 30;
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const frameDt = Math.min(0.6, (nowMs - last) / 1000);
  last = nowMs;
  const now = nowMs / 1000;

  if (S.mode === 'play') {
    // Fixed-timestep simulation: gameplay advances in 1/30s steps however
    // fast frames arrive, so the game plays at the same speed on a slow
    // software renderer as on a gaming GPU.
    simAcc += frameDt;
    let steps = 0;
    while (simAcc >= SIM_STEP && steps < 14) {
      simAcc -= SIM_STEP;
      simNow += SIM_STEP;
      S.crewNow = simNow;
      world.update(SIM_STEP, simNow);
      stepGame(SIM_STEP, simNow);
      updateParticles(SIM_STEP);
      if (S.mode !== 'play') { simAcc = 0; break; }
      steps++;
    }
    if (steps === 14) simAcc = 0;
  } else if (S.mode === 'menu') {
    // Slow menu orbit over Downtown.
    const t = now * 0.05;
    camera.position.set(Math.cos(t) * 90, 42, Math.sin(t) * 90);
    camera.lookAt(0, 6, 0);
    for (const t2 of traffic) t2.update(frameDt, world);
    world.update(frameDt, now);
    updateParticles(frameDt);
  } else {
    world.update(frameDt, now);
    updateParticles(frameDt);
  }
  for (const t of tracers) if (t.life > 0) { t.life -= frameDt; if (t.life <= 0) t.line.material.opacity = 0; }
  renderer.render(scene, camera);
}

function stepGame(dt, now) {
  S.clockMin += dt * 12; // 1 real second ≈ 12 game minutes… gentler: see below
  if (S.clockMin >= 24 * 60) { S.clockMin -= 24 * 60; S.day++; saveGame(); }
  refreshPlayerView();

  // ----- movement
  if (S.inCar) {
    const v = S.inCar;
    const input = {
      throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
      brake: !!keys.KeyS && v.speed > 1,
      drift: !!keys.Space,
    };
    if (input.throttle < 0 && v.speed <= 0.5) input.brake = false;
    const beforeSpeed = Math.abs(v.speed);
    v.drive(dt, input, world);
    if (beforeSpeed > 12 && Math.abs(v.speed) < beforeSpeed - 14) {
      addCrime(0.3);
      S.shake = Math.min(0.7, S.shake + 0.25);
      burst(v.x, 1, v.z, 10, 0xcccccc);
    }
    S.aimYaw = v.angle;
    // Run-over check
    for (const ped of peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - v.x, ped.z - v.z) < 2.2 && Math.abs(v.speed) > 5) {
        ped.knockDown();
        addCrime(1.0, 'You ran someone down!');
        S.shake = Math.min(0.8, S.shake + 0.3);
      }
    }
    // Police ramming hurts the player car
    for (const u of police.units) {
      if (Math.hypot(u.vehicle.x - v.x, u.vehicle.z - v.z) < 3.1 && Math.abs(u.vehicle.speed) > 6) {
        v.hurt(dt * 14);
        S.shake = Math.min(0.8, S.shake + dt * 2);
      }
    }
    sound.setEngine(Math.abs(v.speed) / v.model.top, true);
  } else {
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const sp = sprint ? 8.4 : 4.6;
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    const moving = (mx !== 0 || mz !== 0) && !hud.dialogueOpen;
    if (moving) {
      const len = Math.hypot(mx, mz);
      const worldYaw = S.aimYaw;
      const dx = (Math.sin(worldYaw) * mz + Math.cos(worldYaw) * mx) / len;
      const dz = (Math.cos(worldYaw) * mz - Math.sin(worldYaw) * mx) / len;
      const fixed = world.collide(S.x + dx * sp * dt, S.z + dz * sp * dt, 0.55);
      S.x = fixed.x; S.z = fixed.z;
      S.angle = Math.atan2(dx, dz);
      S.speed = sp;
      playerMesh.position.y = Math.abs(Math.sin(now * (sprint ? 11 : 8))) * 0.06;
    } else S.speed = 0;
    playerMesh.position.set(S.x, playerMesh.position.y, S.z);
    playerMesh.rotation.y = S.angle;
    const swing = moving ? Math.sin(now * 9) * 0.45 : 0;
    playerMesh.userData.armL.rotation.x = swing;
    playerMesh.userData.armR.rotation.x = -swing;
    if (S.mouseDown) tryShoot(nowMs());
    else if (keys.KeyJ) tryShoot(nowMs());
    sound.setEngine(0, false);
  }
  function nowMs() { return performance.now(); }

  // ----- world actors
  for (const t of traffic) t.update(dt, world);
  refreshPlayerView();
  for (const ped of peds) ped.update(dt, world, (S.inCar && Math.abs(S.inCar.speed) > 8) ? playerView : (police.stars > 0 ? playerView : null));

  // ----- police
  const ev = police.update(dt, playerView, world, sound);
  if (ev.damage > 0) {
    let dmg = ev.damage * dt * 2.2;
    if (S.armour > 0) { const absorbed = Math.min(S.armour, dmg * 0.7); S.armour -= absorbed; dmg -= absorbed; }
    S.health -= dmg;
    S.shake = Math.min(0.5, S.shake + 0.08);
  }
  if (ev.busted) { endRun('busted'); return; }
  if (S.inCar && S.inCar.dead) {
    hud.message('Your ride is burning — get out (F) before it blows!');
    S.inCar.smokeT += dt;
    if (S.inCar.smokeT > 2.5) {
      burst(S.inCar.x, 1.4, S.inCar.z, 40, 0xff6a2a);
      S.health -= 30;
      const v = S.inCar; v.occupied = false; S.inCar = null;
      S.x = v.x + 4; S.z = v.z + 4;
      playerMesh.visible = true;
      addCrime(0.8);
    }
  }
  if (S.health <= 0) { endRun('wasted'); return; }
  // Slow regen when calm
  if (police.stars === 0 && S.health < 100) S.health = Math.min(100, S.health + dt * 2.5);

  // ----- missions / activities
  refreshPlayerView();
  const mev = missions.update(dt, playerView);
  if (mev.msg) hud.message(mev.msg, 1.6);
  if (mev.stageDone && !mev.missionDone) { hud.message('Stage complete — on to the next marker.'); sound.pickup(); }
  if (mev.missionDone) {
    S.stats.missionsDone++;
    const mName = `MISSION ${missions.index} COMPLETE`;
    reward(mev.cash, mev.rp, districtAt(playerView.x, playerView.z).id);
    hud.message(`${mName}! +$${mev.cash} · +${mev.rp} RP`, 4.5);
    sound.complete();
    centerFlash(mName);
    if (missions.index >= 6) { S.mode = 'end'; showScreen('end-screen'); document.getElementById('end-stats').textContent = `Final haul: $${S.cash} · ${S.rp} RP · Packages ${missions.packagesFound}/12 · Cars stolen ${S.stats.carsStolen}`; }
    saveGame();
  }
  const rev = missions.updateRace(dt, playerView);
  if (rev && rev.checkpoint) { hud.message(`Checkpoint ${rev.checkpoint}/${rev.total}`); sound.pickup(); }
  if (rev && rev.finished) {
    S.stats.racesWon++;
    reward(700, 70, 'palms');
    hud.message(`RACE WON in ${rev.time.toFixed(1)}s! +$700 · +70 RP`, 4.5);
    sound.complete();
    saveGame();
  }
  missions.checkPackages(playerView, (n) => {
    S.packages = n;
    reward(150, 15, districtAt(playerView.x, playerView.z).id);
    hud.message(`Hidden ember package ${n}/12! +$150`, 3);
    sound.pickup();
    saveGame();
  });
  // Chop-shop: any stolen car delivered to the Foundry bay pays out.
  if (S.inCar && S.chopReady) {
    const d = Math.hypot(S.inCar.x - missions.chop.x, S.inCar.z - missions.chop.z);
    if (d < 9 && S.stats.carsStolen > 0) {
      const pay = 260 + Math.round((100 - S.inCar.damage) * 3);
      reward(pay, 30, 'yards');
      S.stats.chops++;
      hud.message(`CHOP SHOP: sold the ${S.inCar.model.name} for $${pay}! +30 RP`, 4);
      S.chopReady = false;
      setTimeout(() => { S.chopReady = true; }, 20000);
      saveGame();
    }
  }

  // ----- camera (lerped chase cam)
  const target = S.inCar ? S.inCar : { x: S.x, z: S.z, angle: S.angle };
  const back = S.inCar ? 10.5 : 7.5;
  const height = S.inCar ? 4.2 : 3.1;
  const desiredYaw = S.inCar ? target.angle : S.aimYaw;
  let dyaw = desiredYaw - S.camAngle;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  S.camAngle += dyaw * Math.min(1, dt * (S.inCar ? 3.2 : 5));
  const cx = target.x - Math.sin(S.camAngle) * back;
  const cz = target.z - Math.cos(S.camAngle) * back;
  camTarget.set(cx, height, cz);
  camera.position.lerp(camTarget, Math.min(1, dt * 6));
  S.shake = Math.max(0, S.shake - dt * 1.6);
  if (S.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * S.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * S.shake * 0.35;
  }
  camera.lookAt(target.x + Math.sin(S.camAngle) * 6, 1.6, target.z + Math.cos(S.camAngle) * 6);

  // ----- audio
  sound.updateRadio(dt);

  // ----- HUD
  updateHud();
}

let centerTimer = null;
function centerFlash(text) {
  const el = document.getElementById('center-msg');
  el.textContent = text;
  el.style.display = '';
  el.style.color = '#ffd94d';
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => { el.style.display = 'none'; }, 2400);
}

const clockFmt = () => {
  const h = Math.floor(S.clockMin / 60), m = Math.floor(S.clockMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
let hudTick = 0;
function updateHud() {
  hud.setStars(police.stars, police.heat);
  hud.setCashClock(S.cash, clockFmt(), S.day);
  hud.setRank(S.rp);
  hud.setHealth(S.health, S.armour);
  hud.setVehicle(!!S.inCar, S.inCar ? S.inCar.model.name.toUpperCase() : '', S.inCar ? Math.round(Math.abs(S.inCar.speed) * 3.6) : 0,
    S.inCar ? S.inCar.damage : 0, S.radioOn ? RADIO_STATIONS[S.station].name : '');
  hud.setTracker(missions.tracker(), missions.raceTarget());
  if (hudTick % 3 === 0) {
    hud.setDispatch(police.roster(playerView), police.stars);
    const crewArr = S.crew.map((c) => ({ readyAt: c.readyAt }));
    crewArr.now = S.crewNow;
    hud.setCrew(crewArr);
    hud.setWeapon(S.weapons, S.weapon);
  }
  const d = hud.districtBanner(playerView.x, playerView.z, S.standing);
  document.getElementById('districtline').textContent = d.name.toUpperCase();
  hudTick++;
  if (hudTick % 2 === 0) {
    hud.drawMinimap({ player: playerView, police, missions, traffic, packages: missions, lookoutUntil: S.lookoutUntil, now: S.crewNow });
  }
  hud.updateTimers(1 / 60);
}

// ---------------------------------------------------------------- screenshot staging (?shot=)
function stageShot(mode) {
  startGame(true);
  const setCar = () => {
    const v = nearestCar(S.x, S.z, 60) || parked[0];
    v.x = 12; v.z = 8; v.angle = 0.7; v.syncMesh();
    S.inCar = v; v.occupied = true;
    playerMesh.visible = false;
    return v;
  };
  if (mode === 'drive') {
    const v = setCar();
    v.speed = 19;
    police.setStars(2);
    hud.message('Downtown Cay — evening rush.');
  } else if (mode === 'chase') {
    const v = setCar();
    v.speed = 24; v.damage = 34;
    S.cash = 4870; S.rp = 860; S.armour = 45;
    police.setStars(5);
    for (let i = 0; i < 6; i++) police.spawnUnit(playerViewFresh(), i);
    police.spawnHeli(playerViewFresh());
    missions.startNext(); missions.finishIntro();
    S.radioOn = true; sound.setRadio(false, 0);
    hud.message('SKYWATCH overhead — lose them in Palma Heights!');
  } else if (mode === 'mission') {
    missions.startNext();
    hud.playDialogue(missions.active.mission.intro, () => missions.finishIntro());
    police.setStars(3);
    for (let i = 0; i < 3; i++) police.spawnUnit(playerViewFresh(), i);
    S.cash = 2350; S.rp = 420;
  } else if (mode === 'cover') {
    const v = setCar();
    v.speed = 21; v.damage = 12;
    S.cash = 6210; S.rp = 1450; S.armour = 70; S.health = 86;
    police.setStars(5);
    for (let i = 0; i < 7; i++) police.spawnUnit(playerViewFresh(), i);
    police.spawnOfficer(playerViewFresh(), 1);
    police.spawnHeli(playerViewFresh());
    police.spawnRoadblock(playerViewFresh());
    missions.startNext(); missions.finishIntro();
    missions.active.stage = 2;
    missions.armStage();
    S.radioOn = true;
    hud.message('MISSION 6 — the Ember Crown run. Every unit on the Cay is coming.');
  }
  refreshPlayerView();
  // Settle camera behind the action for the still.
  const t = S.inCar || { x: S.x, z: S.z, angle: S.angle };
  S.camAngle = t.angle;
  camera.position.set(t.x - Math.sin(S.camAngle) * 10.5, 4.2, t.z - Math.cos(S.camAngle) * 10.5);
  camera.lookAt(t.x + Math.sin(S.camAngle) * 6, 1.6, t.z + Math.cos(S.camAngle) * 6);
  updateHud();
}
function playerViewFresh() { refreshPlayerView(); return playerView; }

if (shotMode) {
  stageShot(shotMode);
} else {
  showScreen('menu-screen');
}

// Test/playtest handle (read-only state snapshot for automated checks).
window.__solara = {
  get state() {
    refreshPlayerView();
    return {
      mode: S.mode, stars: police.stars, units: police.units.length,
      officers: police.officers.length, heli: !!police.heli, blocks: police.blocks.length,
      speed: S.inCar ? Math.abs(S.inCar.speed) : S.speed, inCar: !!S.inCar,
      cash: S.cash, rp: S.rp, missionIndex: missions.index,
      packages: missions.packagesFound, health: S.health,
      x: playerView.x, z: playerView.z,
      heat: police.heat, spawnTimer: police.spawnTimer, seenTimer: police.seenTimer,
      desired: police.desiredUnits(),
    };
  },
  warpToCar: () => {
    const v = nearestCar(S.x, S.z, 400);
    if (v) { S.x = v.x + 2; S.z = v.z + 2; return { x: v.x, z: v.z, name: v.model.name }; }
    return null;
  },
  start: () => startGame(true),
  crime: () => police.addHeat(2.5),
  setStars: (n) => police.setStars(n),
  key: (code, down = true) => {
    const e = new KeyboardEvent(down ? 'keydown' : 'keyup', { code });
    if (down) keys[code] = true; else keys[code] = false;
    dispatchEvent(e);
  },
};

animate();
