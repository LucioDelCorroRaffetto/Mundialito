// One-off: convierte el wordmark del logo (Russo One) a paths SVG para no
// depender de la fuente en tiempo de render. Corrida manual, no forma parte
// del build. Uso: node scripts/text-to-path.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import opentype from 'opentype.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.resolve(
  __dirname,
  '../node_modules/@fontsource/russo-one/files/russo-one-latin-400-normal.woff'
);
const buf = readFileSync(fontPath);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

/** Layout manual con letter-spacing absoluto (px), centrado en centerX. */
function centeredPath(text, centerX, y, fontSize, letterSpacing) {
  const scale = fontSize / font.unitsPerEm;
  const advances = [...text].map((ch) => font.charToGlyph(ch).advanceWidth * scale);
  const totalWidth = advances.reduce((a, b) => a + b, 0) + letterSpacing * (text.length - 1);
  let x = centerX - totalWidth / 2;
  const parts = [];
  [...text].forEach((ch, i) => {
    const glyph = font.charToGlyph(ch);
    parts.push(glyph.getPath(x, y, fontSize).toPathData(2));
    x += advances[i] + letterSpacing;
  });
  return parts.join(' ');
}

const mundialito = centeredPath('MUNDIALITO', 100, 80, 22, 2);
const year = centeredPath('2026', 100, 187, 13, 4);

console.log('--- MUNDIALITO ---');
console.log(mundialito);
console.log('--- 2026 ---');
console.log(year);
