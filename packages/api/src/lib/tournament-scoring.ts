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
 * profundidad realmente alcanzada, más el peso del RIVAL en las derrotas. Son
 * CATEGORÍAS MÚLTIPLES: en un torneo puede haber varias sorpresas (Paraguay
 * eliminando a Alemania, Cabo Verde debutante pasando de grupos, Noruega en
 * cuartos echando a Brasil) y varias decepciones (Uruguay afuera en grupos,
 * Brasil en octavos, Alemania eliminada por Paraguay), y el usuario acierta
 * con nombrar cualquiera. Los umbrales son deliberadamente asimétricos: a una
 * chica le alcanza con pasar una ronda de más (sorpresa fácil de dar), a una
 * grande le exigimos 2 rondas de menos O un batacazo en contra (decepcionar
 * requiere fallar de verdad, no perder ajustado con un rival digno).
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
  /**
   * Mayor "batacazo recibido": máximo (elo propio − elo del rival) entre las
   * DERROTAS del torneo. Positivo grande ⇒ perdió contra alguien muy inferior
   * (Alemania 1928 cayendo con Paraguay 1630 ⇒ ~298). Omitido/negativo ⇒ solo
   * perdió contra pares o superiores.
   */
  worstLossEloDiff?: number;
  /** Rival de esa peor derrota, para poder explicarla. */
  worstLossRivalId?: number;
  /**
   * Mayor "mérito conseguido": máximo (elo del rival − elo propio) entre los
   * partidos NO perdidos (victorias y empates). Positivo grande ⇒ le sacó
   * puntos a alguien muy superior (Cabo Verde 1540 empatando con España
   * 2049 ⇒ ~509). Omitido/negativo ⇒ solo puntuó contra pares o inferiores.
   */
  bestUpsetEloDiff?: number;
  /** Rival de ese mejor resultado, para poder explicarlo. */
  bestUpsetRivalId?: number;
}

/** Adjunta a cada equipo su profundidad esperada según el rank de Elo. */
function withExpected(teams: TeamRun[]): Array<TeamRun & { expected: number }> {
  // rank por Elo desc; empate de Elo se rompe por teamId para reproducibilidad.
  const ranked = [...teams].sort((a, b) => b.elo - a.elo || a.teamId - b.teamId);
  return ranked.map((t, i) => ({ ...t, expected: expectedDepthFromEloRank(i + 1) }));
}

/**
 * Diferencia de Elo que consideramos "batacazo": ~250 puntos equivalen a un
 * ~80% de probabilidad de victoria del favorito (expectedScore de lib/elo.ts).
 * Perder un cruce así es señal de decepción aunque la brecha de rondas sea
 * chica: distingue "Alemania eliminada por Paraguay" (batacazo, decepciona) de
 * "Portugal eliminada por España" (rival superior, no decepciona).
 */
export const ELO_UPSET_DIFF = 250;

/**
 * Diferencia de Elo que consideramos "mérito" para una chica: haberle ganado
 * o empatado a un rival ≥200 puntos arriba. Es el filtro que separa a la que
 * dio pelea de verdad (Cabo Verde empatando con España y Uruguay) de la que
 * simplemente pasó de ronda sin cruzarse con nadie grande (Bosnia segunda de
 * un grupo accesible).
 */
export const ELO_MERIT_DIFF = 200;

/**
 * Candidata evaluada para Sorpresa o Decepción, con el porqué. Se exponen
 * TODAS las que sobre/subrindieron (incluidas las rechazadas) para poder
 * explicar tanto el "sí" como el "no" cuando se liberan los puntos.
 */
export interface CategoryCandidate {
  teamId: number;
  /** Profundidad esperada según Elo (0–6). */
  expected: number;
  /** Profundidad alcanzada (0–6). */
  depthReached: number;
  /** depthReached − expected (positiva sobrerrinde, negativa subrinde). */
  gap: number;
  /** Sorpresa: mejor resultado vs un superior (elo rival − propio, si > 0). */
  meritEloDiff?: number;
  meritRivalId?: number;
  /** Decepción: peor derrota vs un inferior (elo propio − rival, si > 0). */
  upsetLossEloDiff?: number;
  upsetLossRivalId?: number;
  /** ¿Quedó dentro de la categoría? */
  included: boolean;
  /** Por qué vía entró: brecha grande sola, o brecha chica + mérito/batacazo. */
  via: 'gap' | 'gap_plus_merit' | 'gap_plus_upset_loss' | null;
}

