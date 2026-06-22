import { useState } from 'react';
import { getFlagUrl, getFlagUrl2x } from '@/shared/lib/flag';
import { cn } from '@/shared/lib/cn';

interface TeamFlagProps {
  /** FIFA 3-letter code (e.g. 'ARG', 'BRA') */
  code: string;
  /** Emoji fallback (e.g. '🇦🇷') */
  emoji?: string;
  /** Visual size in px. Default 24 */
  size?: 16 | 20 | 24 | 32 | 40 | 48 | 64;
  className?: string;
}

/**
 * Renders a country flag from flagcdn.com inside a fixed-size container.
 *
 * Using object-contain (not object-cover) so flags with non-standard aspect
 * ratios (e.g. Switzerland 1:1, Nepal 4:5) aren't cropped.
 *
 * When the image fails to load, falls back to the emoji rendered inside the
 * same fixed-size container so layout stays consistent.
 */
export function TeamFlag({ code, emoji, size = 24, className }: TeamFlagProps) {
  const [errored, setErrored] = useState(false);

  // Fixed 3:2 footprint with object-cover — same shape and size for every
  // country. This is how FIFA / ESPN / BBC render flags in compact lists:
  // wide flags like Qatar get a slight side-crop, square ones like
  // Switzerland get a slight top/bottom crop, and all three of Argentina /
  // Brazil / etc. land naturally. Visually consistent, no orphan flag.
  const w = size;
  const h = Math.round(size * 0.67);

  const src    = getFlagUrl(code, size);
  const src2x  = getFlagUrl2x(code, size);

  const containerCls = cn(
    'inline-flex items-center justify-center flex-shrink-0 rounded-[2px] overflow-hidden',
    className,
  );

  // Emoji fallback occupies the same 3:2 box so the surrounding layout
  // stays put when flagcdn has no mapping for this code.
  if (!src || errored) {
    return (
      <span
        role="img"
        aria-label={code}
        className={containerCls}
        style={{ width: w, height: h, fontSize: Math.round(h * 1.05), lineHeight: 1 }}
      >
        {emoji ?? code}
      </span>
    );
  }

  return (
    <span className={containerCls} style={{ width: w, height: h }}>
      <img
        src={src}
        srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
        alt={code}
        /**
         * object-cover fills the 3:2 box for every aspect ratio. Tiny
         * inner shadow gives the chip definition against light cards
         * without the heavy outer border the original had.
         */
        className="w-full h-full object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
        onError={() => setErrored(true)}
        // lazy: en /matches se renderizan hasta ~200 partidos × 2 banderas;
        // con eager eran ~400 requests a flagcdn.com compitiendo con los chunks
        // de la app en el primer paint móvil. El contenedor ya tiene tamaño
        // fijo, así que el lazy no causa layout shift.
        loading="lazy"
      />
    </span>
  );
}
