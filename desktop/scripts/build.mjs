import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRustTarget } from './targets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktopRoot = path.join(repoRoot, 'desktop');

function run(command, args, cwd = repoRoot, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
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
  run('npm', ['run', 'build'], repoRoot, {
    NEXT_PUBLIC_PROMPT_DESKTOP: process.env.NEXT_PUBLIC_PROMPT_DESKTOP || 'true',
    NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED:
      process.env.NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED || 'true',
    PROMPT_NSFW_GENERATOR_ENABLED: process.env.PROMPT_NSFW_GENERATOR_ENABLED || 'true',
  });
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

const wantsAppImage =
  process.platform === 'linux' &&
  (!bundles ||
    String(bundles)
      .split(',')
      .map((part) => part.trim())
      .includes('appimage'));
if (wantsAppImage) {
  run('bash', ['desktop/scripts/unbundle-appimage-wayland.sh'], repoRoot);
}
