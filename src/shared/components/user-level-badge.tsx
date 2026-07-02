import { cn } from '@/shared/lib/cn';
import { useCountUp } from '@/shared/lib/motion';
import type { LevelInfo } from '@/shared/lib/levels';

/**
 * Compact chip showing the user's tier icon + level number. Designed to be
 * rendered next to the username in leaderboards, comments, and the header.
 *
 * Two sizes:
 *   - sm (default): inline next to a name in a row
 *   - md: profile header / standalone display
 */
export function UserLevelBadge({
  level,
  size = 'sm',
  withName = false,
  className,
}: {
  level: LevelInfo | null | undefined;
  size?: 'sm' | 'md';
  /** When true, also renders the tier name ("Bronce", "Oro"…) next to the level. */
  withName?: boolean;
  className?: string;
}) {
  if (!level) return null;

  const sizeClasses =
    size === 'md'
      ? 'text-sm px-2 py-1 gap-1.5'
      : 'text-[10px] px-1.5 py-0.5 gap-1';

  return (
    <span
      title={`${level.tier.name} · Nivel ${level.level} · ${level.xp} XP`}
      className={cn(
        'inline-flex items-center rounded-full font-bold bg-elevated/80 border border-border',
        sizeClasses,
        level.tier.colorClass,
        className,
      )}
    >
      <span aria-hidden>{level.tier.icon}</span>
      <span>Nv {level.level}</span>
      {withName && <span className="opacity-80">· {level.tier.name}</span>}
    </span>
  );
}

/**
 * Larger progress card used on the profile / achievements page header.
 * Shows tier name, level, XP progress bar with current/next thresholds.
 */
export function UserLevelCard({
  level,
  className,
}: {
  level: LevelInfo | null | undefined;
  className?: string;
}) {
  // useCountUp antes del early return (regla de hooks) — cae en 0 sin level.
  const xp = useCountUp(level?.xp ?? 0);
  if (!level) return null;
  const progressDenom = level.nextLevelXp != null
    ? level.nextLevelXp - level.currentLevelXp
    : 0;
  const progressNum = level.nextLevelXp != null
    ? Math.max(0, level.xp - level.currentLevelXp)
    : 0;
  const pct = progressDenom > 0 ? Math.min(100, (progressNum / progressDenom) * 100) : 100;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3',
        className,
      )}
    >
      <div
        className={cn(
          'text-3xl sm:text-4xl flex-shrink-0 leading-none',
          level.tier.colorClass,
        )}
        aria-hidden
      >
        {level.tier.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('text-base font-bold', level.tier.colorClass)}>
            {level.tier.name}
          </span>
          <span className="text-xs text-muted">Nivel {level.level}</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
            aria-label={`${progressNum} de ${progressDenom} XP del próximo nivel`}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span className="tabular-nums">{xp} XP</span>
          {level.nextLevelXp != null ? (
            <span>
              {level.nextLevelXp - level.xp} XP para Nv {level.level + 1}
            </span>
          ) : (
            <span>Nivel máximo</span>
          )}
        </div>
      </div>
    </div>
  );
}
