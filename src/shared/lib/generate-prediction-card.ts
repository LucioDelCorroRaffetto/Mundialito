export interface PredictionCardData {
  homeFlag: string;
  homeName: string;
  homeCode: string;
  homeScore: number;
  awayFlag: string;
  awayName: string;
  awayCode: string;
  awayScore: number;
  username?: string;
  accentColor?: string; // ej: '#3b82f6'
}

export async function generatePredictionCardBlob(data: PredictionCardData): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const accent = data.accentColor ?? '#3b82f6';

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a0a');
  bg.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Accent halo top
  const halo = ctx.createRadialGradient(W / 2, 200, 50, W / 2, 200, 600);
  halo.addColorStop(0, accent + '55');
  halo.addColorStop(1, accent + '00');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, 800);

  // Header: logo + brand
  ctx.fillStyle = accent;
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Mundialito 🏆', W / 2, 200);

  ctx.fillStyle = '#888';
  ctx.font = '36px sans-serif';
  ctx.fillText('Mi pronóstico', W / 2, 270);

  // Banderas y nombres
  const TEAM_Y = 600;
  ctx.font = '180px serif';
  ctx.fillText(data.homeFlag, W / 4, TEAM_Y);
  ctx.fillText(data.awayFlag, (3 * W) / 4, TEAM_Y);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(data.homeCode, W / 4, TEAM_Y + 100);
  ctx.fillText(data.awayCode, (3 * W) / 4, TEAM_Y + 100);

  ctx.fillStyle = '#aaa';
  ctx.font = '32px sans-serif';
  ctx.fillText(data.homeName, W / 4, TEAM_Y + 150);
  ctx.fillText(data.awayName, (3 * W) / 4, TEAM_Y + 150);

  // Marcador en card central
  const cardY = TEAM_Y + 280;
  const cardH = 320;
  ctx.fillStyle = '#1f1f1f';
  drawRoundedRect(ctx, 80, cardY, W - 160, cardH, 32);
  ctx.fill();

  ctx.strokeStyle = accent + '66';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 80, cardY, W - 160, cardH, 32);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = 'bold 220px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.homeScore}  −  ${data.awayScore}`, W / 2, cardY + 220);

  ctx.fillStyle = '#888';
  ctx.font = '32px sans-serif';
  ctx.fillText('MI PREDICCIÓN', W / 2, cardY + 280);

  // Footer: usuario y CTA
  if (data.username) {
    ctx.fillStyle = '#fff';
    ctx.font = '44px sans-serif';
    ctx.fillText(`— ${data.username}`, W / 2, H - 280);
  }

  ctx.fillStyle = accent;
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('mundialito.app', W / 2, H - 180);

  ctx.fillStyle = '#666';
  ctx.font = '28px sans-serif';
  ctx.fillText('Sumate al prode de tus amigos', W / 2, H - 120);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate blob'));
    }, 'image/png', 0.95);
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Intenta compartir vía Web Share API. Si no hay soporte, descarga el archivo.
 */
export async function sharePredictionCard(data: PredictionCardData, filename = 'mi-pronostico.png') {
  const blob = await generatePredictionCardBlob(data);
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Mi pronóstico — Mundialito',
        text: `${data.homeCode} ${data.homeScore} - ${data.awayScore} ${data.awayCode}`,
      });
      return { shared: true };
    } catch (e) {
      // User cancelled o share falló — caer al download
    }
  }

  // Fallback: descargar
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { shared: false, downloaded: true };
}
