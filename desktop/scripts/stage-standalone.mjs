import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.join(repoRoot, 'desktop', 'src-tauri', 'resources', 'server');

async function mustExist(filePath, hint) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${hint} Missing ${path.relative(repoRoot, filePath)}. Run npm run build first.`);
  }
}

async function vendorOnnxRuntimeNativeLibs() {
  // Next standalone tracing often copies onnxruntime_binding.node but omits sibling
  // libonnxruntime.so.* files. linuxdeploy then fails AppImage bundling with
  // "Could not find dependency: libonnxruntime.so.1".
  const srcRoot = path.join(repoRoot, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
  const destRoot = path.join(dest, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
  try {
    await stat(srcRoot);
  } catch {
    return;
  }
  await cp(srcRoot, destRoot, { recursive: true, force: true });
  console.log('Vendored onnxruntime-node native libs into staged server');
}

async function main() {
  const standalone = path.join(repoRoot, '.next', 'standalone');
  const staticDir = path.join(repoRoot, '.next', 'static');
  const publicDir = path.join(repoRoot, 'public');
  await mustExist(path.join(standalone, 'server.js'), 'Standalone server is not built.');
  await mustExist(staticDir, 'Next static assets are not built.');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(standalone, dest, { recursive: true });
  await mkdir(path.join(dest, '.next'), { recursive: true });
  await cp(staticDir, path.join(dest, '.next', 'static'), { recursive: true });
  await cp(publicDir, path.join(dest, 'public'), { recursive: true });
  await vendorOnnxRuntimeNativeLibs();
  console.log(`Staged standalone server at ${path.relative(repoRoot, dest)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
