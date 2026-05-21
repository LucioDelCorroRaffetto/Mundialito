/**
 * generate-pwa-icons.mjs
 * Converts SVG icons to PNG for PWA + iOS apple-touch-icon support.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const jobs = [
  {
    src: join(root, 'public/icons/icon-192.svg'),
    dst: join(root, 'public/icons/icon-192.png'),
    size: 192,
  },
  {
    src: join(root, 'public/icons/icon-512.svg'),
    dst: join(root, 'public/icons/icon-512.png'),
    size: 512,
  },
  {
    src: join(root, 'public/icons/icon-maskable.svg'),
    dst: join(root, 'public/icons/icon-maskable.png'),
    size: 512,
  },
  {
    src: join(root, 'public/apple-touch-icon.svg'),
    dst: join(root, 'public/apple-touch-icon.png'),
    size: 180,
  },
];

for (const { src, dst, size } of jobs) {
  const svg = readFileSync(src);
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(dst);
  console.log(`✓  ${dst.replace(root, '.')}`);
}

console.log('\nDone. Update vite.config.ts + index.html to reference .png files.');
