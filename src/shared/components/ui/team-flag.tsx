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

  // Container dimensions — 3:2 ratio for all flags
  const w = size;
  const h = Math.round(size * 0.67);

  const containerCls = cn(
    'inline-flex items-center justify-center flex-shrink-0 rounded-sm overflow-hidden shadow-sm',
    className,
  );

  // No mapping for this code, or image errored → emoji fallback
  if (!src || errored) {
    return (
      <span
        role="img"
        aria-label={code}
        className={containerCls}
        style={{ width: w, height: h, fontSize: Math.round(h * 1.1) }}
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
        width={w}
        height={h}
        /**
         * object-contain: shows the entire flag without cropping,
         * even for square or portrait-ratio flags like Switzerland (1:1).
         */
        className="w-full h-full object-contain"
        onError={() => setErrored(true)}
        loading="eager"
      />
    </span>
  );
}
