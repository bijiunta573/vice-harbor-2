# Solara Cay — Isle of Embers

A 3D third-person open-world crime game for the make.fun **gta6-01 "Make GTA 6"** bounty, built with three.js and running entirely from static files — no build step, no network.

[![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bijiunta573/vice-harbor-2/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bijiunta573/vice-harbor-2/reward.svg)](https://make.fun/bounty/gta6-01)

Bounty: https://make.fun/bounty/gta6-01

## The game

You arrive on **Solara Cay**, a sun-baked island of nine districts — Marina Sol, Old Ember Town, Port Cinder, Palma Heights, Downtown Cay, The Foundry, Cay Airstrip, Bayview Strip and Loma Verde. Run staged story jobs for Mama Luz and her circle, steal any car on the street, and out-drive the Cay police: cruisers with named tactical roles, foot officers, roadblocks, and the Skywatch helicopter.

## Features

- **3D open world** — procedural low-poly coastal island: street grid with traffic lights' glow, emissive-window towers, neon signs, palm parks, a harbour with piers, boats and container cranes, the Ember Bridge, a lighthouse and the EMBER sign, all in a warm dusk grade with fog and tone mapping.
- **On foot + driving** — walk/sprint, mouse aim, enter/exit *any* car; arcade driving with drift, vehicle damage % that degrades handling, burning wrecks that explode.
- **Police system** — 0–5 star wanted with heat that cools out of sight; cruisers that ram, flank and intercept; foot officers who can bust you; roadblocks at 4–5 stars; a helicopter air unit with a searchlight at 5 stars; a live dispatch panel listing callsigns, roles and distances.
- **Six staged story missions** (3–4 stages each) with named characters and portrait dialogue, plus side activities: street races (checkpoint time trials), chop-shop deliveries and 12 hidden ember packages.
- **Crew abilities** — Nia Torres (driver: plate swap drops a star), Bruno Kovac (mechanic: field repair + armour), Sable Okonkwo (lookout: reveals police and packages on the minimap), each on cooldowns.
- **Five weapons** — fists, pistol, SMG, shotgun, rifle with distinct damage, spread, magazines and reloads.
- **Progression** — cash, career rank with RP, and per-district standing with a local perk at high standing.
- **Radio** — three synthesized WebAudio stations while driving; engine, gunfire, sirens and pickups are all synthesized too. No audio files.
- **Dense GTA-style HUD** — wanted stars with air-unit warning, cash + clock, rank/RP bar, mission tracker with stage count, dispatch panel, crew panel, weapon strip, speed/vehicle/damage readouts, health/armour, district banner with standing meter, and a round minimap with blips and a north marker.
- **Screens & save** — title menu, pause, BUSTED / WASTED, mission-complete stingers, story-complete screen, and a localStorage save with Continue.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Sprint |
| Mouse + click (or J) | Aim / shoot |
| F | Enter / exit car |
| Space | Drift (in car) |
| 1–5 | Weapon slots |
| Q / E / R | Crew abilities (driver / mechanic / lookout) |
| T | Radio station (in car) |
| M | Take next mission / start race at Palma |
| Enter / click | Advance dialogue |
| Esc / P | Pause |

## Run it locally

```sh
node serve.ts --port 8091   # then open http://localhost:8091
```

Any static file server pointed at `game/` works the same way. The dossier hand-in program is `main.ts` (Node 22): `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## Layout

- `game/index.html` — page, HUD DOM and styling
- `game/src/config.js` — districts, weapons, crew, missions, ranks, radio data
- `game/src/world.js` — procedural island city generation
- `game/src/entities.js` — vehicles, pedestrians, traffic, player avatar
- `game/src/police.js` — wanted system, cruisers, officers, roadblocks, helicopter
- `game/src/missions.js` — staged missions, races, packages, chop shop
- `game/src/hud.js` — HUD panels and the round minimap
- `game/src/audio.js` — synthesized radio and effects
- `game/src/main.js` — game loop, combat, camera, save, screenshot staging
- `game/vendor/three.module.min.js` — vendored three.js (MIT)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

Everything on this island — names, streets, people, story, art and sound — is an original invention for this entry. Licensed MIT (see `LICENSE`); three.js is MIT-licensed by its authors.
