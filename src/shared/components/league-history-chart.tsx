import { useMemo, useState } from 'react';
import { useMotionPrefs } from '@/shared/lib/motion';
import { cn } from '@/shared/lib/cn';
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

const TOP_N = 10;
const MAX_DEFAULT_LINES = 12;

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Gráfico SVG propio (sin charting lib) de la evolución de puntos
 *  acumulados por día para los miembros de una liga. La leyenda funciona
 *  como toggles para elegir a quiénes comparar, y un slider de doble
 *  handle permite acotar el rango de fechas (con re-escalado del eje Y). */
export function LeagueHistoryChart({
  history,
  currentUserId,
}: {
  history: LeagueStandingsHistory;
  currentUserId: number | undefined;
}) {
  const { reduced } = useMotionPrefs();
  const { days, series } = history;
  const lastIdx = days.length - 1;

  // Por defecto: top N por puntos + el usuario actual (igual que antes).
  const defaultIds = useMemo(() => {
    let list = series;
    if (list.length > MAX_DEFAULT_LINES) {
      const sorted = [...list].sort(
        (a, b) => (b.cumulativePoints.at(-1) ?? 0) - (a.cumulativePoints.at(-1) ?? 0),
      );
      const top = sorted.slice(0, TOP_N);
      const me = list.find((s) => s.userId === currentUserId);
      if (me && !top.some((s) => s.userId === me.userId)) top.push(me);
      list = top;
    }
    return new Set(list.map((s) => s.userId));
  }, [series, currentUserId]);

  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);

  const effectiveIds = selectedIds ?? defaultIds;
  const [start, end] = range ?? [0, lastIdx];
  const isZoomed = start > 0 || end < lastIdx;
  const isCustomSelection = selectedIds !== null;

  const visible = series.filter((s) => effectiveIds.has(s.userId));

  const toggleUser = (userId: number) => {
    const next = new Set(effectiveIds);
    if (next.has(userId)) {
      if (next.size === 1) return; // siempre dejar al menos una curva
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedIds(next);
  };

  const setStart = (v: number) => setRange([Math.min(v, end - 1), end]);
  const setEnd = (v: number) => setRange([start, Math.max(v, start + 1)]);

  if (days.length < 2) return null;

  const windowLen = end - start + 1;
  const windowValues = visible.map((s) => s.cumulativePoints.slice(start, end + 1));

  // Eje Y: con el rango completo arranca en 0 (vista clásica); con zoom se
  // ajusta a min/max de las curvas visibles en la ventana para separarlas.
  const flat = windowValues.flat();
  const rawMax = Math.max(1, ...flat);
  const rawMin = isZoomed ? Math.min(...(flat.length ? flat : [0])) : 0;
  const span = Math.max(1, rawMax - rawMin);
  const yMin = isZoomed ? Math.max(0, rawMin - span * 0.05) : 0;
  const yMax = rawMax + (isZoomed ? span * 0.05 : 0);

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xAt = (i: number) => PAD_X + (windowLen === 1 ? 0 : (i / (windowLen - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const toPoints = (values: number[]) =>
    values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');

  // Labels: primero, último, y cada ~5 días en el medio — salteando
  // candidatos demasiado cerca de un borde ya incluido para que las
  // etiquetas ("DD/MM", ~26px) no se superpongan.
  const lastWinIdx = windowLen - 1;
  const pxPerDay = lastWinIdx > 0 ? plotW / lastWinIdx : plotW;
  const minGapDays = Math.max(1, Math.ceil(26 / Math.max(pxPerDay, 1)));
  const labelIdxs = new Set<number>([0, lastWinIdx]);
  for (let i = 5; i < lastWinIdx - minGapDays; i += 5) labelIdxs.add(i);

  const colorFor = (userId: number) => {
    if (userId === currentUserId) return 'var(--accent)';
    const idx = series.findIndex((s) => s.userId === userId);
    return PALETTE[idx % PALETTE.length];
  };

  const startPct = (start / lastIdx) * 100;
  const endPct = (end / lastIdx) * 100;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Evolución de posiciones">
        {visible.map((s, vi) => {
          const isMe = s.userId === currentUserId;
          const points = toPoints(windowValues[vi]);
          const len = plotW + plotH; // aprox suficiente para el dasharray
          return (
            <polyline
              key={s.userId}
              points={points}
              fill="none"
              stroke={colorFor(s.userId)}
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
            textAnchor={i === 0 ? 'start' : i === lastWinIdx ? 'end' : 'middle'}
            fill="var(--text-muted)"
          >
            {formatDay(days[start + i])}
          </text>
        ))}
      </svg>
      <style>{`
        @keyframes league-history-draw {
          to { stroke-dashoffset: 0; }
        }
        .lh-range-input {
          position: absolute;
          inset: 0;
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          pointer-events: none;
          margin: 0;
          height: 100%;
        }
        .lh-range-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg-card);
          cursor: grab;
        }
        .lh-range-input::-moz-range-thumb {
          pointer-events: auto;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg-card);
          cursor: grab;
        }
      `}</style>

      {/* Selector de rango de fechas (doble handle) */}
      <div className="mt-2 px-1">
        <div className="relative h-5">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-border" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full"
            style={{ left: `${startPct}%`, right: `${100 - endPct}%`, backgroundColor: 'var(--accent)' }}
          />
          <input
            type="range"
            className="lh-range-input"
            min={0}
            max={lastIdx}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            aria-label="Inicio del rango de fechas"
          />
          <input
            type="range"
            className="lh-range-input"
            min={0}
            max={lastIdx}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            aria-label="Fin del rango de fechas"
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs-s text-muted">{formatDay(days[start])} – {formatDay(days[end])}</span>
          {(isZoomed || isCustomSelection) && (
            <button
              type="button"
              onClick={() => { setRange(null); setSelectedIds(null); }}
              className="text-xs-s font-medium"
              style={{ color: 'var(--accent)' }}
            >
              Restablecer
            </button>
          )}
        </div>
      </div>

      {/* Leyenda: chips clickeables para elegir a quiénes comparar */}
      <div className="flex flex-wrap gap-x-1.5 gap-y-1.5 mt-2">
        {series.map((s) => {
          const isMe = s.userId === currentUserId;
          const active = effectiveIds.has(s.userId);
          return (
            <button
              key={s.userId}
              type="button"
              onClick={() => toggleUser(s.userId)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs-s px-2 py-0.5 rounded-full border transition-opacity',
                active ? 'border-border text-muted' : 'border-transparent text-muted opacity-40',
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: colorFor(s.userId), opacity: active ? 1 : 0.5 }}
              />
              {s.username}{isMe ? ' (vos)' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
