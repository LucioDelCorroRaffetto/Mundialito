import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
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
 * Ordena un grupo de equipos empatados en puntos según el criterio oficial
 * FIFA 2026: enfrentamientos directos (pts → DG → GF entre los empatados),
 * reaplicados recursivamente si separan solo a algunos. Si el head-to-head no
 * separa a nadie, se cae a los criterios globales (DG total → GF total).
 *
 * Conducta (tarjetas) y ranking FIFA — los dos últimos criterios oficiales —
 * no están en el modelo de datos, así que el desempate final determinístico es
 * el nombre del equipo.
 */
function breakTie(tied: TeamRow[], groupMatches: Match[]): TeamRow[] {
  if (tied.length <= 1) return tied;

  const ids = new Set(tied.map((r) => r.team.id));

  // Mini-tabla solo con los partidos jugados entre los empatados.
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
    // Criterios globales (fuera del head-to-head)
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });

  // Re-aplicar head-to-head a los sub-grupos que sigan empatados en el mini-table.
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
    // Solo recursar si el head-to-head separó algo (evita loop infinito).
    if (sub.length > 1 && sub.length < tied.length) {
      result.push(...breakTie(sub, groupMatches));
    } else {
      result.push(...sub);
    }
    i = j;
  }
  return result;
}

export function computeStandings(teams: Team[], matches: Match[], group: Group): TeamRow[] {
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

  // Orden por puntos, desempatando cada bloque de igual puntaje con el
  // criterio oficial (head-to-head → DG/GF global → nombre).
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

interface Props {
  teams: Team[];
  matches: Match[];
}

export function GroupStandings({ teams, matches }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<Group>('A');

  const standings = useMemo(
    () => computeStandings(teams, matches, selectedGroup),
    [teams, matches, selectedGroup],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Group selector */}
      <div className="flex gap-1.5 flex-wrap">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGroup(g)}
            className={cn(
              'w-9 h-9 rounded-lg text-sm-s font-bold transition-colors border',
              selectedGroup === g
                ? 'bg-accent text-accent-on border-accent'
                : 'bg-card border-border text-muted hover:border-accent-border',
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Standings table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-elevated border-b border-border text-xs-s text-muted font-semibold">
          <span className="w-5 text-center">#</span>
          <span className="flex-1">Equipo</span>
          <span className="w-6 text-center">PJ</span>
          <span className="w-6 text-center">G</span>
          <span className="w-6 text-center">E</span>
          <span className="w-6 text-center">P</span>
          <span className="w-8 text-center">GD</span>
          <span className="w-7 text-center font-bold text-accent">Pts</span>
        </div>

        {standings.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm-s text-muted">Sin datos para el Grupo {selectedGroup}</p>
          </div>
        ) : (
          standings.map((row, idx) => {
            const isQualified = idx < 2;   // top 2 — clasifica directo
            const isBubble    = idx === 2; // 3ro — puede clasificar como mejor tercero
            const isEliminated = idx === 3; // 4to — eliminado

            return (
              <div
                key={row.team.id}
                className={cn(
                  'flex items-center gap-2 py-3 border-b border-border last:border-0',
                  // left color bar via padding + border-left trick
                  'pl-0',
                )}
              >
                {/* Color indicator bar */}
                <div className={cn(
                  'w-1 self-stretch rounded-r-sm flex-shrink-0',
                  isQualified  ? 'bg-green-500'  : '',
                  isBubble     ? 'bg-yellow-400' : '',
                  isEliminated ? 'bg-red-500'    : '',
                  !isQualified && !isBubble && !isEliminated ? 'bg-transparent' : '',
                )} />

                <div className="flex items-center gap-2 flex-1 min-w-0 pr-3">
                  <span
                    className={cn(
                      'w-5 text-center text-sm-s font-bold flex-shrink-0',
                      isQualified  ? 'text-green-400'  : '',
                      isBubble     ? 'text-yellow-400' : '',
                      isEliminated ? 'text-red-400'    : '',
                      !isQualified && !isBubble && !isEliminated ? 'text-muted' : '',
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <TeamFlag code={row.team.code} emoji={row.team.flag} size={20} />
                    <span className="text-sm-s font-semibold text-text truncate">
                      {row.team.name}
                    </span>
                  </div>
                  <span className="w-6 text-center text-xs-s text-muted">{row.played}</span>
                  <span className="w-6 text-center text-xs-s text-text">{row.won}</span>
                  <span className="w-6 text-center text-xs-s text-text">{row.drawn}</span>
                  <span className="w-6 text-center text-xs-s text-text">{row.lost}</span>
                  <span
                    className={cn(
                      'w-8 text-center text-xs-s font-semibold',
                      row.gd > 0 ? 'text-green-400' : row.gd < 0 ? 'text-red-400' : 'text-muted',
                    )}
                  >
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </span>
                  <span className="w-7 text-center text-sm-s font-bold text-accent">
                    {row.pts}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2 px-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs-s text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500 flex-shrink-0" />
            Clasificado directo (1° y 2°)
          </span>
          <span className="flex items-center gap-1.5 text-xs-s text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 flex-shrink-0" />
            Puede clasificar como mejor 3°
          </span>
          <span className="flex items-center gap-1.5 text-xs-s text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" />
            Eliminado
          </span>
        </div>
        {/* Rule explanation */}
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s text-muted leading-relaxed">
            <span className="font-semibold text-text">¿Cómo clasifican los terceros?</span>
            {' '}Los 12 grupos aportan 1° y 2° (24 equipos). Los{' '}
            <span className="text-yellow-400 font-semibold">8 mejores terceros</span>
            {' '}de los 12 grupos también avanzan a la Ronda de 32.
            El criterio de desempate es: puntos → diferencia de gol → goles a favor → fair play → sorteo.
          </p>
        </div>
      </div>
    </div>
  );
}
