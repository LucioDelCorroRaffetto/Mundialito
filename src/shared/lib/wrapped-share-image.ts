import type { Wrapped } from '@/shared/types/api';

const WIDTH = 1080;
const HEIGHT = 1920;

/** Lee un CSS custom property ya resuelto (theme claro/oscuro incluido). */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMetric(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: string,
  label: string,
  accent: string,
) {
  drawRoundedRect(ctx, x, y, w, 220, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '700 88px system-ui, -apple-system, sans-serif';
  ctx.fillText(value, x + w / 2, y + 128);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '600 30px system-ui, -apple-system, sans-serif';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 178);
}

/** Genera la imagen compartible del Wrapped como PNG (canvas 1080×1920). */
export async function renderWrappedImage(data: Wrapped): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');

  const accent = cssVar('--accent', '#eab308');

  // Fondo
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Marco
  const margin = 40;
  drawRoundedRect(ctx, margin, margin, WIDTH - margin * 2, HEIGHT - margin * 2, 48);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.stroke();

  // Wordmark
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 96px system-ui, -apple-system, sans-serif';
  ctx.fillText('MUNDIALITO', WIDTH / 2, 300);

  ctx.fillStyle = accent;
  ctx.font = '700 44px system-ui, -apple-system, sans-serif';
  ctx.fillText('MI WRAPPED 2026', WIDTH / 2, 370);

  // Métricas grandes: puntos, rank, exactos, racha — grilla 2×2
  const gridX = margin + 60;
  const gridW = WIDTH - (margin + 60) * 2;
  const gap = 32;
  const colW = (gridW - gap) / 2;
  const row1Y = 560;
  const row2Y = 560 + 220 + gap;

  drawMetric(ctx, gridX, row1Y, colW, String(data.totalPoints), 'Puntos', accent);
  drawMetric(ctx, gridX + colW + gap, row1Y, colW, data.globalRank != null ? `#${data.globalRank}` : '—', 'Ranking global', accent);
  drawMetric(ctx, gridX, row2Y, colW, String(data.exactCount), 'Exactos', accent);
  drawMetric(ctx, gridX + colW + gap, row2Y, colW, String(data.longestStreak), 'Racha máxima', accent);

  // Dato extra: accuracy
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 42px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${data.accuracy}% de precisión exacta`, WIDTH / 2, row2Y + 220 + 110);

  if (data.championPick) {
    ctx.font = '500 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const verdict = data.championPick.correct ? '✅ acertó' : 'no salió';
    ctx.fillText(`Campeón elegido: ${data.championPick.flag} ${data.championPick.name} (${verdict})`, WIDTH / 2, row2Y + 220 + 170);
  }

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '500 32px system-ui, -apple-system, sans-serif';
  ctx.fillText('mundialito-pi.vercel.app', WIDTH / 2, HEIGHT - margin - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar la imagen'));
    }, 'image/png');
  });
}

/**
 * Comparte la imagen vía Web Share API (con archivo) si está disponible;
 * si no (p. ej. desktop), la descarga como archivo.
 */
export async function shareOrDownloadWrappedImage(blob: Blob): Promise<void> {
  const file = new File([blob], 'mundialito-wrapped.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Mi Mundialito Wrapped',
        text: 'Mirá mi resumen del Mundial 2026 en Mundialito',
      });
      return;
    } catch (err) {
      // AbortError = el usuario canceló el share sheet — no es un error real.
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mundialito-wrapped.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
