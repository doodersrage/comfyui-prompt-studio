import { spawnSync } from 'child_process';
import pathModule from 'path';

// Use git cat-file --batch to dump the blob content for browser-image-dimensions.test.ts
const proc = spawnSync('git', ['--no-pager', 'cat-file', '--batch', 'HEAD'], {
  cwd: process.cwd(),
  stdio: 'pipe',
  encoding: 'utf-8',
  stdin: 'src/lib/browser-image-dimensions.test.ts\n',
});

console.log('stdout:', proc.stdout);
if (proc.stderr) console.error('stderr:', proc.stderr);
