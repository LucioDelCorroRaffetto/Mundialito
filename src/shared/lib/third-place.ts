/**
 * third-place.ts — Fase 2 del autocompletado del bracket: asignación de los 8
 * mejores terceros a sus slots de la Ronda de 32.
 *
 * A diferencia del 1°/2° (que se confirma días antes — ver group-clinch.ts), el
 * SLOT de un tercero depende de los 12 grupos a la vez y de la tabla de
 * combinaciones FIFA (Anexo C, 495 filas). Por eso solo se resuelve cuando la
 * fase de grupos terminó por completo: en ese momento es determinístico.
 *
 * Flujo:
 *   1. Tomar el 3° de cada uno de los 12 grupos (con desempate oficial).
 *   2. Rankearlos entre sí (pts → DG → GF → nombre) y quedarse con los 8 mejores.
 *   3. Con el conjunto de 8 grupos clasificados, buscar la fila del Anexo C.
 *   4. Esa fila dice qué tercero enfrenta a cada ganador [1A,1B,1D,1E,1G,1I,1K,1L];
 *      mapear cada ganador a su partido R32 y devolver el equipo del slot.
 */
import type { Match, Team } from '@/shared/types/api';
import { GROUPS, computeStandings } from '@/shared/lib/standings';
import { THIRD_PLACE_COMBINATIONS, THIRD_PLACE_WINNERS } from '@/shared/data/third-place-combinations';

/** Ganador de grupo → match_number del cruce R32 donde enfrenta al tercero. */
export const WINNER_TO_R32_MATCH: Record<string, number> = {
  A: 79, B: 85, D: 81, E: 74, G: 82, I: 77, K: 87, L: 80,
};

interface ThirdEntry {
  group: string;
  team: Team;
  pts: number;
  gd: number;
  gf: number;
}

/** ¿Terminaron los 6 partidos de los 12 grupos? El cruce de terceros solo es
 *  determinístico con la fase de grupos completa. */
export function isGroupStageComplete(teams: Team[], matches: Match[]): boolean {
  const groupTeams = teams.filter((t) => t.group != null);
  if (groupTeams.length < 48) return false; // 12 grupos × 4
  const groupMatches = matches.filter((m) => m.group != null);
  if (groupMatches.length === 0) return false;
  return groupMatches.every(
    (m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null,
  );
}

/** Los 12 terceros rankeados entre sí (mejor primero). Vacío si falta data. */
export function computeThirdPlaceRanking(teams: Team[], matches: Match[]): ThirdEntry[] {
  const thirds: ThirdEntry[] = [];
  for (const group of GROUPS) {
    const standings = computeStandings(teams, matches, group);
    const third = standings[2];
    if (third) thirds.push({ group, team: third.team, pts: third.pts, gd: third.gd, gf: third.gf });
  }
  // Criterio FIFA entre terceros de grupos distintos: pts → DG → GF → (conducta,
  // ranking FIFA: no modelados) → nombre.
  return thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
}

/**
 * Resuelve los 8 slots "Mejor 3ro" de la Ronda de 32 → Map<match_number, Team>.
 * Devuelve un mapa vacío si la fase de grupos no terminó o si la combinación de
 * grupos no está en la tabla (no debería pasar: la tabla cubre las 495).
 */
export function resolveThirdPlaceSlots(teams: Team[], matches: Match[]): Map<number, Team> {
  const out = new Map<number, Team>();
  if (!isGroupStageComplete(teams, matches)) return out;

  const ranking = computeThirdPlaceRanking(teams, matches);
  if (ranking.length < 12) return out;

  const qualifying = ranking.slice(0, 8);
  const byGroup = new Map(qualifying.map((e) => [e.group, e.team]));
  const key = qualifying.map((e) => e.group).sort().join('');

  const assignment = THIRD_PLACE_COMBINATIONS[key];
  if (!assignment) return out;

  THIRD_PLACE_WINNERS.forEach((winner, idx) => {
    const thirdGroup = assignment[idx];
    const team = byGroup.get(thirdGroup);
    const matchNumber = WINNER_TO_R32_MATCH[winner];
    if (team && matchNumber) out.set(matchNumber, team);
  });

  return out;
}
