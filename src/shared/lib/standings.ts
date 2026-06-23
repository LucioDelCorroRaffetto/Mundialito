/**
 * standings.ts — cálculo puro de la tabla de posiciones de un grupo.
 *
 * Vive en lib (sin React) para que lo compartan el componente de standings, la
 * tabla de terceros y el engine de asignación del bracket sin arrastrar JSX. El
 * componente `group-standings.tsx` lo reexporta por compatibilidad con imports
 * existentes.
 *
 * Orden oficial FIFA 2026: puntos → (desempate del bloque empatado) duelo
 * directo (pts → DG → GF entre los empatados, recursivo) → DG global → GF
 * global → nombre. Conducta (tarjetas) y ranking FIFA no están en el modelo, así
 * que el desempate final determinístico es el nombre.
 */
import type { Match, Team } from '@/shared/types/api';

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
export type Group = typeof GROUPS[number];

export interface TeamRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

/**
 * Ordena un bloque de equipos empatados en puntos con el criterio oficial:
 * mini-tabla de enfrentamientos directos (pts → DG → GF entre ellos),
 * reaplicada recursivamente si separa solo a algunos. Si el head-to-head no
 * separa a nadie, se cae a los criterios globales (DG total → GF total → nombre).
 */
function breakTie(tied: TeamRow[], groupMatches: Match[]): TeamRow[] {
  if (tied.length <= 1) return tied;

  const ids = new Set(tied.map((r) => r.team.id));

  const h2h = new Map(tied.map((r) => [r.team.id, { pts: 0, gd: 0, gf: 0 }]));
  for (const m of groupMatches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    if (!ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue;
    const home = h2h.get(m.homeTeamId)!;
    const away = h2h.get(m.awayTeamId)!;
    home.gf += m.homeScore; home.gd += m.homeScore - m.awayScore;
    away.gf += m.awayScore; away.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) home.pts += 3;
    else if (m.homeScore < m.awayScore) away.pts += 3;
    else { home.pts += 1; away.pts += 1; }
  }

  const sorted = [...tied].sort((a, b) => {
    const ha = h2h.get(a.team.id)!;
    const hb = h2h.get(b.team.id)!;
    if (hb.pts !== ha.pts) return hb.pts - ha.pts;
    if (hb.gd !== ha.gd) return hb.gd - ha.gd;
    if (hb.gf !== ha.gf) return hb.gf - ha.gf;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });

  // Re-aplicar head-to-head a los sub-bloques que sigan empatados en la mini-tabla.
  const result: TeamRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    const hi = h2h.get(sorted[i].team.id)!;
    while (j < sorted.length) {
      const hj = h2h.get(sorted[j].team.id)!;
      if (hj.pts !== hi.pts || hj.gd !== hi.gd || hj.gf !== hi.gf) break;
      j++;
    }
    const sub = sorted.slice(i, j);
    if (sub.length > 1 && sub.length < tied.length) {
      result.push(...breakTie(sub, groupMatches));
    } else {
      result.push(...sub);
    }
    i = j;
  }
  return result;
}

export function computeStandings(teams: Team[], matches: Match[], group: string): TeamRow[] {
  const groupTeams = teams.filter((t) => t.group === group);
  const groupMatches = matches.filter((m) => m.group === group && m.status === 'finished');

  const rows = new Map<number, TeamRow>(
    groupTeams.map((t) => [
      t.id,
      { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
    ]),
  );

  for (const m of groupMatches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.won++; home.pts += 3; away.lost++;
    } else if (m.homeScore < m.awayScore) {
      away.won++; away.pts += 3; home.lost++;
    } else {
      home.drawn++; home.pts += 1; away.drawn++; away.pts += 1;
    }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  // Por bloques de igual puntaje, desempatar con el criterio oficial.
  const byPoints = Array.from(rows.values()).sort((a, b) => b.pts - a.pts);
  const result: TeamRow[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i + 1;
    while (j < byPoints.length && byPoints[j].pts === byPoints[i].pts) j++;
    result.push(...breakTie(byPoints.slice(i, j), groupMatches));
    i = j;
  }
  return result;
}
