/**
 * Scoring de las predicciones de Copa (campeón, finalista, goleador, etc.).
 *
 * Es lógica PURA — sin DB ni red — para poder testearla y para que el resolver
 * (`services/tournament-resolver.ts`) la use con datos ya leídos. Mismo patrón
 * que `scoring.ts` para los pronósticos partido-a-partido.
 *
 * Las siete categorías y su criterio:
 *   - Campeón (50): ganador de la final.
 *   - Finalista (20): el OTRO finalista (subcampeón, perdedor de la final).
 *   - Tercer puesto (12): ganador del partido por el bronce ('third').
 *   - Goleador (15): máximo goleador del torneo (empate ⇒ cualquiera cuenta).
 *   - Ceniciento (10): el equipo MODESTO que más superó su expectativa.
 *   - Decepción (10): el FAVORITO que más quedó por debajo de su expectativa.
 *   - Valla menos vencida (8): menor promedio de goles recibidos, exigiendo
 *     haber llegado al menos a octavos (empate ⇒ cualquiera cuenta).
 *
 * Ceniciento y Decepción no tenían criterio objetivo: acá se definen contra la
 * "profundidad esperada" derivada del Elo pre-torneo (lib/elo.ts) vs. la
 * profundidad realmente alcanzada. Así "Argentina afuera en grupos" da una
 * brecha negativa enorme (decepción) y "un modesto que pasa de ronda" da una
 * brecha positiva (ceniciento), de forma reproducible y explicable.
 */

export const TOURNAMENT_POINTS = {
  champion: 50,
  runnerUp: 20,
  thirdPlace: 12,
  topScorer: 15,
  revelation: 10,
  surpriseEliminated: 10,
  bestDefense: 8,
} as const;

/** Ronda de un partido tal como la guarda `matches.round`. */
export type Round = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';

/**
 * Profundidad alcanzada por un equipo, en escala 0–6:
 *   0 grupos · 1 R32 · 2 octavos · 3 cuartos · 4 semis · 5 final · 6 campeón.
 * El partido por el tercer puesto no aporta profundidad extra (implica semis).
 */
export const DEPTH = {
  group: 0,
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  final: 5,
  champion: 6,
} as const;

/** Profundidad que un knockout implica haber alcanzado al haberlo jugado. */
const KNOCKOUT_DEPTH: Partial<Record<Round, number>> = {
  r32: DEPTH.r32,
  r16: DEPTH.r16,
  qf: DEPTH.qf,
  sf: DEPTH.sf,
  third: DEPTH.sf, // jugar el bronce ⇒ fue semifinalista
  final: DEPTH.final,
};

/**
 * Profundidad a la que un equipo *llegó* dado el set de rondas en las que
 * jugó (de partidos finished) y si fue campeón. Un equipo que sólo jugó la
 * fase de grupos queda en 0. El campeón sube a 6 por encima de la final.
 */
export function depthReachedFrom(roundsPlayed: Iterable<Round>, isChampion: boolean): number {
  if (isChampion) return DEPTH.champion;
  let max: number = DEPTH.group;
  for (const r of roundsPlayed) {
    const d = KNOCKOUT_DEPTH[r];
    if (d != null && d > max) max = d;
  }
  return max;
}

/**
 * Profundidad ESPERADA según el ranking de Elo pre-torneo (1 = más fuerte):
 *   1–2 → final · 3–4 → semis · 5–8 → cuartos · 9–16 → octavos ·
 *   17–32 → R32 · 33+ → grupos.
 */
export function expectedDepthFromEloRank(rank: number): number {
  if (rank <= 2) return DEPTH.final;
  if (rank <= 4) return DEPTH.sf;
  if (rank <= 8) return DEPTH.qf;
  if (rank <= 16) return DEPTH.r16;
  if (rank <= 32) return DEPTH.r32;
  return DEPTH.group;
}

export interface TeamRun {
  teamId: number;
  /** Elo pre-torneo (mayor = más fuerte). */
  elo: number;
  /** Profundidad alcanzada 0–6 (ver DEPTH). */
  depthReached: number;
}

