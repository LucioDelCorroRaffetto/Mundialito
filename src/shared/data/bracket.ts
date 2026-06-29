/**
 * bracket.ts — FIFA World Cup 2026 knockout bracket structure.
 *
 * Sources:
 *  - Official Round of 32 pairings: en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
 *  - Match numbers correspond to match_number in the DB (M73–M104).
 *
 * Bracket flow:
 *  R32 (M73–M88) → R16 (M89–M96) → QF (M97–M100) → SF (M101–M102) → Final (M104)
 *  Third-place: M103 (losers of SF)
 */

/** Human-readable label for a bracket slot when the team is not yet known */
export interface SlotLabel {
  home: string;
  away: string;
}

/** All 16 R32 slot labels, keyed by match_number */
export const R32_LABELS: Record<number, SlotLabel> = {
  73: { home: '2° Grp A',   away: '2° Grp B' },
  74: { home: '1° Grp E',   away: 'Mejor 3ro' },
  75: { home: '1° Grp F',   away: '2° Grp C' },
  76: { home: '1° Grp C',   away: '2° Grp F' },
  77: { home: '1° Grp I',   away: 'Mejor 3ro' },
  78: { home: '2° Grp E',   away: '2° Grp I' },
  79: { home: '1° Grp A',   away: 'Mejor 3ro' },
  80: { home: '1° Grp L',   away: 'Mejor 3ro' },
  81: { home: '1° Grp D',   away: 'Mejor 3ro' },
  82: { home: '1° Grp G',   away: 'Mejor 3ro' },
  83: { home: '2° Grp K',   away: '2° Grp L' },
  84: { home: '1° Grp H',   away: '2° Grp J' },
  85: { home: '1° Grp B',   away: 'Mejor 3ro' },
  86: { home: '1° Grp J',   away: '2° Grp H' },
  87: { home: '1° Grp K',   away: 'Mejor 3ro' },
  88: { home: '2° Grp D',   away: '2° Grp G' },
};

/**
 * Bracket tree — defines how winners of each match feed into the next round.
 *
 * The bracket is split into two halves (A and B) that feed into the two semi-finals.
 * Each "pair" groups two R32 matches whose winner plays the same R16 match.
 *
 * Visual layout (left = R32, right = Final):
 *
 *  HALF A
 *    [M74, M77] → M89 ─┐
 *    [M73, M75] → M90 ─┤→ M97 ─┐
 *    [M83, M84] → M93 ─┤        │→ M101 ─┐
 *    [M81, M82] → M94 ─┘        │         │→ M104 (Final)
 *  HALF B                       │         │
 *    [M76, M78] → M91 ─┐        │         │
 *    [M79, M80] → M92 ─┤→ M99 ─┤         │
 *    [M86, M88] → M95 ─┤        │→ M102 ─┘
 *    [M85, M87] → M96 ─┘
 */
export interface BracketMatch {
  matchNumber: number;
  /** Child matches whose winner plays this slot (null for R32) */
  children?: [number, number];
}

export interface BracketRound {
  label: string;
  /** Ordered list of matches — order matters for visual bracket alignment */
  matches: BracketMatch[];
}

export const BRACKET_ROUNDS: BracketRound[] = [
  {
    label: 'Ronda de 32',
    matches: [
      { matchNumber: 74 },
      { matchNumber: 77 },
      { matchNumber: 73 },
      { matchNumber: 75 },
      { matchNumber: 83 },
      { matchNumber: 84 },
      { matchNumber: 81 },
      { matchNumber: 82 },
      // — separator between halves —
      { matchNumber: 76 },
      { matchNumber: 78 },
      { matchNumber: 79 },
      { matchNumber: 80 },
      { matchNumber: 86 },
      { matchNumber: 88 },
      { matchNumber: 85 },
      { matchNumber: 87 },
    ],
  },
  {
    label: 'Octavos',
    matches: [
      { matchNumber: 89,  children: [74, 77] },
      { matchNumber: 90,  children: [73, 75] },
      { matchNumber: 93,  children: [83, 84] },
      { matchNumber: 94,  children: [81, 82] },
      { matchNumber: 91,  children: [76, 78] },
      { matchNumber: 92,  children: [79, 80] },
      { matchNumber: 95,  children: [86, 88] },
      { matchNumber: 96,  children: [85, 87] },
    ],
  },
  {
    label: 'Cuartos',
    matches: [
      { matchNumber: 97,  children: [89, 90] },
      { matchNumber: 98,  children: [93, 94] },
      { matchNumber: 99,  children: [91, 92] },
      { matchNumber: 100, children: [95, 96] },
    ],
  },
  {
    label: 'Semifinales',
    matches: [
      { matchNumber: 101, children: [97, 98] },
      { matchNumber: 102, children: [99, 100] },
    ],
  },
  {
    label: 'Final',
    matches: [
      { matchNumber: 104, children: [101, 102] },
    ],
  },
];

/** 3er puesto (M103): lo juegan los PERDEDORES de las dos semifinales. */
export const THIRD_PLACE_MATCH: BracketMatch = { matchNumber: 103, children: [101, 102] };
