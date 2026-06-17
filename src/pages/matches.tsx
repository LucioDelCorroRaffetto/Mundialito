import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, CheckCircle2, Check, X } from 'lucide-react';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeams, useTeamMap } from '@/shared/hooks/use-teams';
import { useMyPredictions } from '@/shared/hooks/use-predictions';
import { ROUND_LABELS } from '@/shared/data/mock';
import type { Match, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { GroupStandings } from '@/shared/components/group-standings';
import { BracketView } from '@/shared/components/bracket-view';
import { R32_LABELS } from '@/shared/data/bracket';
import { cn } from '@/shared/lib/cn';
import { SkeletonList } from '@/shared/components/skeleton';

function formatDate(localKey: string) {
  // localKey viene en YYYY-MM-DD (fecha local del dispositivo, ya calculada
  // en groupByDate). Lo parseamos como fecha local — sin convertir a UTC —
  // para que no se "corra" un día al renderizar.
  const [y, m, d] = localKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  // Usa la timezone del dispositivo — los usuarios viven en distintos países
  // de LATAM, fijar Buenos Aires daba horarios incorrectos a todos los demás.
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function groupByDate(matches: Match[]) {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    // Agrupar por la fecha LOCAL del dispositivo, no por la fecha UTC, para
    // que un partido de las 22 h MX no aparezca bajo el día siguiente.
    const local = new Date(m.kickoffUtc);
    const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
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

/** Short display label for a team.
 *  For TBD teams in knockout matches, shows the bracket slot label (e.g. "1° Grp A"). */
function teamDisplayLabel(
  code: string,
  matchNumber: number,
  side: 'home' | 'away',
): string {
  if (code !== 'TBD') return code;
  const label = R32_LABELS[matchNumber];
  if (label) return label[side];
  return 'Por definir';
}

function getTeam(teamMap: Map<number, Team> | undefined, id: number): Team {
  return teamMap?.get(id) ?? PLACEHOLDER_TEAM;
}

const STATUS_TABS = ['Todos', 'En vivo', 'Pendientes', 'Pronosticados', 'Terminados'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const WC_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

const MAIN_TABS = ['Partidos', 'Grupos', 'Cuadro'] as const;
type MainTab = (typeof MAIN_TABS)[number];

export function MatchesPage() {
  const [searchParams] = useSearchParams();
  const [mainTab, setMainTab] = useState<MainTab>('Partidos');
  const [statusFilter, setStatusFilter] = useState<StatusTab>('Todos');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // Allow deep-linking to the En vivo filter from the home banner.
  useEffect(() => {
    if (searchParams.get('filter') === 'live') {
      setStatusFilter('En vivo');
    }
    // Only on mount — afterwards the tab is fully user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 60s so live scores and the scheduled→live→finished status
  // transitions show up without a manual refresh. The WS hook (useLeagueSocket)
  // exists but isn't wired into this page, so polling is the reliable path.
  // refetchIntervalInBackground is off (in the hook) to spare Render's free tier.
  const { data: matchesResponse, isLoading, error } = useMatches(
    { limit: 200 },
    { refetchInterval: 60_000 },
  );
  const { data: teamMap } = useTeamMap();
  const { data: teamsData } = useTeams();
  const { data: myPredictionsData } = useMyPredictions();
  const matches = matchesResponse?.data ?? [];
  const teams = teamsData ?? [];

  const predictedIds = new Set((myPredictionsData?.data ?? []).map((p) => p.matchId));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-6 pb-4 animate-fade-in">
        <div className="h-7 w-28 bg-elevated rounded animate-pulse" />
        <div className="h-3 w-44 bg-elevated rounded animate-pulse mb-3" />
        <SkeletonList count={8} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 m-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col items-center gap-2 text-center animate-fade-in">
        <span className="text-2xl">⚠️</span>
        <p className="text-sm font-semibold text-red-600 dark:text-red-300">No pudimos cargar los partidos</p>
        <p className="text-xs text-muted max-w-xs">{String((error as Error).message)}</p>
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
    if (statusFilter === 'Terminados') return m.status === 'finished';
    return true;
  });

  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort();
  const liveCount = matches.filter((m) => m.status === 'live').length;
  const finishedCount = matches.filter((m) => m.status === 'finished').length;

  // Para la tab "En vivo" rompemos el agrupamiento por fecha y armamos
  // dos secciones explícitas: "En entretiempo" (halftime + descanso de
  // alargue) y "En juego ahora". Antes los partidos en pausa quedaban
  // mezclados con los activos y, sin animación pulsante, se confundían
  // con "ya terminó" o "no está en vivo".
  type LiveSection = { id: string; label: string; tone: 'halftime' | 'inplay'; matches: Match[] };
  const liveSections: LiveSection[] | null = statusFilter === 'En vivo' ? (() => {
    const halftime: Match[] = [];
    const inPlay: Match[] = [];
    for (const m of filtered) {
      const isHalt = m.liveStatus === 'half_time' || m.liveStatus === 'extra_time_break';
      (isHalt ? halftime : inPlay).push(m);
    }
    const sections: LiveSection[] = [];
    if (halftime.length > 0) {
      sections.push({ id: 'halftime', label: 'En entretiempo', tone: 'halftime', matches: halftime });
    }
    if (inPlay.length > 0) {
      sections.push({ id: 'inplay', label: 'En juego ahora', tone: 'inplay', matches: inPlay });
    }
    return sections;
  })() : null;

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl-s font-display font-bold text-text">Partidos</h1>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-[10px] font-bold text-red-600 dark:text-red-300 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} en vivo
            </span>
          )}
        </div>
        <p className="text-sm-s text-muted mt-0.5">
          Mundial FIFA 2026 · {finishedCount}/{matches.length} jugados
        </p>
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
                : 'bg-elevated border border-border text-muted hover:text-text',
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
      ) : mainTab === 'Cuadro' ? (
        <div className="px-3 pb-8">
          <BracketView matches={matches} teamMap={teamMap} />
        </div>
      ) : (
        <>
          {/* Group filter chips */}
          <div className="flex gap-1.5 px-4 py-1 pb-3 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setGroupFilter(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs-s font-semibold transition-colors whitespace-nowrap border',
                groupFilter === null
                  ? 'bg-accent text-accent-on border-accent'
                  : 'bg-elevated border-border text-muted hover:text-text',
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
                    : 'bg-elevated border-border text-muted hover:text-text',
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Status filter tabs — the 'En vivo' tab gets a red pulse when
              matches are actually live so it stands out at a glance. */}
          <div className="flex gap-1.5 px-4 py-1 pb-4 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map((tab) => {
              const isActive = statusFilter === tab;
              const liveTab = tab === 'En vivo' && liveCount > 0;
              const count =
                tab === 'En vivo'
                  ? liveCount
                  : tab === 'Terminados'
                    ? finishedCount
                    : null;
              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={cn(
                    'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs-s font-semibold whitespace-nowrap transition-colors border',
                    isActive
                      ? liveTab
                        ? 'bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.45)]'
                        : 'bg-accent text-accent-on border-accent'
                      : liveTab
                        ? 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/15'
                        : 'bg-elevated border-border text-muted hover:text-text',
                  )}
                >
                  {liveTab && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-200 animate-pulse" />
                  )}
                  {tab}
                  {count !== null && count > 0 && (
                    <span className="text-[10px] opacity-80">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Match list. Renderizamos secciones live-status para la tab
              "En vivo", o agrupado por fecha para las demás. La función
              MatchRow renderiza una sola card y se reusa en ambos paths. */}
          <div className="flex flex-col gap-6 px-4 pb-4">
            {liveSections && liveSections.map((section) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      section.tone === 'halftime' ? 'bg-amber-500' : 'bg-red-500 animate-pulse',
                    )}
                  />
                  <p
                    className={cn(
                      'text-xs-s font-bold uppercase tracking-wider',
                      section.tone === 'halftime' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {section.label} ({section.matches.length})
                  </p>
                </div>
                {section.matches.map((match) => renderMatchRow(match))}
              </motion.div>
            ))}
            {!liveSections && dates.map((date) => (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2"
              >
                <p className="text-sm-s font-bold text-muted capitalize">{formatDate(date)}</p>
                {grouped[date].map((match) => renderMatchRow(match))}
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

  function renderMatchRow(match: Match) {
    const prediction = (myPredictionsData?.data ?? []).find((p) => p.matchId === match.id);
    const homeTeam = getTeam(teamMap, match.homeTeamId);
    const awayTeam = getTeam(teamMap, match.awayTeamId);
    const isLive = match.status === 'live';
    const isFinished = match.status === 'finished';
    const isScheduled = match.status === 'scheduled';
    const isHalftime = isLive && (match.liveStatus === 'half_time' || match.liveStatus === 'extra_time_break');
    const predictionHit =
      isFinished && prediction && prediction.points !== null ? prediction.points > 0 : null;
    return (
      <motion.div
        key={match.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Link
          to={`/matches/${match.id}`}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border transition-all',
            isLive && !isHalftime &&
              'bg-card border-red-500/50 shadow-[0_0_0_1px_rgba(239,68,68,0.25),0_0_16px_-4px_rgba(239,68,68,0.45)] hover:border-red-500/70',
            isHalftime &&
              'bg-card border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_14px_-4px_rgba(245,158,11,0.4)] hover:border-amber-500/70',
            isFinished &&
              'bg-card/60 border-border/60 opacity-70 hover:opacity-90 hover:border-accent-border',
            isScheduled &&
              'bg-card border-border hover:border-accent-border',
          )}
        >
          <div className="flex-shrink-0">
            {isLive ? (
              <span className={cn('w-2 h-2 rounded-full block', isHalftime ? 'bg-amber-500' : 'bg-red-400 animate-pulse')} />
            ) : isFinished ? (
              predictionHit === true ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-500">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : predictionHit === false ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/15 text-red-500">
                  <X size={12} strokeWidth={3} />
                </span>
              ) : (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-elevated text-muted text-[9px] font-bold">
                  FT
                </span>
              )
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
              {isLive ? (
                isHalftime ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      Entretiempo
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-300 uppercase tracking-wider">
                      En vivo
                    </span>
                  </span>
                )
              ) : isFinished ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-elevated border border-border text-[10px] font-bold text-muted uppercase tracking-wider">
                  Final
                </span>
              ) : (
                <span className="text-xs-s font-semibold text-accent tabular-nums">
                  {formatTime(match.kickoffUtc)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-1.5 text-sm-s font-semibold text-text">
                {homeTeam.code !== 'TBD' && (
                  <TeamFlag code={homeTeam.code} emoji={homeTeam.flag} size={20} />
                )}
                <span className={homeTeam.code === 'TBD' ? 'text-muted text-xs-s' : ''}>
                  {teamDisplayLabel(homeTeam.code, match.matchNumber, 'home')}
                </span>
              </span>
              {(isLive || isFinished) && match.homeScore !== null ? (
                <span
                  className={cn(
                    'font-display font-bold tabular-nums px-2',
                    isLive
                      ? isHalftime ? 'text-lg-s text-amber-600 dark:text-amber-400' : 'text-lg-s text-red-500'
                      : 'text-sm-s text-muted',
                  )}
                >
                  {match.homeScore} – {match.awayScore}
                </span>
              ) : (
                <span className="text-xs-s font-bold text-muted">vs</span>
              )}
              <span className="flex items-center gap-1.5 text-sm-s font-semibold text-text">
                <span className={awayTeam.code === 'TBD' ? 'text-muted text-xs-s' : ''}>
                  {teamDisplayLabel(awayTeam.code, match.matchNumber, 'away')}
                </span>
                {awayTeam.code !== 'TBD' && (
                  <TeamFlag code={awayTeam.code} emoji={awayTeam.flag} size={20} />
                )}
              </span>
            </div>
            {prediction && (
              <p
                className={cn(
                  'text-xs-s font-semibold mt-0.5',
                  predictionHit === true
                    ? 'text-green-500'
                    : predictionHit === false
                      ? 'text-muted'
                      : 'text-accent',
                )}
              >
                Tu pronóstico: {prediction.homeScore} – {prediction.awayScore}
                {prediction.points !== null && ` · +${prediction.points} pts`}
              </p>
            )}
          </div>
          {!isFinished && <ChevronRight size={16} className="text-muted flex-shrink-0" />}
        </Link>
      </motion.div>
    );
  }
}
