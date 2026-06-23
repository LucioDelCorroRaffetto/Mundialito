import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { GROUPS, computeStandings, type Group, type TeamRow } from '@/shared/lib/standings';
import type { Match, Team } from '@/shared/types/api';

// Reexport por compatibilidad: estos símbolos vivían acá antes de moverse a
// lib/standings.ts. third-place-table.tsx (y otros) importan desde este módulo.
export { GROUPS, computeStandings };
export type { Group, TeamRow };

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
