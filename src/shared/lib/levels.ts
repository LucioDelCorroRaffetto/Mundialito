/**
 * Frontend mirror of packages/api/src/lib/levels.ts.
 *
 * Kept in sync manually — both sides use the same XP thresholds so the
 * backend can stamp `LevelInfo` into responses and the frontend can also
 * compute it locally when only `xp` is available (e.g. an old cached
 * profile blob).
 */
export type TierKey = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';

export interface Tier {
  key: TierKey;
  name: string;
  icon: string;
  colorClass: string;
  minLevel: number;
}

export const TIERS: Tier[] = [
  { key: 'bronce',    name: 'Bronce',    icon: '🥉', colorClass: 'text-amber-600',  minLevel: 1  },
  { key: 'plata',     name: 'Plata',     icon: '🥈', colorClass: 'text-slate-300',  minLevel: 4  },
  { key: 'oro',       name: 'Oro',       icon: '🥇', colorClass: 'text-yellow-400', minLevel: 7  },
  { key: 'platino',   name: 'Platino',   icon: '💠', colorClass: 'text-cyan-400',   minLevel: 10 },
  { key: 'diamante',  name: 'Diamante',  icon: '💎', colorClass: 'text-violet-400', minLevel: 13 },
];

const LEVEL_XP: number[] = [
  0, 5, 15, 30, 50, 75, 105, 140, 180, 225, 280, 340, 410, 490,
];

export interface LevelInfo {
  level: number;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  tier: Tier;
}

export function computeLevel(xpRaw: number): LevelInfo {
  const xp = Math.max(0, Math.floor(xpRaw));
  let level = 1;
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) {
      level = i + 1;
      break;
    }
  }
  const currentLevelXp = LEVEL_XP[level - 1] ?? 0;
  const nextLevelXp = level < LEVEL_XP.length ? LEVEL_XP[level] : null;
  const tier =
    TIERS.slice()
      .reverse()
      .find((t) => level >= t.minLevel) ?? TIERS[0];
  return { level, xp, currentLevelXp, nextLevelXp, tier };
}