/**
 * Sorpresas/Cenicientos: selecciones chicas (esperadas a no pasar de octavos
 * según el Elo) que superaron su expectativa, por una de dos vías:
 *   1. Brecha grande: 2+ rondas por encima de lo esperado (Paraguay de grupos
 *      a octavos eliminando a Alemania; Noruega de R32 a cuartos echando a
 *      Brasil).
 *   2. Brecha chica + mérito: 1 ronda de más Y le ganó o empató a un rival
 *      ≥ ELO_MERIT_DIFF arriba (Cabo Verde debutante clasificando a
 *      dieciseisavos tras empatarle a España y a Uruguay). Pasar de ronda sin
 *      haberse cruzado con nadie grande NO alcanza: eso es cumplir, no
 *      sorprender.
 * Devuelve todas las candidatas (gap ≥ 1) con el veredicto; ordenadas mayor
 * brecha → más modesta (menor Elo) → menor teamId.
 */
export function surpriseCandidates(teams: TeamRun[]): CategoryCandidate[] {
  return withExpected(teams)
    .filter((t) => t.expected <= DEPTH.r16 && t.depthReached - t.expected >= 1)
    .sort(
      (a, b) =>
        b.depthReached - b.expected - (a.depthReached - a.expected) ||
        a.elo - b.elo ||
        a.teamId - b.teamId,
    )
    .map((t) => {
      const gap = t.depthReached - t.expected;
      const merit = (t.bestUpsetEloDiff ?? -Infinity) >= ELO_MERIT_DIFF;
      const via = gap >= 2 ? 'gap' : merit ? 'gap_plus_merit' : null;
      return {
        teamId: t.teamId,
        expected: t.expected,
        depthReached: t.depthReached,
        gap,
        meritEloDiff: t.bestUpsetEloDiff,
        meritRivalId: t.bestUpsetRivalId,
        included: via != null,
        via,
      };
    });
}

/**
 * Decepciones: selecciones con historia (esperadas al menos a octavos, top 16
 * del Elo) que defraudaron, por una de dos vías:
 *   1. Brecha grande: 2+ rondas por debajo de lo esperado (Uruguay esperado a
 *      octavos y afuera en grupos; Brasil esperado a semis y afuera en
 *      octavos). Caer UNA sola ronda antes no alcanza por sí solo — un cruce
 *      ajustado contra un rival digno no es decepción.
 *   2. Brecha chica + batacazo: 1 ronda de menos Y perdió contra un rival
 *      ≥ ELO_UPSET_DIFF inferior (Alemania afuera en dieciseisavos con
 *      Paraguay). Portugal cayendo en octavos con España NO entra: perdió
 *      contra una superior.
 * Devuelve todas las candidatas (gap ≤ −1) con el veredicto; ordenadas mayor
 * brecha → más favorita (mayor Elo) → menor teamId.
 */
export function disappointmentCandidates(teams: TeamRun[]): CategoryCandidate[] {
  return withExpected(teams)
    .filter((t) => t.expected >= DEPTH.r16 && t.expected - t.depthReached >= 1)
    .sort(
      (a, b) =>
        b.expected - b.depthReached - (a.expected - a.depthReached) ||
        b.elo - a.elo ||
        a.teamId - b.teamId,
    )
    .map((t) => {
      const shortfall = t.expected - t.depthReached;
      const upset = (t.worstLossEloDiff ?? -Infinity) >= ELO_UPSET_DIFF;
      const via = shortfall >= 2 ? 'gap' : upset ? 'gap_plus_upset_loss' : null;
      return {
        teamId: t.teamId,
        expected: t.expected,
        depthReached: t.depthReached,
        gap: t.depthReached - t.expected,
        upsetLossEloDiff: t.worstLossEloDiff,
        upsetLossRivalId: t.worstLossRivalId,
        included: via != null,
        via,
      };
    });
}

/** Sorpresas que quedan DENTRO de la categoría (ver surpriseCandidates). */
export function pickRevelations(teams: TeamRun[]): number[] {
  return surpriseCandidates(teams)
    .filter((c) => c.included)
    .map((c) => c.teamId);
}

/** Decepciones que quedan DENTRO de la categoría (ver disappointmentCandidates). */
export function pickDisappointments(teams: TeamRun[]): number[] {
  return disappointmentCandidates(teams)
    .filter((c) => c.included)
    .map((c) => c.teamId);
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
