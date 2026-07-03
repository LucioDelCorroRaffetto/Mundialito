// One-off: regenera favicon/apple-touch-icon/icons a partir del escudo con
// paths (sin fontFamily). Corrida manual: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { shieldInner } from './shield-svg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

function squareIconSvg(clipId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 215">
  <rect width="200" height="215" fill="#0a0e1a"/>
  ${shieldInner(clipId)}
</svg>`;
}

// Maskable: escudo centrado dentro del safe-zone (círculo al 40% de radio),
// mismo transform que el icon-maskable.svg original.
function maskableIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0e1a"/>
  <g transform="translate(256, 256) scale(1.4) translate(-100, -107.5)">
    ${shieldInner('ball-clip-mask')}
  </g>
</svg>`;
}

async function writeSvgAndPng(svg, svgPath, pngPath, size) {
  writeFileSync(svgPath, svg);
  const buf = await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size, { fit: 'fill' })
    .png()
    .toBuffer();
  writeFileSync(pngPath, buf);
  console.log('Wrote', svgPath, 'and', pngPath, `(${size}x${size})`);
}

await writeSvgAndPng(
  squareIconSvg('ball-clip-apple'),
  path.join(publicDir, 'apple-touch-icon.svg'),
  path.join(publicDir, 'apple-touch-icon.png'),
  180
);

await writeSvgAndPng(
  squareIconSvg('ball-clip-192'),
  path.join(publicDir, 'icons/icon-192.svg'),
  path.join(publicDir, 'icons/icon-192.png'),
  192
);

await writeSvgAndPng(
  squareIconSvg('ball-clip-512'),
  path.join(publicDir, 'icons/icon-512.svg'),
  path.join(publicDir, 'icons/icon-512.png'),
  512
);

await writeSvgAndPng(
  maskableIconSvg(),
  path.join(publicDir, 'icons/icon-maskable.svg'),
  path.join(publicDir, 'icons/icon-maskable.png'),
  512
);
