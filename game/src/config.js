// Solara Cay — game data: districts, weapons, crew, missions, vehicles.
// All names, people and places here are original inventions for this game.

export const CITY = {
  block: 46,          // metres between street centrelines
  half: 4,            // streets run from -half..+half blocks on each axis
  roadHalf: 7,        // half-width of a road surface
  island: 560,        // island ground plane size
};

export const DISTRICTS = [
  { id: 'marina',  name: 'Marina Sol',     cx: -140, cz: 150,  color: '#37c8d9', blurb: 'Yachts, boardwalk cafes and easy money.' },
  { id: 'oldtown', name: 'Old Ember Town', cx: 0,    cz: 150,  color: '#f2a541', blurb: 'Colonial lanes, market smoke, old loyalties.' },
  { id: 'harbor',  name: 'Port Cinder',    cx: 150,  cz: 150,  color: '#9db2c8', blurb: 'Cranes, containers and night-shift deals.' },
  { id: 'palms',   name: 'Palma Heights',  cx: -140, cz: 0,    color: '#7ed491', blurb: 'Palm avenues and hillside villas.' },
  { id: 'downtown',name: 'Downtown Cay',   cx: 0,    cz: 0,    color: '#ff5d8f', blurb: 'Neon towers, clubs and cameras everywhere.' },
  { id: 'yards',   name: 'The Foundry',    cx: 150,  cz: 0,    color: '#c86f3a', blurb: 'Smelters, chop shops and short tempers.' },
  { id: 'airport', name: 'Cay Airstrip',   cx: -140, cz: -150, color: '#b8c4ce', blurb: 'One runway, no questions asked.' },
  { id: 'bayview', name: 'Bayview Strip',  cx: 0,    cz: -150, color: '#ffd94d', blurb: 'Casinos, arcades and the famous Ember sign.' },
  { id: 'loma',    name: 'Loma Verde',     cx: 150,  cz: -150, color: '#5fae62', blurb: 'Farms, dirt tracks and quiet roads out.' },
];

export function districtAt(x, z) {
  let best = DISTRICTS[4], bd = 1e12;
  for (const d of DISTRICTS) {
    const dx = x - d.cx, dz = z - d.cz, q = dx * dx + dz * dz;
    if (q < bd) { bd = q; best = d; }
  }
  return best;
}

export const WEAPONS = [
  { id: 'fists',   name: 'FISTS',   dmg: 12, rate: 380, range: 2.6,  spread: 0,     ammo: Infinity, mag: Infinity, reload: 0,    auto: false, key: '1' },
  { id: 'pistol',  name: 'PISTOL',  dmg: 26, rate: 300, range: 70,  spread: 0.012, ammo: 90,  mag: 12, reload: 900,  auto: false, key: '2' },
  { id: 'smg',     name: 'SMG',     dmg: 15, rate: 95,  range: 55,  spread: 0.035, ammo: 240, mag: 30, reload: 1200, auto: true,  key: '3' },
  { id: 'shotgun', name: 'SHOTGUN', dmg: 11, rate: 750, range: 26,  spread: 0.09,  ammo: 40,  mag: 6,  reload: 1600, auto: false, key: '4', pellets: 7 },
  { id: 'rifle',   name: 'RIFLE',   dmg: 42, rate: 150, range: 130, spread: 0.004, ammo: 120, mag: 25, reload: 1400, auto: true,  key: '5' },
];

export const CREW = [
  { id: 'driver',   name: 'NIA TORRES',  role: 'DRIVER',   key: 'Q', cooldown: 45, desc: 'Plate swap: drops one wanted star.' },
  { id: 'mechanic', name: 'BRUNO KOVAC', role: 'MECHANIC', key: 'E', cooldown: 40, desc: 'Field repair: restores vehicle + armour.' },
  { id: 'lookout',  name: 'SABLE OKONKWO', role: 'LOOKOUT', key: 'R', cooldown: 35, desc: 'Eyes up: reveals police & packages on map.' },
];

export const CAR_MODELS = [
  { name: 'Cay Coupe',    top: 34, accel: 15, color: 0xe2483d },
  { name: 'Palma Sedan',  top: 28, accel: 11, color: 0x3d7de2 },
  { name: 'Ember Pickup', top: 25, accel: 10, color: 0xe2a03d },
  { name: 'Marina Cabrio',top: 38, accel: 17, color: 0x35c48d },
  { name: 'Foundry Van',  top: 22, accel: 8,  color: 0xb8bcc4 },
  { name: 'Loma Buggy',   top: 30, accel: 14, color: 0x8d5fd6 },
];

export const RANKS = [
  { rp: 0,    title: 'RANK 1 · BEACH RAT' },
  { rp: 150,  title: 'RANK 2 · ERRAND RUNNER' },
  { rp: 400,  title: 'RANK 3 · WHEELMAN' },
  { rp: 800,  title: 'RANK 4 · FIXER' },
  { rp: 1400, title: 'RANK 5 · SHOT CALLER' },
  { rp: 2200, title: 'RANK 6 · CAY LEGEND' },
];

export function rankFor(rp) {
  let cur = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (rp >= RANKS[i].rp) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { cur, next };
}

