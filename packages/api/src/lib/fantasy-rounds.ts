/**
 * Fantasy round definitions for WC 2026.
 *
 * Each round has:
 *  - slug: used as the FK in fantasy_lineups.round
 *  - label: display name
 *  - deadline: ISO UTC string — lineups must be saved before this time.
 *    Set to the kickoff of the FIRST match in the round minus 5 minutes
 *    as a buffer.
 *  - dbRound: the `round` value(s) in the matches table that belong to
 *    this fantasy round (for scoring purposes).
 *  - dateStart / dateEnd: used when dbRound = 'group' to filter by date.
 */

export interface FantasyRound {
  slug: string;
  label: string;
  deadline: string;   // ISO UTC
  dbRound: string | string[];
  dateStart?: string; // 'YYYY-MM-DD' (group only)
  dateEnd?: string;
}

export const FANTASY_ROUNDS: FantasyRound[] = [
  {
    slug: 'group_1',
    label: 'Grupos — Fecha 1',
    deadline: '2026-06-11T18:55:00Z',   // 5 min before the opener
    dbRound: 'group',
    dateStart: '2026-06-11',
    dateEnd: '2026-06-18',
  },
  {
    slug: 'group_2',
    label: 'Grupos — Fecha 2',
    deadline: '2026-06-19T16:55:00Z',
    dbRound: 'group',
    dateStart: '2026-06-19',
    dateEnd: '2026-06-25',
  },
  {
    slug: 'group_3',
    label: 'Grupos — Fecha 3',
    deadline: '2026-06-26T16:55:00Z',
    dbRound: 'group',
    dateStart: '2026-06-26',
    dateEnd: '2026-06-28',
  },
  {
    slug: 'r32',
    label: 'Ronda de 32',
    deadline: '2026-07-04T17:55:00Z',
    dbRound: 'r32',
  },
  {
    slug: 'r16',
    label: 'Octavos de final',
    deadline: '2026-07-10T17:55:00Z',
    dbRound: 'r16',
  },
  {
    slug: 'qf',
    label: 'Cuartos de final',
    deadline: '2026-07-14T17:55:00Z',
    dbRound: 'qf',
  },
  {
    slug: 'sf',
    label: 'Semifinales',
    deadline: '2026-07-17T17:55:00Z',
    dbRound: 'sf',
  },
  {
    slug: 'final',
    label: 'Final y 3er puesto',
    deadline: '2026-07-19T14:55:00Z',  // 3rd place match starts 15:00 UTC
    // Final fantasy round scores ONLY the 3rd-place match and the final.
    // Previously the array also included 'sf', so semifinal matches were
    // counted twice (once for the `sf` round, again here) — a starter
    // who scored in the SF inflated both the user's `sf` total and their
    // `final` total. Removed 'sf' so each match is scored exactly once.
    dbRound: ['third', 'final'],
  },
];

export const ROUND_BY_SLUG = new Map(FANTASY_ROUNDS.map((r) => [r.slug, r]));

/** Returns the current active fantasy round (the one whose deadline is next). */
export function getCurrentFantasyRound(): FantasyRound | null {
  const now = Date.now();
  for (const r of FANTASY_ROUNDS) {
    if (now < new Date(r.deadline).getTime()) return r;
  }
  return null; // tournament over
}

/** Returns every round whose deadline has NOT yet passed — i.e. you can still
 *  submit a lineup. */
export function getOpenRounds(): FantasyRound[] {
  const now = Date.now();
  return FANTASY_ROUNDS.filter((r) => now < new Date(r.deadline).getTime());
}

/** Is the given round still open for lineup submission? */
export function isRoundOpen(slug: string): boolean {
  const r = ROUND_BY_SLUG.get(slug);
  if (!r) return false;
  return Date.now() < new Date(r.deadline).getTime();
}
