import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRustTarget } from './targets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktopRoot = path.join(repoRoot, 'desktop');

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const rustTarget = process.env.RUST_TARGET?.trim() || hostRustTarget();
const bundles = process.argv.includes('--bundles')
  ? process.argv[process.argv.indexOf('--bundles') + 1]
  : process.env.TAURI_BUNDLES;

if (!process.env.SKIP_NEXT_BUILD) {
  run('npm', ['run', 'build']);
}
run('node', ['desktop/scripts/generate-icons.mjs']);
run(
  'npx',
  ['tauri', 'icon', path.join(repoRoot, 'public', 'icon.svg'), '-o', 'src-tauri/icons'],
  desktopRoot
);
run('node', ['desktop/scripts/stage-standalone.mjs']);
run('node', ['desktop/scripts/fetch-node.mjs', rustTarget]);
const tauriArgs = ['tauri', 'build'];
if (bundles) {
  tauriArgs.push('--bundles', bundles);
}
run('npx', tauriArgs, desktopRoot);
