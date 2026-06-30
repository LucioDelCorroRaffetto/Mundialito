import { motion } from 'framer-motion';
import { slideUpVariants, useMotionPrefs } from '@/shared/lib/motion';
import type { TournamentPhase } from '@/shared/hooks/use-tournament-phase';

interface Props {
  phase: TournamentPhase;
  onViewBracket?: () => void;
}

export function KnockoutPhaseBanner({ phase, onViewBracket }: Props) {
  const { reduced } = useMotionPrefs();

  if (phase.kind !== 'knockout' && phase.kind !== 'completed') return null;

  const isCompleted = phase.kind === 'completed';
  const accentColor = isCompleted ? '#eab308' : phase.accentColor;
  const isLive = !isCompleted && phase.liveCount > 0;

  const label = isCompleted ? 'TORNEO FINALIZADO' : phase.label.toUpperCase();

  let statusLine: string | null = null;
  if (!isCompleted) {
    const { liveCount, matchesLeft } = phase;
    if (liveCount > 0) {
      const scheduled = matchesLeft - liveCount;
      statusLine = scheduled > 0
        ? `${liveCount} en vivo · ${scheduled} por jugar`
        : `${liveCount} en vivo`;
    } else {
      statusLine = `${matchesLeft} partido${matchesLeft !== 1 ? 's' : ''} por jugar`;
    }
  } else {
    statusLine = 'El campeón ya fue coronado';
  }

  return (
    <motion.div
      variants={slideUpVariants(reduced, 10)}
      initial="initial"
      animate="animate"
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: `${accentColor}40` }}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{ backgroundColor: `${accentColor}0d` }}
      >
        {/* Barra lateral de color */}
        <div
          className="w-0.5 self-stretch rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        />

        {/* Icono trofeo solo en completed */}
        {isCompleted && (
          <span className="text-base flex-shrink-0" aria-hidden>🏆</span>
        )}

        {/* Textos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isLive && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0"
                aria-label="En vivo"
              />
            )}
            <p
              className="text-[11px] font-bold uppercase tracking-widest leading-tight"
              style={{ color: accentColor }}
            >
              {label}
            </p>
          </div>
          {statusLine && (
            <p className="text-xs text-muted mt-0.5 leading-tight">{statusLine}</p>
          )}
        </div>

        {/* CTA: solo en knockout, no en completed */}
        {!isCompleted && onViewBracket && (
          <button
            onClick={onViewBracket}
            className="text-[11px] font-semibold flex-shrink-0 whitespace-nowrap"
            style={{ color: accentColor }}
          >
            Ver cuadro
          </button>
        )}
      </div>
    </motion.div>
  );
}
