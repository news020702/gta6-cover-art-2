// main.ts — the entrypoint of the Neon Harbor cover-art entry.
//
// Copies the static app and the screenshots into the output directory and
// writes the dossier there with make.fun's own buildDossier. Runs with plain
// node, no build step and no install:
//
//   node main.ts
//
// The scorer runs this same file on what is handed in, so it must read
// only the repository and write only the output directory. The output
// directory is MAKEFUN_OUTPUT_DIR when set, otherwise /output. It never
// removes the output directory itself: in the grader the filesystem is
// read-only except /output and /tmp, so removing /output (which needs write
// permission on its parent, /) throws and the program exits 1.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repo = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(repo, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

writeFileSync(join(out, 'dossier.json'), dossier);
const shots = readdirSync(join(out, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f));
console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
console.log(`copied app/ and ${shots.length} screenshot(s) into ${out}`);
