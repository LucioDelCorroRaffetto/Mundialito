import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { GROUPS, computeStandings, type TeamRow } from '@/shared/components/group-standings';
import type { Match, Team } from '@/shared/types/api';

/** Cantidad de mejores terceros que avanzan a la Ronda de 32. */
const QUALIFYING_THIRDS = 8;

interface ThirdRow extends TeamRow {
  group: string;
}

/**
 * Toma el 3° de cada uno de los 12 grupos y los rankea entre sí con los
 * mismos criterios de la fase de grupos (pts → DG → GF). El desempate por
 * fair play / sorteo no está en el modelo de datos, así que se cae a GF y
 * luego nombre.
 */
function computeThirdPlace(teams: Team[], matches: Match[]): ThirdRow[] {
  const thirds: ThirdRow[] = [];

  for (const group of GROUPS) {
    const standings = computeStandings(teams, matches, group);
    const third = standings[2];
    if (third) thirds.push({ ...third, group });
  }

  // Criterio oficial FIFA 2026 para rankear terceros (no hay head-to-head
  // porque vienen de grupos distintos): pts → DG → GF → conducta → ranking
  // FIFA. Conducta y FIFA no están en el modelo, así que el desempate final
  // determinístico es el nombre.
  return thirds.sort((a, b) => {
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

export function ThirdPlaceTable({ teams, matches }: Props) {
  const thirds = useMemo(() => computeThirdPlace(teams, matches), [teams, matches]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-elevated border-b border-border text-xs-s text-muted font-semibold">
          <span className="w-5 text-center">#</span>
          <span className="flex-1">Equipo</span>
          <span className="w-5 text-center">Gr</span>
          <span className="w-6 text-center">PJ</span>
          <span className="w-6 text-center">G</span>
          <span className="w-6 text-center">E</span>
          <span className="w-6 text-center">P</span>
          <span className="w-8 text-center">GD</span>
          <span className="w-7 text-center font-bold text-accent">Pts</span>
        </div>

        {thirds.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm-s text-muted">Sin datos de terceros todavía</p>
          </div>
        ) : (
          thirds.map((row, idx) => {
            const isQualified = idx < QUALIFYING_THIRDS;
            const isCutoff = idx === QUALIFYING_THIRDS - 1; // 8° — última plaza

            return (
              <div key={row.team.id} className="relative">
                <div
                  className={cn(
                    'flex items-center gap-2 py-3 border-b border-border last:border-0',
                    isCutoff && 'border-b-2 border-accent-border',
                  )}
                >
                  {/* Barra de color */}
                  <div
                    className={cn(
                      'w-1 self-stretch rounded-r-sm flex-shrink-0',
                      isQualified ? 'bg-green-500' : 'bg-red-500',
                    )}
                  />

                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-3">
                    <span
                      className={cn(
                        'w-5 text-center text-sm-s font-bold flex-shrink-0',
                        isQualified ? 'text-green-400' : 'text-red-400',
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
                    <span className="w-5 text-center text-xs-s font-bold text-muted">
                      {row.group}
                    </span>
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

                {/* Línea "Siguiente Ronda" tras el 8° */}
                {isCutoff && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-elevated/60">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                      Siguiente Ronda
                    </span>
                    <span className="flex-1 h-px bg-accent-border" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-col gap-2 px-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs-s text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500 flex-shrink-0" />
            Clasifica a Ronda de 32
          </span>
          <span className="flex items-center gap-1.5 text-xs-s text-muted">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" />
            Eliminado
          </span>
        </div>
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s text-muted leading-relaxed">
            <span className="font-semibold text-text">Mejores terceros.</span>{' '}
            De los 12 grupos, los{' '}
            <span className="text-green-400 font-semibold">8 mejores 3°</span>{' '}
            avanzan junto a los 24 ganadores y subcampeones de grupo. Orden por
            puntos → diferencia de gol → goles a favor. El desempate por fair
            play / sorteo no está contemplado.
          </p>
        </div>
      </div>
    </div>
  );
}
