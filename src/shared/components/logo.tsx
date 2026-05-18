import { useId } from 'react';

type Props = {
  size?: number;
  variant?: 'primary' | 'mono-light' | 'mono-dark';
  className?: string;
  ariaLabel?: string;
};

/**
 * Logo escudo Mundialito.
 * Composición: A1 forma clásica + B/P2 pelota Telstar + C2 3 estrellas + D1 dorado/negro + E3 borde doble + F1 wordmark Russo One.
 */
export function Logo({ size = 120, variant = 'primary', className, ariaLabel = 'Mundialito' }: Props) {
  const uid = useId().replace(/:/g, '');
  const ballClipId = `ball-clip-${uid}`;

  const shieldFill = variant === 'mono-light' ? 'none' : variant === 'mono-dark' ? '#0a0e1a' : '#FFC857';
  const shieldStroke = variant === 'mono-light' ? '#ffffff' : '#0a0e1a';
  const innerBorderStroke = variant === 'mono-light' ? '#ffffff' : variant === 'mono-dark' ? '#ffffff' : '#0a0e1a';
  const starFill = variant === 'mono-light' ? '#ffffff' : variant === 'mono-dark' ? '#ffffff' : '#0a0e1a';
  const bandFill = variant === 'mono-light' ? '#ffffff' : variant === 'mono-dark' ? '#ffffff' : '#0a0e1a';
  const bandText = variant === 'mono-light' ? '#0a0e1a' : variant === 'mono-dark' ? '#0a0e1a' : '#FFC857';
  const ribbonFill = bandFill;
  const ribbonText = bandText;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={size}
      height={(size * 215) / 200}
      viewBox="0 0 200 215"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M 30 25 L 170 25 L 170 100 Q 170 150 100 185 Q 30 150 30 100 Z"
        fill={shieldFill}
        stroke={shieldStroke}
        strokeWidth={variant === 'mono-light' ? 4 : 4}
      />
      <path
        d="M 40 35 L 160 35 L 160 95 Q 160 142 100 175 Q 40 142 40 95 Z"
        fill="none"
        stroke={innerBorderStroke}
        strokeOpacity={variant === 'mono-light' || variant === 'mono-dark' ? 0.5 : 1}
        strokeWidth={1.5}
      />
      <text x="80" y="52" textAnchor="middle" fontSize="14" fill={starFill}>★</text>
      <text x="100" y="49" textAnchor="middle" fontSize="16" fill={starFill}>★</text>
      <text x="120" y="52" textAnchor="middle" fontSize="14" fill={starFill}>★</text>

      <path d="M 30 60 L 170 60 L 170 85 L 30 85 Z" fill={bandFill} />
      <text
        x="100"
        y="80"
        textAnchor="middle"
        fontFamily="Russo One, sans-serif"
        fontSize="22"
        fill={bandText}
        letterSpacing="2"
      >
        MUNDIALITO
      </text>

      <g transform="translate(100, 125)">
        <circle r="22" fill="white" stroke="#0a0e1a" strokeWidth="2.5" />
        <polygon points="0,-9 8.6,-2.8 5.3,7.3 -5.3,7.3 -8.6,-2.8" fill="#0a0e1a" />
        <clipPath id={ballClipId}>
          <circle r="22" />
        </clipPath>
        <g clipPath={`url(#${ballClipId})`}>
          <polygon points="0,-25 7,-19 4,-12 -4,-12 -7,-19" fill="#0a0e1a" />
          <polygon points="22,-7 28,-2 26,7 19,7 15,1" fill="#0a0e1a" />
          <polygon points="-22,-7 -28,-2 -26,7 -19,7 -15,1" fill="#0a0e1a" />
          <polygon points="14,15 21,20 16,28 8,26 6,18" fill="#0a0e1a" />
          <polygon points="-14,15 -21,20 -16,28 -8,26 -6,18" fill="#0a0e1a" />
        </g>
        <circle r="22" fill="none" stroke="#0a0e1a" strokeWidth="2.5" />
      </g>

      <path d="M 50 168 L 150 168 L 145 195 L 55 195 Z" fill={ribbonFill} />
      <path d="M 50 168 L 45 175 L 50 178 Z" fill={variant === 'primary' ? '#5a4010' : ribbonFill} opacity={variant === 'primary' ? 1 : 0.6} />
      <path d="M 150 168 L 155 175 L 150 178 Z" fill={variant === 'primary' ? '#5a4010' : ribbonFill} opacity={variant === 'primary' ? 1 : 0.6} />
      <text
        x="100"
        y="187"
        textAnchor="middle"
        fontFamily="Russo One, sans-serif"
        fontSize="13"
        fill={ribbonText}
        letterSpacing="4"
      >
        2026
      </text>
    </svg>
  );
}
