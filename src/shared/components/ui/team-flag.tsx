import { useState } from 'react';
import { getFlagUrl, getFlagUrl2x } from '@/shared/lib/flag';

interface TeamFlagProps {
  /** FIFA 3-letter code (e.g. 'ARG', 'BRA') */
  code: string;
  /** Emoji fallback (e.g. '🇦🇷') */
  emoji?: string;
  /** Image size in px (also the flagcdn width). Default 24 */
  size?: 16 | 20 | 24 | 32 | 40 | 48 | 64;
  className?: string;
}

/**
 * Renders a country flag image from flagcdn.com.
 * Falls back to the emoji if the code is unknown or the image fails to load.
 */
export function TeamFlag({ code, emoji, size = 24, className }: TeamFlagProps) {
  const [errored, setErrored] = useState(false);

  const src = getFlagUrl(code, size);
  const src2x = getFlagUrl2x(code, size);

  if (!src || errored) {
    // Fallback to emoji
    return (
      <span
        role="img"
        aria-label={code}
        style={{ fontSize: size * 0.85 }}
        className={className}
      >
        {emoji ?? code}
      </span>
    );
  }

  return (
    <img
      src={src}
      srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
      alt={code}
      width={size}
      height={Math.round(size * 0.67)} // flags are roughly 3:2
      className={`inline-block object-cover rounded-sm shadow-sm ${className ?? ''}`}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  );
}
