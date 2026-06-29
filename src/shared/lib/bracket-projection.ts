/**
 * bracket-projection.ts — resolución de los slots de la Ronda de 32 a partir de
 * la proyección de grupos (1°/2° confirmados o clasificados provisionales) y de
 * los mejores terceros. Es la fuente única que comparten el cuadro completo
 * (bracket-view) y el detalle de partido.
 */
import { R32_LABELS, BRACKET_ROUNDS, THIRD_PLACE_MATCH } from '@/shared/data/bracket';
import {
  computeAllGroupClinches,
  resolveSlotTeam,
  type GroupClinch,
  type SlotResolution,
} from '@/shared/lib/group-clinch';
import { resolveThirdPlaceSlots } from '@/shared/lib/third-place';
import type { Match, Team } from '@/shared/types/api';

export interface BracketProjection {
  clinches: Map<string, GroupClinch>;
  thirdSlots: Map<number, Team>;
}

export function computeBracketProjection(teams: Team[], matches: Match[]): BracketProjection {
  if (!teams.length) return { clinches: new Map(), thirdSlots: new Map() };
  return {
    clinches: computeAllGroupClinches(teams, matches),
    thirdSlots: resolveThirdPlaceSlots(teams, matches),
  };
}

/**
 * Equipo proyectado para un slot de la R32 (home/away de un partido 73–88), o
 * null si todavía no hay nada que mostrar. El home/away "X° Grp" sale del
 * clinch; el "Mejor 3ro" (siempre away) sale de la tabla de terceros.
 */
export function resolveBracketSlot(
  matchNumber: number,
  side: 'home' | 'away',
  proj: BracketProjection,
): SlotResolution | null {
  const label = R32_LABELS[matchNumber]?.[side];
  if (!label) return null;
  const fromGroup = resolveSlotTeam(label, proj.clinches);
  if (fromGroup) return fromGroup;
  if (side === 'away') {
    const third = proj.thirdSlots.get(matchNumber);
    if (third) return { team: third, confirmed: true };
  }
  return null;
}

// ─── Propagación de ganadores por el cuadro (Octavos → Final + 3er puesto) ──────
//
// A diferencia de la R32 (que se proyecta desde la fase de grupos), los slots de
// las rondas siguientes se llenan con el GANADOR del partido hijo en cuanto ese
// partido termina, sin esperar a que el feed asigne el equipo al cruce. Como todo
// se deriva de `matches`, el cuadro se va completando solo a medida que llegan
// los resultados.

/** matchNumber → [hijoHome, hijoAway] para las rondas con cruce (R16 en adelante). */
const CHILDREN_BY_MATCH: Map<number, [number, number]> = (() => {
  const map = new Map<number, [number, number]>();
  for (const round of BRACKET_ROUNDS) {
    for (const bm of round.matches) {
      if (bm.children) map.set(bm.matchNumber, bm.children);
    }
  }
  return map;
})();

function isDecided(match: Match | undefined): match is Match {
  return (
    !!match &&
    match.status === 'finished' &&
    match.homeScore != null &&
    match.awayScore != null &&
    match.homeScore !== match.awayScore
  );
}

/**
 * Ganador (teamId) de un partido resuelto en tiempo regular/alargue. Devuelve
 * null si no terminó, no tiene marcador o quedó empatado (definición por penales
 * que la lista de partidos no expone → se espera a que el feed asigne el cruce).
 */
export function matchWinnerId(match: Match | undefined): number | null {
  if (!isDecided(match)) return null;
  return match.homeScore! > match.awayScore! ? match.homeTeamId : match.awayTeamId;
}

/** Perdedor (teamId) de un partido resuelto — usado para el cruce de 3er puesto. */
export function matchLoserId(match: Match | undefined): number | null {
  if (!isDecided(match)) return null;
  return match.homeScore! > match.awayScore! ? match.awayTeamId : match.homeTeamId;
}

/**
 * Equipo proyectado (teamId) para un slot de las rondas de cruce — el ganador del
 * partido hijo correspondiente, o el perdedor de la semi para el 3er puesto.
 * Devuelve null si el hijo todavía no está resuelto.
 */
export function resolveKnockoutSlotId(
  matchNumber: number,
  side: 'home' | 'away',
  matchByNum: Map<number, Match>,
): number | null {
  if (matchNumber === THIRD_PLACE_MATCH.matchNumber) {
    const [sfA, sfB] = THIRD_PLACE_MATCH.children ?? [101, 102];
    return matchLoserId(matchByNum.get(side === 'home' ? sfA : sfB));
  }
  const children = CHILDREN_BY_MATCH.get(matchNumber);
  if (!children) return null;
  return matchWinnerId(matchByNum.get(side === 'home' ? children[0] : children[1]));
}
