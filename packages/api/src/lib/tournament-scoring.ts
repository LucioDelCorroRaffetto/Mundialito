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
 *   - Ceniciento/Sorpresa (10): TODA selección chica que superó por mucho su
 *     expectativa (acertar cualquiera cuenta).
 *   - Decepción (10): TODA selección con historia que quedó muy por debajo de
 *     su expectativa (acertar cualquiera cuenta).
 *   - Valla menos vencida (8): menor promedio de goles recibidos, exigiendo
 *     haber llegado al menos a octavos (empate ⇒ cualquiera cuenta).
 *
 * Ceniciento y Decepción no tenían criterio objetivo: acá se definen contra la
 * "profundidad esperada" derivada del Elo pre-torneo (lib/elo.ts) vs. la
 * profundidad realmente alcanzada. Son CATEGORÍAS MÚLTIPLES: en un torneo
 * puede haber varias sorpresas (Paraguay eliminando a Alemania en R32, Noruega
 * echando a Brasil y llegando a cuartos) y varias decepciones (Uruguay afuera
 * en grupos con Cabo Verde y Arabia Saudita, Brasil cayendo en octavos), y el
 * usuario acierta con nombrar cualquiera. El umbral es una brecha de AL MENOS
 * DOS RONDAS respecto de lo esperado, para que "pasar una ronda de más/menos"
 * no diluya la categoría.
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
 * Brecha mínima (en rondas) para entrar a Sorpresa o Decepción. Con 1 sola
 * ronda de diferencia entraría media tabla; con 2 la categoría queda para los
 * casos que cualquier hincha nombraría (Paraguay de grupos a octavos, Uruguay
 * de octavos a grupos).
 */
export const SURPRISE_MIN_GAP = 2;

/**
 * Sorpresas/Cenicientos: TODAS las selecciones chicas (esperadas a no pasar
 * de octavos según el Elo) que superaron su expectativa por al menos
 * SURPRISE_MIN_GAP rondas. Orden: mayor brecha → más modesto (menor Elo) →
 * menor teamId, por reproducibilidad. Vacío si nadie califica.
 */
export function pickRevelations(teams: TeamRun[]): number[] {
  return withExpected(teams)
    .filter((t) => t.expected <= DEPTH.r16 && t.depthReached - t.expected >= SURPRISE_MIN_GAP)
    .sort(
      (a, b) =>
        b.depthReached - b.expected - (a.depthReached - a.expected) ||
        a.elo - b.elo ||
        a.teamId - b.teamId,
    )
    .map((t) => t.teamId);
}

/**
 * Decepciones: TODAS las selecciones con historia (esperadas al menos a
 * octavos, top 16 del Elo) que quedaron al menos SURPRISE_MIN_GAP rondas por
 * debajo de su expectativa. Uruguay (esperado a octavos) afuera en grupos
 * califica; un top-4 cayendo en octavos también. Orden: mayor brecha → más
 * favorito (mayor Elo) → menor teamId. Vacío si nadie califica.
 */
export function pickDisappointments(teams: TeamRun[]): number[] {
  return withExpected(teams)
    .filter((t) => t.expected >= DEPTH.r16 && t.expected - t.depthReached >= SURPRISE_MIN_GAP)
    .sort(
      (a, b) =>
        b.expected - b.depthReached - (a.expected - a.depthReached) ||
        b.elo - a.elo ||
        a.teamId - b.teamId,
    )
    .map((t) => t.teamId);
}

/** Resultado resuelto del torneo contra el que se puntúa cada predicción. */
export interface TournamentOutcome {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  /** Empate al tope ⇒ varios; acertar cualquiera cuenta. */
  topScorerPlayerIds: number[];
  /** Categoría múltiple: toda sorpresa califica; acertar cualquiera cuenta. */
  revelationTeamIds: number[];
  /** Categoría múltiple: toda decepción califica; acertar cualquiera cuenta. */
  surpriseEliminatedTeamIds: number[];
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
  if (pick.revelationTeamId != null && outcome.revelationTeamIds.includes(pick.revelationTeamId))
    pts += TOURNAMENT_POINTS.revelation;
  if (
    pick.surpriseEliminatedTeamId != null &&
    outcome.surpriseEliminatedTeamIds.includes(pick.surpriseEliminatedTeamId)
  )
    pts += TOURNAMENT_POINTS.surpriseEliminated;
  if (pick.bestDefenseTeamId != null && outcome.bestDefenseTeamIds.includes(pick.bestDefenseTeamId))
    pts += TOURNAMENT_POINTS.bestDefense;
  return pts;
}
