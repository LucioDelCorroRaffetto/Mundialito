export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface FantasyScoringInput {
  position: PlayerPosition;
  played: boolean;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCard: boolean;
}

// Points per goal, by position.
const GOAL_POINTS: Record<PlayerPosition, number> = {
  GK: 6,
  DEF: 6,
  MID: 5,
  FWD: 4,
};

// Points for a clean sheet, by position.
const CLEAN_SHEET_POINTS: Record<PlayerPosition, number> = {
  GK: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
};

/**
 * Pure fantasy scoring function — points earned by a single player in a single match.
 *
 * - !played            → 0 pts
 * - showing up         → +2
 * - goal               → GK +6 · DEF +6 · MID +5 · FWD +4 (per goal)
 * - assist             → +3 (each)
 * - clean sheet        → GK/DEF +4 · MID +1 (only if cleanSheet)
 * - yellow card        → -1 (each)
 * - red card           → -3
 */
export function calculateFantasyPoints(input: FantasyScoringInput): number {
  if (!input.played) return 0;

  let points = 2; // base for appearing

  points += input.goals * GOAL_POINTS[input.position];
  points += input.assists * 3;

  if (input.cleanSheet) {
    points += CLEAN_SHEET_POINTS[input.position];
  }

  points -= input.yellowCards;
  if (input.redCard) points -= 3;

  return points;
}
