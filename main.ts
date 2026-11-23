// Solara Cay — Isle of Embers: the hand-in program for make.fun gta6-01.
// The game itself is the static site in game/ (three.js vendored under
// game/vendor/, every other file hand-written for this entry). This program
// copies game/ and screenshots/ into the output directory and writes the
// dossier the judge reads, using the kit's buildDossier library unchanged.
// Run locally with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps below mirror the gate's own limits, so a local run fails the same
// way the sealed scorer would: dossier text capped at 160 KiB, at most 4
// screenshots of at most 256 KiB each, at most 993 entries / 48 MiB in game/,
// and no game path longer than 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
