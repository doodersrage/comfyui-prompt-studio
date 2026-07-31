import { spawnSync } from 'child_process';
import fs from 'fs';

// git cat-file --batch expects NUL-terminated paths on stdin.
// Let's pipe the filename with a null terminator.

try {
  const proc = spawnSync('git', ['--no-pager', 'cat-file', '--batch', 'HEAD'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  // Pipe stdin to git cat-file --batch
  if (proc.stdin) {
    proc.stdin.write('src/lib/browser-image-dimensions.test.ts\0');
    proc.stdin.end();
  }
} catch (e) {
  console.error('Error:', e.message, e.stdout);
}