/** Adjunta a cada equipo su profundidad esperada según el rank de Elo. */
function withExpected(teams: TeamRun[]): Array<TeamRun & { expected: number }> {
  // rank por Elo desc; empate de Elo se rompe por teamId para reproducibilidad.
  const ranked = [...teams].sort((a, b) => b.elo - a.elo || a.teamId - b.teamId);
  return ranked.map((t, i) => ({ ...t, expected: expectedDepthFromEloRank(i + 1) }));
}

/**
 * Ceniciento: el equipo MODESTO (esperado a no pasar de octavos) que más
 * superó su expectativa. Devuelve teamId o null si nadie modesto sobrerindió.
 * Desempate: más modesto (menor Elo) → corrida más profunda → menor teamId.
 */
export function pickRevelation(teams: TeamRun[]): number | null {
  const candidates = withExpected(teams)
    .filter((t) => t.expected <= DEPTH.r16 && t.depthReached - t.expected > 0)
    .sort(
      (a, b) =>
        b.depthReached - b.expected - (a.depthReached - a.expected) ||
        a.elo - b.elo ||
        b.depthReached - a.depthReached ||
        a.teamId - b.teamId,
    );
  return candidates[0]?.teamId ?? null;
}

/**
 * Decepción: el FAVORITO (esperado al menos a cuartos) que más quedó por
 * debajo de su expectativa. Devuelve teamId o null si ningún favorito falló.
 * Desempate: más favorito (mayor Elo) → eliminación más temprana → menor teamId.
 */
export function pickSurpriseEliminated(teams: TeamRun[]): number | null {
  const candidates = withExpected(teams)
    .filter((t) => t.expected >= DEPTH.qf && t.expected - t.depthReached > 0)
    .sort(
      (a, b) =>
        b.expected - b.depthReached - (a.expected - a.depthReached) ||
        b.elo - a.elo ||
        a.depthReached - b.depthReached ||
        a.teamId - b.teamId,
    );
  return candidates[0]?.teamId ?? null;
}

/** Resultado resuelto del torneo contra el que se puntúa cada predicción. */
export interface TournamentOutcome {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  /** Empate al tope ⇒ varios; acertar cualquiera cuenta. */
  topScorerPlayerIds: number[];
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  /** Empate de promedio ⇒ varios; acertar cualquiera cuenta. */
  bestDefenseTeamIds: number[];
}

/** Los picks de un usuario (forma de la fila tournament_predictions). */
export interface TournamentPick {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  bestDefenseTeamId: number | null;
}

/**
 * Puntos totales de una predicción de Copa contra el resultado resuelto.
 * Cada acierto suma su categoría; los picks null nunca suman.
 */
export function scoreTournamentPrediction(
  pick: TournamentPick,
  outcome: TournamentOutcome,
): number {
  let pts = 0;
  if (pick.championTeamId != null && pick.championTeamId === outcome.championTeamId)
    pts += TOURNAMENT_POINTS.champion;
  if (pick.runnerUpTeamId != null && pick.runnerUpTeamId === outcome.runnerUpTeamId)
    pts += TOURNAMENT_POINTS.runnerUp;
  if (pick.thirdPlaceTeamId != null && pick.thirdPlaceTeamId === outcome.thirdPlaceTeamId)
    pts += TOURNAMENT_POINTS.thirdPlace;
  if (pick.topScorerPlayerId != null && outcome.topScorerPlayerIds.includes(pick.topScorerPlayerId))
    pts += TOURNAMENT_POINTS.topScorer;
  if (pick.revelationTeamId != null && pick.revelationTeamId === outcome.revelationTeamId)
    pts += TOURNAMENT_POINTS.revelation;
  if (
    pick.surpriseEliminatedTeamId != null &&
    pick.surpriseEliminatedTeamId === outcome.surpriseEliminatedTeamId
  )
    pts += TOURNAMENT_POINTS.surpriseEliminated;
  if (pick.bestDefenseTeamId != null && outcome.bestDefenseTeamIds.includes(pick.bestDefenseTeamId))
    pts += TOURNAMENT_POINTS.bestDefense;
  return pts;
}
