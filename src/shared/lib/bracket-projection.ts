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
// las rondas siguientes se llenan con el GANADOR del cruce hijo en cuanto ese
// partido termina. CLAVE: los partidos de eliminación en la DB no traen los
// equipos reales (FIFA los asigna tarde — homeTeamId/awayTeamId quedan en el
// placeholder TBD), así que NO podemos leer el ganador de match.homeTeamId. La
// identidad del equipo sale de la misma proyección que usa el cuadro (grupos en
// R32, recursión en rondas siguientes); el MARCADOR del partido decide qué lado
// ganó. Todo se deriva de `matches`, así que el cuadro se completa solo.

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

const PLACEHOLDER_CODES = new Set(['TBD', '???']);
function isRealTeam(team: Team | undefined): team is Team {
  return !!team && team.id > 0 && !PLACEHOLDER_CODES.has(team.code);
}

function isDecided(match: Match | undefined): match is Match {
  return (
    !!match &&
    match.status === 'finished' &&
    match.homeScore != null &&
    match.awayScore != null &&
    // Definido por marcador (incluye el +1 del modelo de bump) o, cuando el
    // resultado quedó empate, por el ganador explícito de la tanda de penales.
    (match.homeScore !== match.awayScore || !!match.penaltyWinner)
  );
}

/** Datos compartidos para resolver la identidad de un slot del cuadro. */
export interface SlotContext {
  matchByNum: Map<number, Match>;
  teamMap: Map<number, Team> | undefined;
  projection: BracketProjection;
}

/**
 * Equipo que ocupa un slot (home/away) de cualquier partido del cuadro:
 *  1) el equipo real si el feed ya lo asignó;
 *  2) en la R32, la proyección de la fase de grupos (1°/2° o mejor 3ro);
 *  3) en rondas de cruce, el GANADOR del hijo correspondiente (recursivo);
 *  4) en el 3er puesto, el PERDEDOR de la semi correspondiente.
 * Devuelve null si todavía no se puede determinar.
 */
export function resolveAdvancingSlot(
  matchNumber: number,
  side: 'home' | 'away',
  ctx: SlotContext,
): Team | null {
  // 1. Equipo real ya asignado por el feed.
  const m = ctx.matchByNum.get(matchNumber);
  if (m) {
    const realId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const real = ctx.teamMap?.get(realId);
    if (isRealTeam(real)) return real;
  }
  // 2. R32: proyección desde la fase de grupos.
  if (R32_LABELS[matchNumber]) {
    return resolveBracketSlot(matchNumber, side, ctx.projection)?.team ?? null;
  }
  // 3. 3er puesto: perdedor de la semifinal correspondiente.
  if (matchNumber === THIRD_PLACE_MATCH.matchNumber) {
    const [sfA, sfB] = THIRD_PLACE_MATCH.children ?? [101, 102];
    return resolveOutcome(side === 'home' ? sfA : sfB, 'loser', ctx);
  }
  // 4. Ronda de cruce: ganador del hijo que alimenta este lado.
  const children = CHILDREN_BY_MATCH.get(matchNumber);
  if (!children) return null;
  return resolveOutcome(side === 'home' ? children[0] : children[1], 'winner', ctx);
}

/**
 * Ganador o perdedor de un partido del cuadro: resuelve las identidades de ambos
 * lados (vía proyección/recursión) y elige el lado ganador. El ganador sale de:
 *  1) `penaltyWinner` cuando el cruce se definió por penales y quedó empate (el
 *     marcador guardado sigue siendo el resultado real, sin bump);
 *  2) el marcador en cualquier otro caso (incluye el +1 del modelo de bump).
 * null si el partido no terminó o quedó empatado sin ganador de tanda.
 */
function resolveOutcome(
  matchNumber: number,
  which: 'winner' | 'loser',
  ctx: SlotContext,
): Team | null {
  const m = ctx.matchByNum.get(matchNumber);
  if (!isDecided(m)) return null;
  const home = resolveAdvancingSlot(matchNumber, 'home', ctx);
  const away = resolveAdvancingSlot(matchNumber, 'away', ctx);
  const homeWon = m.penaltyWinner ? m.penaltyWinner === 'home' : m.homeScore! > m.awayScore!;
  const advancing = which === 'winner' ? homeWon : !homeWon;
  return advancing ? home : away;
}
