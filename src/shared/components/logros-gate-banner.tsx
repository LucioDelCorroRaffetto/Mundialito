import { Info } from 'lucide-react';

/**
 * Small notice rendered above leaderboards while the Mundial hasn't kicked
 * off yet. Explains why people see "0 pts" even though they already earned
 * some logros — their bonus will start counting toward the rank once the
 * first match starts.
 */
export function LogrosGateBanner({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <div className="mx-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
      <Info size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs-s text-orange-300 leading-snug">
        Los puntos de logros se sumarán a la tabla cuando arranque el Mundial.
        Hasta entonces solo cuentan los puntos de pronósticos.
      </p>
    </div>
  );
}

/**
 * Medal palette for podium spots (1st, 2nd, 3rd). Returned as Tailwind class
 * strings so callers can apply them inline without importing the palette
 * twice.
 */
export const PODIUM_STYLES = [
  // 1st
  {
    medal: '🥇',
    rowBg: 'bg-yellow-400/10 hover:bg-yellow-400/20',
    rowBorder: 'border-yellow-400/40',
    text: 'text-yellow-300',
    rankPill: 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300',
  },
  // 2nd
  {
    medal: '🥈',
    rowBg: 'bg-slate-400/10 hover:bg-slate-400/20',
    rowBorder: 'border-slate-400/40',
    text: 'text-slate-200',
    rankPill: 'bg-slate-400/20 border-slate-400/50 text-slate-200',
  },
  // 3rd
  {
    medal: '🥉',
    rowBg: 'bg-amber-700/10 hover:bg-amber-700/20',
    rowBorder: 'border-amber-700/40',
    text: 'text-amber-400',
    rankPill: 'bg-amber-700/20 border-amber-700/50 text-amber-400',
  },
] as const;

export function podiumStyle(position: number) {
  if (position < 1 || position > 3) return null;
  return PODIUM_STYLES[position - 1];
}
