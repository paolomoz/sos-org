#!/usr/bin/env node
/*
 * roundtrip-page.mjs — whole-page block-roundtrip for a generated page, using
 * the transform's sidecar map (maps/<page>.json) to pair prototype sections
 * with authored block instances. Usage: node roundtrip-page.mjs <page> [...]
 * Exit: worst block-roundtrip exit code across pages.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const REPO = '/Users/paolo/stardust/semrush/sos-org-repo';
const BASE = 'http://localhost:8791';

let worst = 0;
for (const page of process.argv.slice(2)) {
  const mapPath = new URL(`./maps/${page.toLowerCase().replace(/\//g, '__')}.json`, import.meta.url).pathname;
  if (!existsSync(mapPath)) { console.error(`no map for ${page}`); worst = Math.max(worst, 1); continue; }
  const rtMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const args = [
    'skills/deploy/scripts/block-roundtrip.mjs',
    `${BASE}/${page}/index.html`,
    `content/${page.toLowerCase()}.html`,
  ];
  for (const [name, sels] of Object.entries(rtMap)) {
    const uniq = [...new Set(sels.filter(Boolean))];
    if (uniq.length) args.push('--map', `${name}=${uniq.join(', ')}`);
  }
  console.log(`\n===== ${page}`);
  const r = spawnSync('node', args, { cwd: REPO, stdio: 'inherit' });
  worst = Math.max(worst, r.status ?? 1);
}
process.exit(worst);
