import { useMemo } from 'react';
import { useMotionPrefs } from '@/shared/lib/motion';
import type { LeagueStandingsHistory } from '@/shared/hooks/use-leagues';

const WIDTH = 360;
const HEIGHT = 200;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

// Paleta fija de 12 colores con buen contraste sobre --bg-card, en orden de
// asignación estable por posición (no por userId, así se ve consistente
// entre renders sin depender de un mapa persistido).
const PALETTE = [
  '#f97316', '#22c55e', '#3b82f6', '#ec4899', '#eab308', '#14b8a6',
  '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f43f5e', '#8b5cf6',
];

const MAX_LINES = 12;
const TOP_N = 10;

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Gráfico SVG propio (sin charting lib) de la evolución de puntos
 *  acumulados por día para los miembros de una liga. */
export function LeagueHistoryChart({
  history,
  currentUserId,
}: {
  history: LeagueStandingsHistory;
  currentUserId: number | undefined;
}) {
  const { reduced } = useMotionPrefs();
  const { days, series } = history;

  const { visible, hiddenCount, maxPoints } = useMemo(() => {
    let list = series;
    if (list.length > MAX_LINES) {
      const sorted = [...list].sort(
        (a, b) => (b.cumulativePoints.at(-1) ?? 0) - (a.cumulativePoints.at(-1) ?? 0),
      );
      const top = sorted.slice(0, TOP_N);
      const me = list.find((s) => s.userId === currentUserId);
      if (me && !top.some((s) => s.userId === me.userId)) top.push(me);
      list = top;
    }
    const max = Math.max(1, ...series.flatMap((s) => s.cumulativePoints));
    return { visible: list, hiddenCount: Math.max(0, series.length - list.length), maxPoints: max };
  }, [series, currentUserId]);

  if (days.length < 2) return null;

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xAt = (i: number) => PAD_X + (days.length === 1 ? 0 : (i / (days.length - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + plotH - (v / maxPoints) * plotH;

  const toPoints = (values: number[]) =>
    values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');

  // Labels: primero, último, y cada ~5 días en el medio — salteando
  // candidatos demasiado cerca de un borde ya incluido para que las
  // etiquetas ("DD/MM", ~26px) no se superpongan.
  const lastIdx = days.length - 1;
  const pxPerDay = lastIdx > 0 ? plotW / lastIdx : plotW;
  const minGapDays = Math.max(1, Math.ceil(26 / Math.max(pxPerDay, 1)));
  const labelIdxs = new Set<number>([0, lastIdx]);
  for (let i = 5; i < lastIdx - minGapDays; i += 5) labelIdxs.add(i);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Evolución de posiciones">
        {visible.map((s) => {
          const isMe = s.userId === currentUserId;
          const idx = series.indexOf(s);
          const color = isMe ? 'var(--accent)' : PALETTE[idx % PALETTE.length];
          const points = toPoints(s.cumulativePoints);
          const len = plotW + plotH; // aprox suficiente para el dasharray
          return (
            <polyline
              key={s.userId}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={isMe ? 3 : 1.5}
              strokeOpacity={isMe ? 1 : 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={
                reduced
                  ? undefined
                  : {
                      strokeDasharray: len,
                      strokeDashoffset: len,
                      animation: 'league-history-draw 600ms ease-out forwards',
                    }
              }
            />
          );
        })}
        {[...labelIdxs].sort((a, b) => a - b).map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={HEIGHT - 6}
            fontSize={9}
            textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            fill="var(--text-muted)"
          >
            {formatDay(days[i])}
          </text>
        ))}
      </svg>
      <style>{`
        @keyframes league-history-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
        {visible.map((s) => {
          const isMe = s.userId === currentUserId;
          const idx = series.indexOf(s);
          const color = isMe ? 'var(--accent)' : PALETTE[idx % PALETTE.length];
          return (
            <span key={s.userId} className="inline-flex items-center gap-1.5 text-xs-s text-muted">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {s.username}{isMe ? ' (vos)' : ''}
            </span>
          );
        })}
        {hiddenCount > 0 && (
          <span className="text-xs-s text-muted">+{hiddenCount} más</span>
        )}
      </div>
    </div>
  );
}
