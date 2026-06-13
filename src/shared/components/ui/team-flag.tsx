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

  // Height-driven sizing: every flag shares the same visual height; width
  // flows from the country's natural aspect ratio. This is how FIFA, BBC
  // and ESPN render flags inline — Switzerland looks like a small square,
  // Qatar like a wide stripe, but both feel like flags rather than tiny
  // images stranded inside a big square box.
  //
  // We request a flagcdn width sized to the *widest* aspect (~3:2) so the
  // image stays sharp even for unusually wide flags like Qatar.
  const flagWidth = Math.round(size * 1.5);
  const src    = getFlagUrl(code, snapFlagWidth(flagWidth));
  const src2x  = getFlagUrl2x(code, snapFlagWidth(flagWidth));

  const containerCls = cn(
    'inline-flex items-center flex-shrink-0',
    className,
  );

  // Emoji fallback uses a square footprint so the line-height stays
  // predictable even if the code has no flagcdn mapping.
  if (!src || errored) {
    return (
      <span
        role="img"
        aria-label={code}
        className={cn(containerCls, 'justify-center')}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.95), lineHeight: 1 }}
      >
        {emoji ?? code}
      </span>
    );
  }

  return (
    <span className={containerCls} style={{ height: size }}>
      <img
        src={src}
        srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
        alt={code}
        /**
         * Height-locked, width auto: lets each flag render at its real
         * ratio so Switzerland is small-square and Qatar is wide-stripe.
         * drop-shadow gives a soft edge without the boxy frame.
         */
        className="h-full w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
        style={{ height: size }}
        onError={() => setErrored(true)}
        loading="eager"
      />
    </span>
  );
}

/** Internal helper — snaps to the valid flagcdn widths for a sharp PNG. */
function snapFlagWidth(target: number): 16 | 20 | 24 | 32 | 40 | 48 | 64 {
  if (target <= 16) return 16;
  if (target <= 20) return 20;
  if (target <= 24) return 24;
  if (target <= 32) return 32;
  if (target <= 40) return 40;
  if (target <= 48) return 48;
  return 64;
}
