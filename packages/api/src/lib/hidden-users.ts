/**
 * Users hidden from the global leaderboard and from achievement processing.
 * Distinct from ADMIN_USER_IDS (which controls the Presidente FIFA profile).
 *
 * The owner of the app (Luchi) requested to be excluded so his
 * always-online activity doesn't park him at the top of every ranking —
 * he developed the app, it'd be suspicious if he were #1.
 *
 * Reads from env HIDDEN_USER_IDS (comma-separated) when present, otherwise
 * defaults to the well-known owner id. Hardcoded fallback so the
 * production env doesn't need an extra var.
 */
const ENV_LIST = process.env.HIDDEN_USER_IDS?.split(',').map(Number).filter(Boolean);
// Default is now empty — the owner asked to compete normally. Set
// HIDDEN_USER_IDS=2,… in the API env if you want to hide accounts again.
const DEFAULT_HIDDEN: number[] = [];

export const HIDDEN_USER_IDS: number[] =
  ENV_LIST && ENV_LIST.length > 0 ? ENV_LIST : DEFAULT_HIDDEN;

export const HIDDEN_USER_ID_SET = new Set(HIDDEN_USER_IDS);

export function isHiddenUser(userId: number): boolean {
  return HIDDEN_USER_ID_SET.has(userId);
}