// Six staged story missions. Each stage: {kind, x, z, text, need?}
// kinds: goto | deliver (be in a car) | race (timed goto chain handled by race system) | survive (timed) | collect (pickups)
export const MISSIONS = [
  {
    id: 'm1', name: 'First Ember', giver: 'MAMA LUZ', district: 'oldtown',
    intro: [
      ['MAMA LUZ', 'You are the new face on my island, so listen well. My nephew left a package at the marina. Bring it home.'],
      ['YOU', 'And if the port police ask questions?'],
      ['MAMA LUZ', 'Then drive like the tide is chasing you, cariño.'],
    ],
    stages: [
      { kind: 'goto', x: -150, z: 168, text: 'Reach the Marina Sol boardwalk' },
      { kind: 'goto', x: -168, z: 128, text: 'Pick up the package at the pier' },
      { kind: 'deliver', x: 8, z: 138, text: 'Deliver the package to Mama Luz in Old Ember Town' },
    ],
    cash: 600, rp: 60,
  },
  {
    id: 'm2', name: 'Night Freight', giver: 'CAPT. REYES', district: 'harbor',
    intro: [
      ['CAPT. REYES', 'A container in Port Cinder holds cargo that must vanish before dawn. Move it to the Foundry.'],
      ['YOU', 'Customs patrols the causeway at night.'],
      ['CAPT. REYES', 'Then you had better be faster than customs.'],
    ],
    stages: [
      { kind: 'goto', x: 168, z: 168, text: 'Reach the Port Cinder container yard' },
      { kind: 'deliver', x: 138, z: 20, text: 'Drive the freight to the Foundry drop' },
      { kind: 'goto', x: 168, z: -18, text: 'Meet Reyes at the Foundry gate' },
    ],
    cash: 900, rp: 90,
  },
  {
    id: 'm3', name: 'Palm Avenue Run', giver: 'NIA TORRES', district: 'palms',
    intro: [
      ['NIA TORRES', 'The Palma Heights crew thinks their courier is untouchable. Prove them wrong — beat his line across the island.'],
      ['YOU', 'Three checkpoints, one car, no shortcuts through the villas?'],
      ['NIA TORRES', 'Shortcuts are the whole point, friend.'],
    ],
    stages: [
      { kind: 'goto', x: -168, z: -8, text: 'Reach the Palma Heights start line' },
      { kind: 'goto', x: -20, z: -60, text: 'Checkpoint 1: Downtown Cay underpass' },
      { kind: 'goto', x: 120, z: -120, text: 'Checkpoint 2: Loma Verde ridge' },
      { kind: 'goto', x: 30, z: -168, text: 'Finish at the Bayview Strip arch' },
    ],
    cash: 1100, rp: 110,
  },
  {
    id: 'm4', name: 'Static on the Strip', giver: 'DJ VERANO', district: 'bayview',
    intro: [
      ['DJ VERANO', 'Someone is jamming my station on the Bayview Strip. Three rooftop relays. Silence them.'],
      ['YOU', 'You want me to climb casino roofs in daylight?'],
      ['DJ VERANO', 'I want my music back. The roofs are just where the problem lives.'],
    ],
    stages: [
      { kind: 'goto', x: -30, z: -168, text: 'Reach relay one on the Strip' },
      { kind: 'goto', x: 22, z: -140, text: 'Reach relay two by the arcade' },
      { kind: 'goto', x: 52, z: -172, text: 'Reach relay three at the casino' },
      { kind: 'survive', seconds: 30, x: 52, z: -172, text: 'Hold the casino roof while the signal clears' },
    ],
    cash: 1300, rp: 130,
  },
  {
    id: 'm5', name: 'The Airstrip Ledger', giver: 'SABLE OKONKWO', district: 'airport',
    intro: [
      ['SABLE OKONKWO', 'A ledger at Cay Airstrip names every bribe on this island. Photograph it, then lose anyone who follows.'],
      ['YOU', 'And the men guarding the hangar?'],
      ['SABLE OKONKWO', 'They are why I hired someone expendable. No offence.'],
    ],
    stages: [
      { kind: 'goto', x: -168, z: -140, text: 'Infiltrate the Cay Airstrip hangar' },
      { kind: 'goto', x: -120, z: -168, text: 'Reach the runway tower with the ledger photo' },
      { kind: 'goto', x: -60, z: -60, text: 'Shake the tail: reach the Downtown safehouse' },
    ],
    cash: 1600, rp: 160,
  },
  {
    id: 'm6', name: 'Isle of Embers', giver: 'MAMA LUZ', district: 'downtown',
    intro: [
      ['MAMA LUZ', 'Tonight the whole island watches. Take the Ember Crown from the Downtown vault convoy and bring this story home.'],
      ['YOU', 'Every unit on the Cay will come for me.'],
      ['MAMA LUZ', 'Then give them a legend to chase, cariño. Stage by stage.'],
    ],
    stages: [
      { kind: 'goto', x: 14, z: 14, text: 'Intercept the convoy in Downtown Cay' },
      { kind: 'goto', x: 0, z: 96, text: 'Cross the Ember Bridge north' },
      { kind: 'deliver', x: -8, z: 150, text: 'Bring the Ember Crown to Mama Luz' },
      { kind: 'survive', seconds: 40, x: -8, z: 150, text: 'Hold Old Ember Town until the heat breaks' },
    ],
    cash: 3000, rp: 300,
  },
];

export const RADIO_STATIONS = [
  { name: 'RADIO VERANO 98.1', style: 'sunset synth', base: 110 },
  { name: 'EMBER FM 101.4', style: 'island groove', base: 98 },
  { name: 'CAY TALK 88.7', style: 'news & static', base: 0 },
];

export const SAVE_KEY = 'solara-cay-save-v1';
