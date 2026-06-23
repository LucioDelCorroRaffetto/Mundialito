/**
 * bracket-projection.ts — resolución de los slots de la Ronda de 32 a partir de
 * la proyección de grupos (1°/2° confirmados o clasificados provisionales) y de
 * los mejores terceros. Es la fuente única que comparten el cuadro completo
 * (bracket-view) y el detalle de partido.
 */
import { R32_LABELS } from '@/shared/data/bracket';
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
