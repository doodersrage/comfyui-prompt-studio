#!/usr/bin/env node
/**
 * Postbuild: strip runtime data directories out of the standalone output.
 *
 * outputFileTracingExcludes in next.config.ts is supposed to keep
 * services/diffusers-engine/{loras,outputs} out of .next/standalone (they're
 * downloaded LoRAs / generated images — runtime data, not code), but Turbopack's
 * standalone file tracer has known bugs where excludes are silently ignored
 * (see vercel/next.js#84960, #88844). Rather than depend on that working, this
 * script deterministically deletes the bulky data dirs after the trace runs.
 *
 * Safe to delete outright: services/diffusers-engine/app/{main.py,lora_resolve.py}
 * both `mkdir(parents=True, exist_ok=True)` these directories on demand, so the
 * Python engine recreates them at runtime — nothing needs to pre-exist.
 */
import fs from 'node:fs';
import path from 'node:path';

const STANDALONE_ROOT = path.join(process.cwd(), '.next', 'standalone');
const PRUNE_TARGETS = [
  ['services', 'diffusers-engine', 'loras'],
  ['services', 'diffusers-engine', 'outputs'],
  ['services', 'diffusers-engine', '.venv'],
  ['services', '.venv'],
];

if (!fs.existsSync(STANDALONE_ROOT)) {
  // Not a standalone build (e.g. `next dev`, or output: 'standalone' unset) — nothing to do.
  process.exit(0);
}

let prunedBytes = 0;

function dirSizeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += fs.statSync(full).size;
        } catch {
          // ignore races
        }
      }
    }
  }
  return total;
}

for (const parts of PRUNE_TARGETS) {
  const target = path.join(STANDALONE_ROOT, ...parts);
  if (!fs.existsSync(target)) {
    continue;
  }
  const bytes = dirSizeBytes(target);
  fs.rmSync(target, { recursive: true, force: true });
  prunedBytes += bytes;
  console.log(`[prune-standalone] removed ${parts.join('/')} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

if (prunedBytes > 0) {
  console.log(`[prune-standalone] total pruned: ${(prunedBytes / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log('[prune-standalone] nothing to prune (already clean).');
}
