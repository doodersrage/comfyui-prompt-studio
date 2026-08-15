import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(repoRoot, 'public', 'icon.svg');
const destDir = path.join(repoRoot, 'desktop', 'src-tauri', 'icons');

const PNGS = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

async function main() {
  await mkdir(destDir, { recursive: true });
  const svg = sharp(source);
  for (const entry of PNGS) {
    await svg
      .clone()
      .resize(entry.size, entry.size)
      .png()
      .toFile(path.join(destDir, entry.name));
  }
  // Tauri accepts PNG stand-ins when icns/ico are generated in CI via `tauri icon`.
  await svg.clone().resize(256, 256).png().toFile(path.join(destDir, 'icon.ico'));
  await svg.clone().resize(512, 512).png().toFile(path.join(destDir, 'icon.icns'));
  console.log(`Wrote desktop icons from ${path.relative(repoRoot, source)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
