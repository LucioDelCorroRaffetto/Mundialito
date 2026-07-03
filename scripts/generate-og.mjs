// One-off: genera public/og-image.png (1200x630) para el preview de link
// (WhatsApp/Twitter/etc). Corrida manual: node scripts/generate-og.mjs
// El texto se convierte a paths con opentype.js (mismo enfoque que
// scripts/text-to-path.mjs) para no depender de fuentes del sistema al
// renderizar el SVG con sharp/librsvg.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { shieldInner } from './shield-svg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, '../node_modules/@fontsource');
const outPath = path.resolve(__dirname, '../public/og-image.png');

function loadFont(file) {
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const spaceGroteskBold = loadFont(path.join(fontsDir, 'space-grotesk/files/space-grotesk-latin-700-normal.woff'));
const spaceGroteskMedium = loadFont(path.join(fontsDir, 'space-grotesk/files/space-grotesk-latin-600-normal.woff'));
const interRegular = loadFont(path.join(fontsDir, 'inter/files/inter-latin-400-normal.woff'));

/**
 * Path left-aligned, glyph por glyph (evita el pipeline de shaping/GSUB de
 * font.getPath(), que revienta con "lookupType 6 not yet supported" en
 * Space Grotesk).
 */
function leftPath(font, text, x, y, fontSize) {
  const scale = fontSize / font.unitsPerEm;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    parts.push(glyph.getPath(cursor, y, fontSize).toPathData(2));
    cursor += glyph.advanceWidth * scale;
  }
  return parts.join(' ');
}

// Escudo (mismos paths que src/shared/components/logo.tsx / shield-svg.mjs),
// escalado y centrado a la izquierda del canvas 1200x630.
const shield = `<g transform="translate(90, 65) scale(1.6)">${shieldInner('ball-clip-og')}</g>`;

const titlePath = leftPath(spaceGroteskBold, 'Mundialito', 470, 280, 58);
const taglinePath = leftPath(spaceGroteskMedium, 'El prode + fantasy del Mundial', 470, 330, 24);
const descLine1Path = leftPath(interRegular, 'Crea tu liga privada, predecí resultados', 470, 390, 22);
const descLine2Path = leftPath(interRegular, 'y armá tu equipo fantasy.', 470, 420, 22);
const urlPath = leftPath(spaceGroteskMedium, 'mundialito-pi.vercel.app', 470, 480, 22);

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0a0e1a"/>
  ${shield}
  <path d="${titlePath}" fill="#e8eef5"/>
  <path d="${taglinePath}" fill="#FFC857"/>
  <path d="${descLine1Path}" fill="#9aa5b1"/>
  <path d="${descLine2Path}" fill="#9aa5b1"/>
  <path d="${urlPath}" fill="#5a6472"/>
</svg>`;

const buf = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, buf);
console.log('Wrote', outPath, `(${buf.length} bytes)`);
