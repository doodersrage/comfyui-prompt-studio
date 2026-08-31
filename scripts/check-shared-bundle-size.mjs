#!/usr/bin/env node
/**
 * Budgets the JS every visitor downloads on first load, as opposed to
 * size-limit.json's check, which sums *all* emitted client chunks
 * (every route's code, including on-demand data like the wardrobe
 * catalog that only Fitting Room / Day Planner / Character visitors
 * ever fetch). That aggregate necessarily grows every time a new
 * per-route feature ships; this one should not, so a regression here
 * is a real "everyone's page got heavier" signal.
 *
 * Reads `rootMainFiles` from the production build's build-manifest.json
 * -- the chunks Next attaches to every page's bootstrap -- and gzips
 * them the same way size-limit does.
 */

import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MANIFEST_PATH = join(ROOT, '.next', 'build-manifest.json');
const BUDGET_BYTES = 300 * 1024; // 300 KB gzip; current baseline is ~128 KB.

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `check-shared-bundle-size: ${MANIFEST_PATH} not found. Run "npm run build" first (this check reads the production build output, same as "npm run size").`
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const files = manifest.rootMainFiles ?? [];

if (files.length === 0) {
  console.error(
    'check-shared-bundle-size: build-manifest.json has no rootMainFiles. Next.js may have changed this manifest shape -- update scripts/check-shared-bundle-size.mjs to match, or drop this check if the concept no longer applies.'
  );
  process.exit(1);
}

let totalGzip = 0;
const rows = [];
for (const file of files) {
  const full = join(ROOT, '.next', file);
  if (!existsSync(full)) {
    console.error(`check-shared-bundle-size: manifest references missing file ${full}`);
    process.exit(1);
  }
  const raw = readFileSync(full);
  const gz = gzipSync(raw).length;
  totalGzip += gz;
  rows.push({ file, raw: raw.length, gz });
}

for (const row of rows) {
  console.log(
    `  ${row.file}  ${(row.raw / 1024).toFixed(1)} KB raw -> ${(row.gz / 1024).toFixed(1)} KB gzip`
  );
}
console.log(
  `Shared/initial JS (gzip): ${(totalGzip / 1024).toFixed(1)} KB / ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget`
);

if (totalGzip > BUDGET_BYTES) {
  console.error(
    `check-shared-bundle-size: shared bundle grew past budget (${(totalGzip / 1024).toFixed(1)} KB > ${(BUDGET_BYTES / 1024).toFixed(0)} KB). This is code every visitor downloads on first load -- either trim what's imported from src/app/layout.tsx / the root shell, or raise BUDGET_BYTES here deliberately.`
  );
  process.exit(1);
}
