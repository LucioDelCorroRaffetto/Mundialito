import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { Match, Team } from '@/shared/types/api';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
type Group = typeof GROUPS[number];

interface TeamRow {
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

function computeStandings(teams: Team[], matches: Match[], group: Group): TeamRow[] {
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

  return Array.from(rows.values()).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
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

  const hasResults = matches.some((m) => m.group === selectedGroup && m.status === 'finished');

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
            const isQualified = idx < 2; // top 2 auto-qualify
            const isBubble = idx === 2; // 3rd place might qualify
            return (
              <div
                key={row.team.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-3 border-b border-border last:border-0',
                  isQualified && hasResults && 'bg-green-500/5',
                  isBubble && hasResults && 'bg-yellow-500/5',
                )}
              >
                <span
                  className={cn(
                    'w-5 text-center text-sm-s font-bold',
                    isQualified && hasResults ? 'text-green-400' : 'text-muted',
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
            );
          })
        )}
      </div>

      {/* Legend */}
      {hasResults && (
        <div className="flex items-center gap-4 text-xs-s text-muted px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-green-500/40" />
            Clasificado directo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-yellow-500/40" />
            Puede clasificar
          </span>
        </div>
      )}
    </div>
  );
}
