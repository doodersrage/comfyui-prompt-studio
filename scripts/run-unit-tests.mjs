#!/usr/bin/env node
/**
 * Recursively collects every `*.test.ts` file under src/lib, adds the
 * desktop test target file, and runs them all through Node's built-in
 * test runner (via tsx for TS support).
 *
 * Replaces a hand-maintained list of test file paths in package.json's
 * `test` script: that list silently stopped growing at some point, so
 * newly added test files (51 of them, as of 2026-08-31, including
 * workflow-lightning-queue.test.ts) were never actually run in `npm test`
 * or CI. This script always reflects what's on disk.
 *
 * Any extra CLI args (e.g. --test-name-pattern=foo) are forwarded to
 * `node --test`.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const LIB_DIR = join(ROOT, 'src', 'lib');

function collectTestFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTestFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

const libTestFiles = collectTestFiles(LIB_DIR).sort();
const desktopTestFile = join(ROOT, 'desktop', 'scripts', 'targets.test.mjs');
const allTestFiles = [desktopTestFile, ...libTestFiles];

console.log(
  `Running ${allTestFiles.length} test files (${libTestFiles.length} under src/lib + 1 desktop target).`
);

const extraArgs = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--experimental-test-module-mocks',
    '--test',
    ...extraArgs,
    ...allTestFiles.map(f => relative(ROOT, f)),
  ],
  { stdio: 'inherit', cwd: ROOT }
);

process.exit(result.status ?? 1);
