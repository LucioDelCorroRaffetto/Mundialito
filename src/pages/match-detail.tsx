import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, CheckCircle2, Share2, Users, Plus } from 'lucide-react';
import { ROUND_LABELS } from '@/shared/data/mock';
import { getMaxPossiblePoints } from '@/shared/lib/scoring';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { sharePredictionCard } from '@/shared/lib/generate-prediction-card';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUpsertPrediction, useLeagueMatchPredictions, useMyPredictionForMatch } from '@/shared/hooks/use-predictions';
import type { LeagueMemberPrediction } from '@/shared/hooks/use-predictions';
import { useHaptic } from '@/shared/hooks/use-haptic';
import { useMatch } from '@/shared/hooks/use-matches';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { usePlayers } from '@/shared/hooks/use-players';
import type { Team } from '@/shared/types/api';

function PointsPreview({ home, away, scorerCount }: { home: number; away: number; scorerCount: number }) {
  const { isDraw, ifExact, ifWinnerDiff } = getMaxPossiblePoints(home, away);
  const scorerPts = scorerCount * 2;
  return (
    <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
      <p className="text-sm-s font-semibold text-text mb-2">
        📊 Puntos posibles con {home} - {away}
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm-s text-muted">{isDraw ? 'Empate exacto' : 'Resultado exacto'}</span>
          <span className="text-sm-s font-bold text-accent">+{ifExact} pts</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm-s text-muted">{isDraw ? 'Empate acertado' : 'Resultado correcto'}</span>
          <span className="text-sm-s font-bold text-accent">+{ifWinnerDiff} pt{ifWinnerDiff !== 1 ? 's' : ''}</span>
        </div>
        {scorerCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm-s text-muted">Goleadores ({scorerCount})</span>
            <span className="text-sm-s font-bold text-accent">+{scorerPts} pts</span>
          </div>
        )}
      </div>
    </div>
  );
}

const SCORER_POSITION_ORDER = ['FWD', 'MID', 'DEF', 'GK'] as const;
const SCORER_POSITION_LABELS: Record<string, string> = {
  FWD: 'Delanteros',
  MID: 'Mediocampistas',
  DEF: 'Defensores',
  GK: 'Porteros',
};

