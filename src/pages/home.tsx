import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Trophy, ChevronRight, AlertCircle } from 'lucide-react';
import { useMatches } from '@/shared/hooks/use-matches';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { useMyPredictions } from '@/shared/hooks/use-predictions';
import { usePwaInstall } from '@/shared/hooks/use-pwa-install';
import { useAuthStore } from '@/shared/stores/auth-store';
import type { Match, Team } from '@/shared/types/api';
import { Button } from '@/shared/components/ui/button';
import { TeamFlag } from '@/shared/components/ui/team-flag';

const WORLD_CUP_START = '2026-06-11T19:00:00Z';

function useCountdown(targetUtc: string) {
  const [diff, setDiff] = useState(() => new Date(targetUtc).getTime() - Date.now());
  useEffect(() => {
    const update = () => setDiff(new Date(targetUtc).getTime() - Date.now());
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetUtc]);
  const total = Math.max(0, diff);
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const mins = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  return { days, hours, mins, secs, ended: diff <= 0 };
}

function CountdownTiles({ targetUtc }: { targetUtc: string }) {
  const { days, hours, mins, secs } = useCountdown(targetUtc);
  return (
    <div className="flex items-center justify-center gap-2">
      {[
        { value: days, label: 'días' },
        { value: hours, label: 'hs' },
        { value: mins, label: 'min' },
        { value: secs, label: 'seg' },
      ].map(({ value, label }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-0.5 bg-elevated rounded-lg px-3 py-2 min-w-[58px]"
        >
          <span className="text-2xl font-display font-bold text-accent tabular-nums">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

function CountdownHero({
  nextMatch,
  teamMap,
}: {
  nextMatch: Match | null;
  teamMap: Map<number, Team> | undefined;
}) {
  const tournamentStarted = Date.now() > new Date(WORLD_CUP_START).getTime();

  // Before tournament: countdown to first match
  if (!tournamentStarted) {
    return (
      <div className="bg-gradient-to-br from-accent-soft to-card border border-accent-border rounded-xl p-5">
        <p className="text-sm font-semibold text-text mb-3 text-center">
          Arranca el Mundial 2026 🌎
        </p>
        <CountdownTiles targetUtc={WORLD_CUP_START} />
      </div>
    );
  }

  // Tournament started but no next match found
  if (!nextMatch) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-base font-bold text-accent text-center">¡El Mundial ya comenzó! 🏆</p>
      </div>
    );
  }

  const homeTeam = teamMap?.get(nextMatch.homeTeamId);
  const awayTeam = teamMap?.get(nextMatch.awayTeamId);
  const kickoffMs = new Date(nextMatch.kickoffUtc).getTime();
  const isLive = Date.now() > kickoffMs;

  return (
    <div className="bg-gradient-to-br from-accent-soft to-card border border-accent-border rounded-xl p-5">
      {isLive ? (
        <div className="flex items-center gap-2 mb-3 justify-center">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider">En juego ahora</p>
        </div>
      ) : (
        <p className="text-sm font-semibold text-text mb-3 text-center">Próximo partido ⚽</p>
      )}

      {homeTeam && awayTeam && (
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="flex flex-col items-center gap-1.5">
            <TeamFlag code={homeTeam.code} emoji={homeTeam.flag} size={40} />
            <span className="text-sm font-bold text-text">{homeTeam.code}</span>
          </div>
          <span className="text-sm font-bold text-muted">vs</span>
          <div className="flex flex-col items-center gap-1.5">
            <TeamFlag code={awayTeam.code} emoji={awayTeam.flag} size={40} />
            <span className="text-sm font-bold text-text">{awayTeam.code}</span>
          </div>
        </div>
      )}

      {!isLive && <CountdownTiles targetUtc={nextMatch.kickoffUtc} />}
    </div>
  );
}

function formatKickoff(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

const PLACEHOLDER_TEAM: Team = {
  id: 0,
  code: '???',
  flag: '🏳️',
  name: 'Cargando...',
  group: null,
  confederation: null,
};

export function HomePage() {
  const { data: matchesResponse } = useMatches({ status: 'scheduled', limit: 6 });
  const { data: teamMap } = useTeamMap();
  const { data: leaguesResponse } = useMyLeagues();
  const { data: myPredictionsData } = useMyPredictions();
  const { isInstallable, isInstalled, install } = usePwaInstall();
  const username = useAuthStore((s) => s.user?.username);

  const apiMatches = matchesResponse?.data ?? [];
  // First match is used for the countdown; rest shown in the upcoming list
  const nextMatch = apiMatches[0] ?? null;
  const upcoming = apiMatches.slice(1, 6).map((m) => ({
    id: m.id,
    kickoffUtc: m.kickoffUtc,
    city: m.city,
    homeTeam: teamMap?.get(m.homeTeamId) ?? PLACEHOLDER_TEAM,
    awayTeam: teamMap?.get(m.awayTeamId) ?? PLACEHOLDER_TEAM,
  }));

  const apiLeagues = leaguesResponse?.data ?? [];
  const leaguesToShow = apiLeagues.map((l) => ({
    id: l.id,
    name: l.name,
    isPublic: l.isPublic,
    memberCount: l.memberCount ?? 0,
    myPoints: l.myPoints ?? 0,
  }));

  const predictedIds = new Set((myPredictionsData?.data ?? []).map((p) => p.matchId));
  const pendingCount = apiMatches.filter(
    (m) => m.status !== 'finished' && !predictedIds.has(m.id)
  ).length;

  const firstLeagueId = apiLeagues[0]?.id ?? null;
  const hasLeagues = apiLeagues.length > 0;

  return (
    <div className="animate-fade-in px-4 pt-6 pb-4 md:px-0 md:pt-8">
      {/* Greeting */}
      <div className="mb-4">
        <p className="text-sm text-muted">¡Hola, {username ?? 'crack'}! 👋</p>
        <h1 className="text-2xl font-display font-bold text-text">Mundialito</h1>
      </div>

      {/* PWA install banner */}
      {isInstallable && !isInstalled && (
        <button
          onClick={install}
          className="w-full flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-4 py-3 text-sm text-emerald-300 mb-4"
        >
          <span>📲</span>
          <span className="flex-1 text-left">Instalá Mundialito en tu celular</span>
          <span className="text-emerald-400 font-semibold">Instalar</span>
        </button>
      )}

      {/* Two-column layout on desktop */}
      <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 lg:grid-cols-[1fr_340px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-5">
          {/* Countdown */}
          <CountdownHero nextMatch={nextMatch} teamMap={teamMap} />

          {/* Pending predictions call-to-action */}
          {pendingCount > 0 && (
            <Link
              to="/matches"
              className="flex items-center gap-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/15 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">
                  {pendingCount} partido{pendingCount !== 1 ? 's' : ''} sin pronosticar
                </p>
                <p className="text-xs text-muted">Tocá para hacer tus pronósticos</p>
              </div>
              <ChevronRight size={16} className="text-orange-400 flex-shrink-0" />
            </Link>
          )}

          {/* My Leagues header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-bold text-text">Mis ligas</h2>
            <Link
              to="/leagues/create"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-on text-sm font-semibold"
            >
              <Plus size={15} />
              Nueva
            </Link>
          </div>

          {/* League cards */}
          {hasLeagues ? (
            <div className="flex flex-col gap-3">
              {leaguesToShow.map((league, i) => (
                <motion.div
                  key={league.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Link
                    to={`/leagues/${league.id}`}
                    className="flex items-center gap-4 p-4 rounded-lg bg-card border border-border shadow-card hover:border-accent-border transition-colors"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-accent-soft flex items-center justify-center">
                      <Trophy size={20} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold text-text truncate">{league.name}</p>
                        {!league.isPublic && (
                          <span className="text-xs text-muted border border-border rounded px-1.5 py-0.5 flex-shrink-0">
                            privada
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted">
                          {league.memberCount} miembro{league.memberCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-sm text-accent font-semibold">{league.myPoints} pts</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-muted flex-shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border text-center">
              <span className="text-3xl">🏆</span>
              <div>
                <p className="text-base font-semibold text-text">Todavía no tenés ligas</p>
                <p className="text-sm text-muted mt-0.5">
                  Creá una liga o unite con un código para competir con tus amigos
                </p>
              </div>
            </div>
          )}

          {/* League actions */}
          <div className="flex gap-3">
            <Link to="/leagues/join" className="flex-1">
              <Button variant="secondary" fullWidth>
                <Search size={16} />
                Unirse a una liga
              </Button>
            </Link>
            <Link to="/leagues" className="flex-1">
              <Button variant="ghost" fullWidth>Ver todas</Button>
            </Link>
          </div>

          {/* Upcoming matches — mobile only (shown in right column on desktop) */}
          <div className="md:hidden">
            <UpcomingMatchesSection upcoming={upcoming} firstLeagueId={firstLeagueId} />
          </div>

          {/* Tournament shortcut — mobile only */}
          <div className="md:hidden">
            <TournamentShortcut />
          </div>
        </div>

        {/* ── RIGHT COLUMN (desktop only) ── */}
        <div className="hidden md:flex flex-col gap-5">
          <TournamentShortcut />
          <UpcomingMatchesSection upcoming={upcoming} firstLeagueId={firstLeagueId} />
        </div>
      </div>
    </div>
  );
}

function TournamentShortcut() {
  return (
    <Link
      to="/tournament"
      className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-accent-border transition-colors"
    >
      <span className="text-2xl">🌎</span>
      <div className="flex-1">
        <p className="text-base font-semibold text-text">Predicciones del Torneo</p>
        <p className="text-sm text-muted">Campeón, goleador, sorpresas</p>
      </div>
      <ChevronRight size={16} className="text-muted" />
    </Link>
  );
}

interface UpcomingMatch {
  id: number;
  kickoffUtc: string;
  city: string;
  homeTeam: Pick<Team, 'id' | 'code' | 'flag' | 'name'>;
  awayTeam: Pick<Team, 'id' | 'code' | 'flag' | 'name'>;
}

function UpcomingMatchesSection({
  upcoming,
  firstLeagueId,
}: {
  upcoming: UpcomingMatch[];
  firstLeagueId: number | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-text">Próximos partidos</h2>
        <Link to="/matches" className="text-sm text-accent font-semibold">Ver todos</Link>
      </div>
      <div className="flex flex-col gap-2">
        {upcoming.map((match) => (
          <Link
            key={match.id}
            to={firstLeagueId ? `/matches/${match.id}?leagueId=${firstLeagueId}` : `/matches/${match.id}`}
            className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
          >
            <div className="text-center min-w-0 flex-1">
              <p className="text-xs text-muted">{formatKickoff(match.kickoffUtc)} · {formatTime(match.kickoffUtc)}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="flex items-center justify-end gap-1.5 text-sm font-semibold text-text flex-1 truncate">
                  <TeamFlag code={match.homeTeam.code} emoji={match.homeTeam.flag} size={20} />
                  {match.homeTeam.code}
                </span>
                <span className="text-xs text-muted font-bold">vs</span>
                <span className="flex items-center justify-start gap-1.5 text-sm font-semibold text-text flex-1 truncate">
                  {match.awayTeam.code}
                  <TeamFlag code={match.awayTeam.code} emoji={match.awayTeam.flag} size={20} />
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">{match.city}</p>
            </div>
            <ChevronRight size={16} className="text-muted flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
