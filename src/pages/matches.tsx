import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeams, useTeamMap } from '@/shared/hooks/use-teams';
import { useMyPredictions } from '@/shared/hooks/use-predictions';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { ROUND_LABELS } from '@/shared/data/mock';
import type { Match, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { GroupStandings } from '@/shared/components/group-standings';
import { cn } from '@/shared/lib/cn';

function formatDate(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

function groupByDate(matches: Match[]) {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const key = m.kickoffUtc.slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

const PLACEHOLDER_TEAM: Team = {
  id: 0,
  code: '???',
  flag: '🏳️',
  name: 'Cargando...',
  group: null,
  confederation: null,
};

/** Short display label for a team code — hides internal 'TBD' placeholder */
function teamDisplayCode(code: string): string {
  return code === 'TBD' ? '?' : code;
}

function getTeam(teamMap: Map<number, Team> | undefined, id: number): Team {
  return teamMap?.get(id) ?? PLACEHOLDER_TEAM;
}

const STATUS_TABS = ['Todos', 'En vivo', 'Pendientes', 'Pronosticados'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const WC_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

const MAIN_TABS = ['Partidos', 'Grupos'] as const;
type MainTab = (typeof MAIN_TABS)[number];

export function MatchesPage() {
  const [mainTab, setMainTab] = useState<MainTab>('Partidos');
  const [statusFilter, setStatusFilter] = useState<StatusTab>('Todos');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const { data: matchesResponse, isLoading, error } = useMatches({ limit: 200 });
  const { data: teamMap } = useTeamMap();
  const { data: teamsData } = useTeams();
  const { data: myPredictionsData } = useMyPredictions();
  const { data: myLeaguesData } = useMyLeagues();
  const matches = matchesResponse?.data ?? [];
  const teams = teamsData ?? [];

  const predictedIds = new Set((myPredictionsData?.data ?? []).map((p) => p.matchId));
  const firstLeagueId = myLeaguesData?.data[0]?.id ?? null;

  if (isLoading) {
    return <div className="p-4 text-muted">Cargando partidos...</div>;
  }
  if (error) {
    return (
      <div className="p-4 text-red-400">
        Error al cargar partidos: {String((error as Error).message)}
      </div>
    );
  }

  const groupMatches = matches.filter((m) => m.group !== null);

  const filteredByGroup = groupFilter
    ? matches.filter((m) => m.group === groupFilter)
    : matches;

  const filtered = filteredByGroup.filter((m) => {
    if (statusFilter === 'En vivo') return m.status === 'live';
    if (statusFilter === 'Pronosticados') return predictedIds.has(m.id);
    if (statusFilter === 'Pendientes') return !predictedIds.has(m.id) && m.status === 'scheduled';
    return true;
  });

  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Partidos</h1>
        <p className="text-sm-s text-muted mt-0.5">Mundial FIFA 2026 · 104 partidos</p>
      </div>

      {/* Main tabs: Partidos / Grupos */}
      <div className="flex gap-1 px-4 pt-2 pb-3">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={cn(
              'flex-1 py-2 rounded-md text-sm-s font-semibold transition-colors',
              mainTab === tab
                ? 'bg-accent text-accent-on'
                : 'bg-card border border-border text-muted hover:text-text',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {mainTab === 'Grupos' ? (
        <div className="px-4 pb-8">
          <GroupStandings teams={teams} matches={groupMatches} />
        </div>
      ) : (
        <>
          {/* Group filter chips */}
          <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
            <button
              onClick={() => setGroupFilter(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs-s font-semibold transition-colors whitespace-nowrap border',
                groupFilter === null
                  ? 'bg-accent text-accent-on border-accent'
                  : 'bg-card border-border text-muted',
              )}
            >
              Todos
            </button>
            {WC_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(groupFilter === g ? null : g)}
                className={cn(
                  'flex-shrink-0 w-9 h-8 rounded-full text-xs-s font-bold transition-colors border',
                  groupFilter === g
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-card border-border text-muted',
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 px-4 pb-4">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs-s font-semibold transition-colors',
                  statusFilter === tab
                    ? 'bg-elevated border border-accent text-accent'
                    : 'bg-card border border-border text-muted hover:text-text',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Match list */}
          <div className="flex flex-col gap-6 px-4 pb-4">
            {dates.map((date) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2"
              >
                <p className="text-sm-s font-bold text-muted capitalize">{formatDate(date)}</p>
                {grouped[date].map((match) => {
                  const prediction = (myPredictionsData?.data ?? []).find(
                    (p) => p.matchId === match.id,
                  );
                  const homeTeam = getTeam(teamMap, match.homeTeamId);
                  const awayTeam = getTeam(teamMap, match.awayTeamId);
                  return (
                    <Link
                      key={match.id}
                      to={
                        firstLeagueId
                          ? `/matches/${match.id}?leagueId=${firstLeagueId}`
                          : `/matches/${match.id}`
                      }
                      className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
                    >
                      <div className="flex-shrink-0">
                        {match.status === 'live' ? (
                          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse block" />
                        ) : prediction ? (
                          <CheckCircle2 size={18} className="text-green-400" />
                        ) : (
                          <Clock size={18} className="text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs-s text-muted">
                            {match.group ? `Grupo ${match.group}` : ROUND_LABELS[match.round]}
                          </span>
                          <span className="text-xs-s text-muted">·</span>
                          {match.status === 'live' ? (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                              <span className="text-xs-s font-bold text-red-400">EN VIVO</span>
                            </span>
                          ) : (
                            <span className="text-xs-s text-muted">{formatTime(match.kickoffUtc)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1.5 text-sm-s font-semibold text-text">
                            <TeamFlag code={homeTeam.code} emoji={homeTeam.flag} size={20} />
                            {teamDisplayCode(homeTeam.code)}
                          </span>
                          {(match.status === 'live' || match.status === 'finished') &&
                          match.homeScore !== null ? (
                            <span
                              className={cn(
                                'text-base-s font-display font-bold tabular-nums px-2',
                                match.status === 'live' ? 'text-red-400' : 'text-text',
                              )}
                            >
                              {match.homeScore} – {match.awayScore}
                            </span>
                          ) : (
                            <span className="text-xs-s font-bold text-muted">vs</span>
                          )}
                          <span className="flex items-center gap-1.5 text-sm-s font-semibold text-text">
                            {teamDisplayCode(awayTeam.code)}{' '}
                            <TeamFlag code={awayTeam.code} emoji={awayTeam.flag} size={20} />
                          </span>
                        </div>
                        {prediction && (
                          <p className="text-xs-s text-accent font-semibold mt-0.5">
                            Tu pronóstico: {prediction.homeScore} – {prediction.awayScore}
                            {prediction.points !== null && ` · +${prediction.points} pts`}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={16} className="text-muted flex-shrink-0" />
                    </Link>
                  );
                })}
              </motion.div>
            ))}

            {filtered.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-3xl-s mb-3">⚽</p>
                <p className="text-base-s font-semibold text-text">No hay partidos</p>
                <p className="text-sm-s text-muted mt-1">
                  {statusFilter === 'Pronosticados'
                    ? 'Todavía no pronosticaste ningún partido.'
                    : 'No hay partidos en esta categoría.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
