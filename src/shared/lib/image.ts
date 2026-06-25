/**
 * Resizes an image File to at most `maxPx` on its longest side,
 * then returns it as a base64 JPEG data URL.
 *
 * Mobile notes: iPhones shoot HEIC, which `<img>`/canvas can't always
 * decode, and recent models produce 48MP files that exceed iOS Safari's
 * ~16.7M-pixel canvas limit (drawImage silently yields a blank/black
 * canvas). We decode via `createImageBitmap` when available (it handles
 * orientation and large sources more reliably than `<img>`), and we
 * verify the output isn't blank so those failures surface as real errors
 * instead of saving an empty avatar.
 */
export async function resizeImageToBase64(
  file: File,
  maxPx = 256,
  quality = 0.82,
): Promise<string> {
  // HEIC/HEIF can't be decoded by the browser canvas pipeline. Detect it
  // early and give a clear, actionable message rather than a generic
  // "could not load image".
  const isHeic =
    /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    throw new Error(
      'El formato HEIC del iPhone no es compatible. En Ajustes › Cámara › Formatos, elegí "Más compatible" (JPEG), o compartí la foto desde Fotos (la convierte sola).',
    );
  }

  const source = await loadBitmap(file);
  try {
    const srcW = 'width' in source ? source.width : 0;
    const srcH = 'height' in source ? source.height : 0;
    const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no soporta canvas');

    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

    // iOS yields a fully-transparent/black canvas when the source blows the
    // pixel limit. Sample a few pixels; if everything is empty, fail loudly.
    if (isCanvasBlank(ctx, w, h)) {
      throw new Error('La foto es demasiado grande para procesarla en el celular');
    }

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (!dataUrl || dataUrl === 'data:,') {
      throw new Error('La foto es demasiado grande para procesarla en el celular');
    }
    return dataUrl;
  } finally {
    if ('close' in source && typeof source.close === 'function') source.close();
  }
}

/**
 * Decode a file to a drawable source. Prefers `createImageBitmap` (robust
 * with large images + EXIF orientation), falling back to `<img>` where it's
 * unavailable.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to the <img> path
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo abrir la imagen'));
    };
    img.src = objectUrl;
  });
}

function isCanvasBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const pts: Array<[number, number]> = [
      [Math.floor(w / 2), Math.floor(h / 2)],
      [Math.floor(w / 4), Math.floor(h / 4)],
      [Math.floor((3 * w) / 4), Math.floor((3 * h) / 4)],
    ];
    return pts.every(([x, y]) => {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      return r === 0 && g === 0 && b === 0 && a === 0;
    });
  } catch {
    // getImageData can throw on tainted canvases; assume not blank.
    return false;
  }
}
