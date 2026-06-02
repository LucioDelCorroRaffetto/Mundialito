/**
 * Derives level + tier from a user's accumulated achievement XP.
 *
 * The curve is hand-tuned to the current logro catalog (≈230 XP total when
 * every logro is earned). Each tier covers ~3 levels so progression feels
 * frequent at the start and rarer at the top. The last tier (Diamante)
 * sits a bit beyond what's achievable from the base catalog to leave room
 * for future logros or future tournaments.
 */
export type TierKey = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';

export interface Tier {
  key: TierKey;
  name: string;
  icon: string;        // emoji rendered next to the level number
  colorClass: string;  // Tailwind text-color used by the frontend badge
  minLevel: number;
}

export const TIERS: Tier[] = [
  { key: 'bronce',    name: 'Bronce',    icon: '🥉', colorClass: 'text-amber-600',  minLevel: 1  },
  { key: 'plata',     name: 'Plata',     icon: '🥈', colorClass: 'text-slate-300',  minLevel: 4  },
  { key: 'oro',       name: 'Oro',       icon: '🥇', colorClass: 'text-yellow-400', minLevel: 7  },
  { key: 'platino',   name: 'Platino',   icon: '💠', colorClass: 'text-cyan-400',   minLevel: 10 },
  { key: 'diamante',  name: 'Diamante',  icon: '💎', colorClass: 'text-violet-400', minLevel: 13 },
];

/**
 * Cumulative XP required to *reach* each level. Index 0 = level 1, etc.
 * Picked so that:
 *   - Level 2 fires after the very first logro of value ≥5 (Racha Caliente
 *     or Invite_5), keeping the first-progress feedback fast.
 *   - Reaching Platino (level 10) needs ~225 XP, basically the full
 *     baseline catalog.
 *   - Diamante is a stretch goal that won't be reached without
 *     fantasy_legend / prophet / future logros.
 */
const LEVEL_XP: number[] = [
  0,    // 1  Bronce I
  5,    // 2  Bronce II
  15,   // 3  Bronce III
  30,   // 4  Plata I
  50,   // 5  Plata II
  75,   // 6  Plata III
  105,  // 7  Oro I
  140,  // 8  Oro II
  180,  // 9  Oro III
  225,  // 10 Platino I
  280,  // 11 Platino II
  340,  // 12 Platino III
  410,  // 13 Diamante I
  490,  // 14 Diamante II
];

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP required to enter the current level (sticky floor of the progress bar). */
  currentLevelXp: number;
  /** XP required to reach the next level. null when at max level. */
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