function ScorerPicker({
  team, maxGoals, selected, onChange, players,
}: {
  team: Team;
  maxGoals: number;
  selected: number[];
  onChange: (ids: number[]) => void;
  players: { id: number; name: string; position: string; teamId: number }[];
}) {
  const teamPlayers = players.filter((p) => p.teamId === team.id);

  const togglePlayer = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < maxGoals) {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TeamFlag code={team.code} emoji={team.flag} size={24} />
        <span className="text-sm-s font-semibold text-text">{team.name}</span>
        <span className="text-xs-s text-muted ml-auto">
          {selected.length} / {maxGoals} goles
        </span>
      </div>

      {teamPlayers.length === 0 ? (
        <p className="text-xs-s text-muted italic">Sin jugadores cargados para este equipo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {SCORER_POSITION_ORDER.map((pos) => {
            const posPlayers = teamPlayers.filter((p) => p.position === pos);
            if (posPlayers.length === 0) return null;
            return (
              <div key={pos}>
                <p className="text-xs-s text-muted font-semibold mb-1.5 uppercase tracking-wide">
                  {SCORER_POSITION_LABELS[pos]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {posPlayers.map((p) => {
                    const isSelected = selected.includes(p.id);
                    const isDisabled = !isSelected && selected.length >= maxGoals;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlayer(p.id)}
                        disabled={isDisabled}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs-s font-medium border transition-colors',
                          isSelected
                            ? 'bg-accent text-accent-on border-accent'
                            : isDisabled
                            ? 'bg-elevated border-border text-muted opacity-50 cursor-not-allowed'
                            : 'bg-elevated border-border text-text hover:border-accent-border'
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  team,
}: {
  value: number;
  onChange: (v: number) => void;
  team: { code: string; flag: string; name: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <TeamFlag code={team.code} emoji={team.flag} size={48} />
      <span className="text-base-s font-bold text-text">{teamDisplayCode(team.code)}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          −
        </button>
        <span className="w-10 text-center text-3xl-s font-display font-bold text-accent">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Short display label for a team — hides internal 'TBD' code */
function teamDisplayCode(code: string): string {
  return code === 'TBD' ? 'Por definir' : code;
}

function formatDate(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

function MemberAvatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent-border flex items-center justify-center flex-shrink-0">
      <span className="text-xs-s font-bold text-accent uppercase">
        {username.charAt(0)}
      </span>
    </div>
  );
}

function LeaguePredictionsSection({
  matchId,
  leagueId,
}: {
  matchId: number;
  leagueId: number;
}) {
  const { data, isLoading, isError } = useLeagueMatchPredictions(matchId, leagueId);

  return (
    <div className="mx-4 mt-4 p-4 rounded-lg bg-card border border-border">
      <p className="text-sm-s font-semibold text-text mb-3">Pronósticos de la liga</p>

      {isLoading && (
        <p className="text-xs-s text-muted text-center py-2">Cargando pronósticos...</p>
      )}

      {isError && (
        <p className="text-xs-s text-red-400 text-center py-2">No se pudieron cargar los pronósticos.</p>
      )}

      {data && data.meta.revealed === false && (
        <div className="flex items-center justify-center gap-2 py-3 rounded-md bg-elevated border border-border">
          <span className="text-base-s">🔒</span>
          <span className="text-sm-s text-muted">Se revelan al inicio del partido</span>
        </div>
      )}

      {data && data.meta.revealed === true && data.data.length === 0 && (
        <p className="text-xs-s text-muted text-center py-2">Nadie en la liga pronosticó este partido.</p>
      )}

      {data && data.meta.revealed === true && data.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.data.map((pred: LeagueMemberPrediction) => (
            <div
              key={pred.predictionId}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-elevated border border-border"
            >
              <MemberAvatar username={pred.username} avatarUrl={pred.avatarUrl} />
              <span className="text-sm-s font-medium text-text flex-1 truncate">{pred.username}</span>
              <div className="flex items-center gap-2">
                <span className="text-base-s font-display font-bold text-text tabular-nums">
                  {pred.homeScore} – {pred.awayScore}
                </span>
                {pred.points !== null && (
                  <span className="text-xs-s font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                    +{pred.points} pts
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leagueIdParam = searchParams.get('leagueId');
  const leagueIdFromParams = leagueIdParam ? Number(leagueIdParam) : null;

  const matchId = id ? Number(id) : undefined;

  const { data: match, isLoading: matchLoading } = useMatch(matchId);
  const { data: teamMap, isLoading: teamsLoading } = useTeamMap();
  const { data: myLeagues } = useMyLeagues();
  const { data: players } = usePlayers();

  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(leagueIdFromParams);
  const leagueId = selectedLeagueId;

  // Validate leagueId against user's actual leagues.
  // If the URL param points to a league the user doesn't belong to,
  // reset to their first league (or null if they have none).
  useEffect(() => {
    const leagues = myLeagues?.data ?? [];
    if (leagues.length === 0) {
      setSelectedLeagueId(null);
      return;
    }
    const isValid = leagues.some((l) => l.id === selectedLeagueId);
    if (!isValid) {
      // Auto-select their first league instead of using an invalid one
      setSelectedLeagueId(leagues[0].id);
    }
  // Run when myLeagues loads — intentionally not depending on selectedLeagueId
  // so we don't overwrite user's manual selection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLeagues]);

  const { data: existingPrediction } = useMyPredictionForMatch(matchId, leagueId ?? undefined);

  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [homeScorers, setHomeScorers] = useState<number[]>([]);
  const [awayScorers, setAwayScorers] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const username = useAuthStore((s) => s.user?.username);
  const upsertMutation = useUpsertPrediction();
  const { vibrate } = useHaptic();

  // Initialize scores and saved state when existing prediction loads
  useEffect(() => {
    if (existingPrediction) {
      setHomeScore(existingPrediction.homeScore ?? 0);
      setAwayScore(existingPrediction.awayScore ?? 0);
      setSaved(true);
    }
  }, [existingPrediction]);

  const isLoading = matchLoading || teamsLoading;

  // Once loading is done, if match not found navigate away
  useEffect(() => {
    if (!isLoading && matchId !== undefined && !match) {
      navigate('/matches', { replace: true });
    }
  }, [isLoading, match, matchId, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!match) return null;

  const homeTeam = teamMap?.get(match.homeTeamId);
  const awayTeam = teamMap?.get(match.awayTeamId);

  // Fallback team objects when teamMap is not yet available
  const homeTeamDisplay = homeTeam ?? { id: match.homeTeamId, name: String(match.homeTeamId), code: '?', flag: '🏳️', group: null, confederation: null };
  const awayTeamDisplay = awayTeam ?? { id: match.awayTeamId, name: String(match.awayTeamId), code: '?', flag: '🏳️', group: null, confederation: null };

  const playersList = players ?? [];

  const handleShare = async () => {
    setSharing(true);
    try {
      await sharePredictionCard({
        homeFlag: homeTeamDisplay.flag,
        homeName: homeTeamDisplay.name,
        homeCode: homeTeamDisplay.code,
        homeScore,
        awayFlag: awayTeamDisplay.flag,
        awayName: awayTeamDisplay.name,
        awayCode: awayTeamDisplay.code,
        awayScore,
        username,
        accentColor:
          getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || undefined,
      });
    } catch (e) {
      console.error('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  const updateHomeScore = (v: number) => {
    setHomeScore(v);
    if (homeScorers.length > v) setHomeScorers(homeScorers.slice(0, v));
    setSaved(false);
  };

  const updateAwayScore = (v: number) => {
    setAwayScore(v);
    if (awayScorers.length > v) setAwayScorers(awayScorers.slice(0, v));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!leagueId) {
      setSaveError('Seleccioná una liga para guardar tu pronóstico.');
      return;
    }
    setSaveError(null);
    try {
      await upsertMutation.mutateAsync({
        matchId: match.id,
        leagueId,
        homeScore,
        awayScore,
      });
      setSaved(true);
      vibrate(20);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      const apiMsg = err?.response?.data?.error?.message ?? '';
      // Translate known English API messages to Spanish
      const translated =
        apiMsg.toLowerCase().includes('not a member')
          ? 'No sos miembro de esa liga'
          : apiMsg.toLowerCase().includes('locked') || apiMsg.toLowerCase().includes('started')
          ? 'El pronóstico está cerrado para este partido'
          : apiMsg || 'Error al guardar pronóstico';
      setSaveError(translated);
    }
  };

  const myLeagueList = myLeagues?.data ?? [];
  const hasLeague = myLeagueList.length > 0;
  const showLeaguePicker = hasLeague;

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div>
          <span className="text-xs-s text-muted">
            {match.group ? `Grupo ${match.group}` : ROUND_LABELS[match.round]}
          </span>
          <p className="text-base-s font-bold text-text">Partido #{match.matchNumber}</p>
        </div>
      </div>

      <div className="mx-4 p-5 rounded-xl bg-card border border-border shadow-card">
        {match.status !== 'scheduled' && match.homeScore !== null ? (
          // Live / finished: show actual score
          <div className="flex flex-col items-center gap-2">
            {match.status === 'live' && (
              <span className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs-s font-bold text-red-400 uppercase tracking-wider">En Vivo</span>
              </span>
            )}
            <div className="flex items-center justify-around w-full gap-4">
              <div className="flex flex-col items-center gap-2">
                <TeamFlag code={homeTeamDisplay.code} emoji={homeTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(homeTeamDisplay.code)}</span>
              </div>
              <span className={cn(
                'text-4xl font-display font-bold tabular-nums',
                match.status === 'live' ? 'text-red-400' : 'text-text'
              )}>
                {match.homeScore} – {match.awayScore}
              </span>
              <div className="flex flex-col items-center gap-2">
                <TeamFlag code={awayTeamDisplay.code} emoji={awayTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(awayTeamDisplay.code)}</span>
              </div>
            </div>
            {match.status === 'finished' && (
              <span className="text-xs-s text-muted mt-1">Resultado final</span>
            )}
          </div>
        ) : hasLeague ? (
          // Scheduled + in a league: show score input
          <div className="flex items-center justify-around gap-4">
            <ScoreInput value={homeScore} onChange={updateHomeScore} team={homeTeamDisplay} />
            <span className="text-2xl-s font-display font-bold text-muted">vs</span>
            <ScoreInput value={awayScore} onChange={updateAwayScore} team={awayTeamDisplay} />
          </div>
        ) : (
          // Scheduled + no league: show teams without input
          <div className="flex items-center justify-around gap-4">
            <div className="flex flex-col items-center gap-2">
              <TeamFlag code={homeTeamDisplay.code} emoji={homeTeamDisplay.flag} size={48} />
              <span className="text-base-s font-bold text-text">{teamDisplayCode(homeTeamDisplay.code)}</span>
            </div>
            <span className="text-2xl-s font-display font-bold text-muted">vs</span>
            <div className="flex flex-col items-center gap-2">
              <TeamFlag code={awayTeamDisplay.code} emoji={awayTeamDisplay.flag} size={48} />
              <span className="text-base-s font-bold text-text">{teamDisplayCode(awayTeamDisplay.code)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted flex-shrink-0" />
          <span className="text-sm-s text-text capitalize">{formatDate(match.kickoffUtc)} · {formatTime(match.kickoffUtc)}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-muted flex-shrink-0" />
          <span className="text-sm-s text-text">{match.venue}, {match.city}</span>
        </div>
      </div>

      {/* ── No-league notice (Option B) ── */}
      {!hasLeague && match.status === 'scheduled' && (
        <div className="mx-4 mt-3 p-4 rounded-xl bg-elevated border border-border flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Users size={18} className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm-s font-semibold text-text">
                Necesitás una liga para pronosticar
              </p>
              <p className="text-xs-s text-muted mt-0.5">
                Los pronósticos se hacen dentro de una liga. Creá la tuya o unite con un código.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              to="/leagues/create"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-accent-on text-xs-s font-semibold"
            >
              <Plus size={14} />
              Crear liga
            </Link>
            <Link
              to="/leagues/join"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-elevated border border-border text-text text-xs-s font-semibold hover:border-accent-border transition-colors"
            >
              <Users size={14} />
              Unirse
            </Link>
          </div>
        </div>
      )}

      {/* ── League picker (when user has leagues) ── */}
      {showLeaguePicker && (
        <div className="mx-4 mt-3">
          <p className="text-xs-s text-muted mb-2">Liga para el pronóstico</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {myLeagueList.map((league) => (
              <button
                key={league.id}
                type="button"
                onClick={() => { setSelectedLeagueId(league.id); setSaved(false); setSaveError(null); }}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs-s font-semibold border transition-colors',
                  selectedLeagueId === league.id
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-elevated border-border text-text hover:border-accent-border'
                )}
              >
                {league.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Scorer picker (only when user has a league and scored > 0) ── */}
      {hasLeague && match.status === 'scheduled' && (homeScore + awayScore) > 0 && (
        <div className="mx-4 mt-3 p-4 rounded-lg bg-card border border-border">
          <p className="text-sm-s font-semibold text-text mb-3">⚽ Goleadores (opcional · +2 pts c/u)</p>
          <div className="flex flex-col gap-3">
            {homeScore > 0 && homeTeam && (
              <ScorerPicker
                team={homeTeam}
                maxGoals={homeScore}
                selected={homeScorers}
                onChange={(ids) => { setHomeScorers(ids); setSaved(false); }}
                players={playersList}
              />
            )}
            {awayScore > 0 && awayTeam && (
              <ScorerPicker
                team={awayTeam}
                maxGoals={awayScore}
                selected={awayScorers}
                onChange={(ids) => { setAwayScorers(ids); setSaved(false); }}
                players={playersList}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Points preview (only with league) ── */}
      {hasLeague && match.status === 'scheduled' && (
        <PointsPreview home={homeScore} away={awayScore} scorerCount={homeScorers.length + awayScorers.length} />
      )}

      {/* ── Save / saved state ── */}
      {hasLeague && match.status === 'scheduled' ? (
        <div className="px-4 mt-4">
          {saved ? (
            <>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500/15 border border-green-500/30"
              >
                <CheckCircle2 size={18} className="text-green-400" />
                <span className="text-sm-s font-semibold text-green-400">
                  Pronóstico guardado · {homeScore} - {awayScore}
                </span>
              </motion.div>
              <button
                onClick={handleShare}
                disabled={sharing}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-accent-border text-accent text-sm-s font-semibold hover:bg-accent-soft transition-colors disabled:opacity-50"
              >
                <Share2 size={16} />
                {sharing ? 'Generando imagen...' : 'Compartir como imagen'}
              </button>
            </>
          ) : (
            <>
              <Button fullWidth size="lg" onClick={handleSave} loading={upsertMutation.isPending} disabled={!leagueId}>
                {existingPrediction ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
              </Button>
              {saveError && (
                <p className="text-xs-s text-red-400 mt-2 text-center">{saveError}</p>
              )}
            </>
          )}
        </div>
      ) : existingPrediction && (
        // Show user's prediction with points for live/finished matches
        <div className="mx-4 mt-4 p-4 rounded-lg bg-accent-soft border border-accent-border">
          <p className="text-xs-s text-accent font-semibold mb-1">Tu pronóstico</p>
          <div className="flex items-center justify-between">
            <span className="text-base-s font-display font-bold text-text">
              {existingPrediction.homeScore} – {existingPrediction.awayScore}
            </span>
            {existingPrediction.points !== null && (
              <span className="text-sm-s font-bold text-accent">+{existingPrediction.points} pts</span>
            )}
          </div>
        </div>
      )}

      <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-2">Sistema de puntuación</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['Marcador exacto', '5 pts'],
            ['Ganador + diferencia', '3 pts'],
            ['Ganador correcto', '1 pt'],
            ['Empate acertado', '1 pt'],
            ['Goleador acertado', '+2 pts c/u'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>
      </div>

      {leagueId && (
        <LeaguePredictionsSection
          matchId={match.id}
          leagueId={leagueId}
        />
      )}

      <div className="h-6" />
    </div>
  );
}
