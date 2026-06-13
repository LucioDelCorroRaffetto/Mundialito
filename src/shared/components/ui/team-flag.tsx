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

  const src    = getFlagUrl(code, size);
  const src2x  = getFlagUrl2x(code, size);

  // Square container so we don't squash square flags (Switzerland 1:1)
  // nor stretch ultra-wide ones (Qatar 28:11). object-contain inside
  // keeps each flag at its natural ratio centered on the box.
  const w = size;
  const h = size;

  const containerCls = cn(
    'inline-flex items-center justify-center flex-shrink-0',
    className,
  );

  // No mapping for this code, or image errored → emoji fallback.
  // Emoji is rendered slightly smaller so it doesn't visually dominate
  // the line vs. neighbouring real flag images.
  if (!src || errored) {
    return (
      <span
        role="img"
        aria-label={code}
        className={containerCls}
        style={{ width: w, height: h, fontSize: Math.round(h * 0.95), lineHeight: 1 }}
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
         * object-contain on a square box shows the entire flag without
         * cropping for any aspect ratio (square Switzerland, ultra-wide
         * Qatar, standard 3:2). The drop-shadow gives the flag a clean
         * edge without the boxy rounded-rectangle look from before.
         */
        className="max-w-full max-h-full object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
        onError={() => setErrored(true)}
        loading="eager"
      />
    </span>
  );
}
