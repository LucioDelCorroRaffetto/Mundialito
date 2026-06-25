import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { staggerItem } from '@/shared/lib/motion';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { UserPredictionHistoryItem } from '@/shared/hooks/use-user-profile';

/** Chip de equipo (bandera + código) usado en cada fila del historial. */
function TeamChip({
  flag,
  code,
  name,
  align = 'start',
}: {
  flag: string | null;
  code: string | null;
  name: string | null;
  align?: 'start' | 'end';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 min-w-0',
        align === 'end' && 'flex-row-reverse',
      )}
    >
      <TeamFlag code={code ?? ''} emoji={flag ?? undefined} size={20} />
      <span className="text-sm-s font-semibold text-text truncate" title={name ?? undefined}>
        {code ?? name ?? '—'}
      </span>
    </div>
  );
}

// Estilos semánticos por resultado del pronóstico. Definidos como objeto para
// que el color del marcador pronosticado y el badge de puntos sean coherentes.
const OUTCOME_STYLES: Record<
  UserPredictionHistoryItem['outcome'],
  { label: string; chip: string; score: string }
> = {
  // Marcador exacto = "carta legendaria" (Clash Royale): arcoíris holográfico.
  exact: {
    label: '✨ Exacto',
    chip: 'legendary-rainbow',
    score: 'legendary-rainbow-text',
  },
  correct: {
    label: 'Acertado',
    chip: 'bg-sky-500/15 text-sky-600 border-sky-500/40 dark:text-sky-400',
    score: 'text-sky-600 dark:text-sky-400',
  },
  missed: {
    label: 'Fallado',
    chip: 'bg-rose-500/15 text-rose-600 border-rose-500/40 dark:text-rose-400',
    score: 'text-muted',
  },
  pending: {
    label: 'En juego',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    score: 'text-text',
  },
};

/** Fila del historial de pronósticos de OTRO usuario (perfil ajeno). Reusada
 *  por la vista previa del perfil y por la página dedicada "ver todas". */
export function UserPredictionHistoryRow({
  item,
  reduced,
}: {
  item: UserPredictionHistoryItem;
  reduced: boolean;
}) {
  const style = OUTCOME_STYLES[item.outcome];
  const isExact = item.outcome === 'exact';
  return (
    <motion.div
      variants={staggerItem(reduced)}
      className={cn(
        'p-3 rounded-xl bg-card border flex flex-col gap-2',
        isExact ? 'border-transparent legendary-rainbow-border' : 'border-border',
      )}
    >
      {/* Fila de equipos + marcadores */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <TeamChip
            flag={item.homeTeam.flag}
            code={item.homeTeam.code}
            name={item.homeTeam.name}
          />
        </div>

        <div className="flex flex-col items-center gap-0.5 px-2 flex-shrink-0">
          {/* Marcador pronosticado (coloreado según resultado) */}
          <span className={cn('text-base-s font-display font-black tabular-nums', style.score)}>
            {item.prediction.homeScore} – {item.prediction.awayScore}
          </span>
          {/* Marcador real solo cuando ya hay resultado. Si está pendiente no
              repetimos "en juego" acá: el chip de abajo ya lo dice. */}
          {item.result && (
            <span className="text-[10px] text-muted tabular-nums">
              Real {item.result.homeScore}–{item.result.awayScore}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <TeamChip
            flag={item.awayTeam.flag}
            code={item.awayTeam.code}
            name={item.awayTeam.name}
            align="end"
          />
        </div>
      </div>

      {/* Fila de resultado + puntos */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
            style.chip,
          )}
        >
          {style.label}
        </span>
        {item.points != null && (
          <span className="text-xs-s font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
            +{item.points} pts
          </span>
        )}
      </div>
    </motion.div>
  );
}
