import { useState, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, CheckCircle2, Share2, Users, Plus, Minus, Lock, ArrowRightLeft, Handshake, Target } from 'lucide-react';
import { toast } from 'sonner';
import { ROUND_LABELS } from '@/shared/data/mock';
import { getMaxPossiblePoints } from '@/shared/lib/scoring';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { sharePredictionCard } from '@/shared/lib/generate-prediction-card';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUpsertPrediction, useLeagueMatchPredictions, useMyPredictionForMatch, useMyPredictionByLeague } from '@/shared/hooks/use-predictions';
import { useMatchForecast } from '@/shared/hooks/use-forecasts';
import { apiClient } from '@/shared/lib/api-client';
import type { LeagueMemberPrediction } from '@/shared/hooks/use-predictions';
import { useHaptic } from '@/shared/hooks/use-haptic';
import { useMatch } from '@/shared/hooks/use-matches';
import { play } from '@/shared/lib/sounds';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { getTeamColors, hexToRgba } from '@/shared/data/team-colors';

/** Short display label for a team — hides internal 'TBD' code */
function teamDisplayCode(code: string): string {
  return code === 'TBD' ? 'Por definir' : code;
}

/** Mapping de nombres muy largos a versiones cortas para que entren en
 *  los cards del partido sin truncarse. Los demás equipos se renderizan
 *  con su nombre real. */
const SHORT_TEAM_NAME: Record<string, string> = {
  'Bosnia-Herzegovina': 'Bosnia',
  'Bosnia y Herzegovina': 'Bosnia',
  'Estados Unidos': 'EE. UU.',
  'Países Bajos': 'P. Bajos',
  'Arabia Saudita': 'Arabia',
  'República Checa': 'Chequia',
  'República Democrática del Congo': 'RD Congo',
  'Cabo Verde': 'C. Verde',
  'Costa de Marfil': 'C. Marfil',
  'Trinidad y Tobago': 'Trinidad',
  'Nueva Zelanda': 'N. Zelanda',
  'Corea del Norte': 'C. Norte',
  'Corea del Sur': 'Corea',
  'Costa Rica': 'C. Rica',
};

function shortTeamName(name: string): string {
  return SHORT_TEAM_NAME[name] ?? name;
}

function PointsPreview({ home, away }: { home: number; away: number }) {
  const { isDraw, ifExact, ifWinnerDiff, ifWinner } = getMaxPossiblePoints(home, away);
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
          <span className="text-sm-s text-muted">{isDraw ? 'Empate acertado' : 'Ganador + diferencia'}</span>
          <span className="text-sm-s font-bold text-accent">+{ifWinnerDiff} pts</span>
        </div>
        {!isDraw && (
          <div className="flex items-center justify-between">
            <span className="text-sm-s text-muted">Solo ganador correcto</span>
            <span className="text-sm-s font-bold text-accent">+{ifWinner} pt</span>
          </div>
        )}
      </div>
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
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <TeamFlag code={team.code} emoji={team.flag} size={48} />
      <span className="text-sm font-bold text-text tracking-wide">{teamDisplayCode(team.code)}</span>
      {/* Nombre completo del país — para quienes no saben qué es "ZAF" */}
      {team.name && team.code !== 'TBD' && (
        <span className="text-xs text-muted text-center leading-tight -mt-1 max-w-[110px] truncate">
          {team.name}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="w-8 h-8 rounded-lg bg-elevated border border-border flex items-center justify-center text-muted disabled:opacity-30 active:scale-95 transition-all"
        >
          <Minus size={15} strokeWidth={2.5} />
        </button>
        <div className="w-12 h-12 rounded-xl bg-accent/10 border-2 border-accent/30 flex items-center justify-center">
          <span className="text-3xl font-display font-bold text-accent tabular-nums leading-none">{value}</span>
        </div>
        <button
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-accent-on shadow-sm active:scale-95 transition-all"
        >
          <Plus size={15} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/**
 * Etiqueta corta del sub-estado live para mostrar bajo el badge "EN VIVO".
 * Devuelve null cuando no hay nada interesante que decir (in_play normal /
 * sin info / partido ya terminado) — el caller no renderea nada.
 */
function liveStatusLabel(liveStatus: string | null | undefined): string | null {
  switch (liveStatus) {
    case 'half_time':         return 'Entretiempo';
    case 'cooling_break':     return 'Descanso de hidratación';
    case 'extra_time_break':  return 'Descanso del alargue';
    case 'penalty_shootout':  return 'Penales';
    default:                  return null;
  }
}

function formatDate(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  // Usa la zona del dispositivo (LATAM cubre UTC-3 a UTC-6).
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
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
    <div className="p-4 rounded-lg bg-card border border-border">
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

/**
 * Card "Modelo sugiere" — probabilidades del Oloráculo (Poisson + Elo).
 *
 * No reemplaza al pronóstico del usuario; es info estadística adicional.
 * Si el endpoint falla (modelo no disponible), no rendereamos nada para
 * no ensuciar la UI.
 */
function ForecastPanel({ matchId, homeCode, awayCode }: { matchId: number; homeCode: string; awayCode: string }) {
  const { data, isLoading } = useMatchForecast(matchId);
  if (isLoading || !data) return null;

  const homePct = Math.round(data.homeWin * 100);
  const drawPct = Math.round(data.draw * 100);
  const awayPct = Math.round(data.awayWin * 100);
  const top = data.topScores[0];
  const topPct = Math.round((top?.prob ?? 0) * 100);

  // Tonos semánticos fijos, no atados al accent del tema. Antes usábamos
  // bg-accent para home y bg-orange-400 para away, lo que chocaba si el
  // usuario tenía el accent en 'orange' o 'gold' (las dos barras se veían
  // del mismo color). Estos 3 tonos contrastan entre sí y siguen legibles
  // tanto en modo claro como oscuro.
  return (
    <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm-s font-semibold text-text">📊 Modelo estadístico</p>
        <span className="text-[10px] font-bold text-muted bg-card border border-border px-2 py-0.5 rounded-full">
          Poisson + Elo
        </span>
      </div>
      {/* Probability bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-2 bg-elevated">
        <div className="bg-emerald-500 dark:bg-emerald-400" style={{ width: `${homePct}%` }} />
        <div className="bg-slate-400 dark:bg-slate-500" style={{ width: `${drawPct}%` }} />
        <div className="bg-sky-500 dark:bg-sky-400" style={{ width: `${awayPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs-s">
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{homeCode} {homePct}%</span>
        <span className="text-slate-500 dark:text-slate-400 font-semibold">Empate {drawPct}%</span>
        <span className="text-sky-600 dark:text-sky-400 font-bold">{awayCode} {awayPct}%</span>
      </div>
      {top && (
        <p className="text-xs-s text-muted mt-2 text-center">
          Marcador más probable: <span className="text-text font-semibold">{top.home} – {top.away}</span> ({topPct}%)
        </p>
      )}
    </div>
  );
}

/**
 * Card de "Mi pronóstico" para partidos live/finished/saved.
 * Si el usuario tiene el MISMO marcador en todas las ligas → muestra una sola
 * línea como antes. Si hay divergencia → muestra mini-listado por liga,
 * cada una con sus puntos.
 *
 * El backend ya devuelve null para ligas sin pronóstico — esas se ocultan
 * en la vista resumida y se muestran como "—" si hay divergencia.
 */
function MyPredictionPanel({
  predsByLeague,
  fallbackHome,
  fallbackAway,
  fallbackPoints,
}: {
  predsByLeague: import('@/shared/hooks/use-predictions').MyPredictionByLeagueRow[];
  fallbackHome: number | null;
  fallbackAway: number | null;
  fallbackPoints: number | null;
}) {
  const withScores = predsByLeague.filter(
    (p) => p.homeScore !== null && p.awayScore !== null,
  );

  // Detección de divergencia: ¿hay más de un marcador distinto?
  const uniqueScores = new Set(
    withScores.map((p) => `${p.homeScore}-${p.awayScore}`),
  );
  const isDivergent = uniqueScores.size > 1;

  if (!isDivergent || withScores.length <= 1) {
    const hasScore = fallbackHome != null && fallbackAway != null;
    return (
      <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-accent-soft border border-accent-border flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs-s text-accent font-semibold uppercase tracking-wider">Tu pronóstico</p>
          <p className="text-2xl font-display font-bold text-text leading-tight tabular-nums">
            {hasScore ? `${fallbackHome} – ${fallbackAway}` : '—'}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          {fallbackPoints !== null ? (
            <>
              <p className="text-xs-s text-muted">Sumaste</p>
              <p className="text-lg font-bold text-accent leading-tight">+{fallbackPoints} pts</p>
            </>
          ) : (
            <p className="text-xs-s text-muted leading-snug max-w-[100px]">Se computa al terminar el partido</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 p-4 rounded-lg bg-accent-soft border border-accent-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs-s text-accent font-semibold">Tu pronóstico por liga</p>
        <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">
          Distintos resultados
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {withScores.map((p) => (
          <div
            key={p.leagueId}
            className="flex items-center gap-3 px-2.5 py-2 rounded-md bg-card border border-border"
          >
            <span className="text-xs-s text-text font-medium flex-1 truncate">{p.leagueName}</span>
            <span className="text-sm-s font-display font-bold text-text tabular-nums">
              {p.homeScore} – {p.awayScore}
            </span>
            <span
              className={cn(
                'text-xs-s font-bold w-14 text-right tabular-nums',
                p.points !== null && p.points > 0 ? 'text-accent' : 'text-muted',
              )}
            >
              {p.points !== null ? (p.points > 0 ? `+${p.points} pts` : '+0 pts') : '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted mt-2 leading-snug">
        Cada liga puntúa por separado: editar el marcador solo afecta a la liga que elijas.
      </p>
    </div>
  );
}

export function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const matchId = id ? Number(id) : undefined;

  const { data: match, isLoading: matchLoading } = useMatch(matchId);
  const { data: teamMap, isLoading: teamsLoading } = useTeamMap();
  const { data: myLeagues } = useMyLeagues();

  // leagueId is only used for viewing league predictions — not for saving.
  // Guard against `?leagueId=abc` which would produce NaN and poison every
  // downstream query (`/predictions/match/X?leagueId=NaN` returns 400 and
  // strands the UI).
  const leagueIdParam = searchParams.get('leagueId');
  const initialLeagueId = (() => {
    if (!leagueIdParam) return null;
    const n = Number(leagueIdParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(initialLeagueId);

  // Validate selectedLeagueId against user's actual leagues
  useEffect(() => {
    const leagues = myLeagues?.data ?? [];
    if (leagues.length === 0) {
      setSelectedLeagueId(null);
      return;
    }
    const isValid = leagues.some((l) => l.id === selectedLeagueId);
    if (!isValid) {
      setSelectedLeagueId(leagues[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLeagues]);

  // Scope the user's prediction lookup to the league they're currently viewing,
  // so changing leagues swaps the on-screen score to that league's prediction.
  const { data: existingPrediction } = useMyPredictionForMatch(matchId, selectedLeagueId);
  // We also need to know whether ANY prediction exists across leagues — if not,
  // saving without a leagueId propagates to all of them.
  const { data: anyPrediction } = useMyPredictionForMatch(matchId);
  // Pronósticos por liga: alimenta la vista divergente + el selector
  // "Aplicar a" para guardar en N ligas a la vez.
  const { data: predsByLeague } = useMyPredictionByLeague(matchId);

  // Ligas donde se va a guardar en el próximo save. Default: la liga
  // seleccionada actualmente. El usuario puede agregar/sacar antes de
  // tocar Guardar.
  const [targetLeagueIds, setTargetLeagueIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (selectedLeagueId != null) {
      setTargetLeagueIds(new Set([selectedLeagueId]));
    }
  }, [selectedLeagueId]);
  const toggleTargetLeague = (id: number) => {
    setTargetLeagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const username = useAuthStore((s) => s.user?.username);
  const upsertMutation = useUpsertPrediction();
  const { vibrate } = useHaptic();

  // El lock (`isPredictionLocked`, más abajo) se calcula comparando
  // predictionLockUtc contra Date.now() en cada render. Si el usuario abre el
  // partido faltando pocos minutos para el lock y se queda en la pantalla, sin
  // esto el lock NO se activaría solo (en estado `scheduled` no hay polling).
  // Forzamos UN único re-render justo cuando se cruza el lock para que el UI se
  // bloquee solo. El backend ya rechaza con 409 igual; esto es solo UX.
  const [, forceLockTick] = useState(0);
  useEffect(() => {
    if (!match || match.status !== 'scheduled') return;
    const msToLock = new Date(match.predictionLockUtc).getTime() - Date.now();
    if (msToLock <= 0) return;
    const timer = setTimeout(() => forceLockTick((n) => n + 1), msToLock + 250);
    return () => clearTimeout(timer);
  }, [match]);

  // Initialize scores when prediction loads. Prefer the league-scoped one when
  // a league is selected; fall back to any prediction so we still show the
  // user's last value when they haven't picked a league yet.
  //
  // The `dirtyRef` guard preserves the user's typed-but-not-yet-saved score
  // across:
  //   - background refetches triggered by TanStack Query on focus/reconnect,
  //   - the brief re-render that happens when the league chip changes
  //     (existingPrediction switches), since the user usually wants to
  //     copy what they typed into another league.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (dirtyRef.current) return;
    const source = existingPrediction ?? anyPrediction;
    if (source) {
      setHomeScore(source.homeScore ?? 0);
      setAwayScore(source.awayScore ?? 0);
      setSaved(true);
    } else {
      setSaved(false);
    }
  }, [existingPrediction, anyPrediction]);

  // Aviso al usuario antes de cerrar la pestaña / recargar cuando hay
  // scores tipeados sin guardar. DEBE estar antes de los early returns
  // de loading/!match para no violar la regla de hooks ordenados.
  const hasUnsavedChanges = !saved && dirtyRef.current;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const isLoading = matchLoading || teamsLoading;

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

  const homeTeamDisplay = homeTeam ?? { id: match.homeTeamId, name: String(match.homeTeamId), code: '?', flag: '🏳️', group: null, confederation: null };
  const awayTeamDisplay = awayTeam ?? { id: match.awayTeamId, name: String(match.awayTeamId), code: '?', flag: '🏳️', group: null, confederation: null };

  // Knock-out matches with undetermined opponents can't be predicted yet
  const teamsAreTbd = homeTeamDisplay.code === 'TBD' || homeTeamDisplay.code === '?'
    || awayTeamDisplay.code === 'TBD' || awayTeamDisplay.code === '?';

  // Hide personal/auto-created leagues from the chip selector — the user
  // doesn't think of them as "leagues" and the chip would just confuse the
  // per-league override UX. Predictions still propagate there in the
  // background; it just isn't surfaced in the chips.
  const myLeagueList = (myLeagues?.data ?? []).filter((l) => !l.isPersonal);
  const hasLeague = myLeagueList.length > 0;

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
      // Tell the backend so the achievement service can credit the share.
      // Fire-and-forget — a failure here shouldn't surface to the user.
      apiClient.post('/predictions/shared').catch(() => {});
    } catch (e) {
      console.error('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  // Lock derivado de la hora — kickoff_utc - 5 min. Una vez locked, los
  // botones +/- ya no editan y mostramos un toast explicando por qué.
  const isPredictionLocked =
    match.status !== 'scheduled' ||
    new Date(match.predictionLockUtc).getTime() <= Date.now();

  const notifyLocked = () => {
    if (match.status === 'finished') {
      toast.error('El partido ya terminó — el pronóstico está bloqueado.');
    } else if (match.status === 'live') {
      toast.error('El partido está en vivo — no se puede modificar el pronóstico.');
    } else {
      toast.error('El plazo para pronosticar ya cerró.');
    }
  };

  const updateHomeScore = (v: number) => {
    if (isPredictionLocked) { notifyLocked(); return; }
    setHomeScore(v);
    setSaved(false);
    dirtyRef.current = true;
  };

  const updateAwayScore = (v: number) => {
    if (isPredictionLocked) { notifyLocked(); return; }
    setAwayScore(v);
    setSaved(false);
    dirtyRef.current = true;
  };

  const handleSave = async () => {
    // Guard against double-tap: if a save is already in flight, ignore the
    // second click instead of firing a duplicate request.
    if (upsertMutation.isPending) return;
    setSaveError(null);

    const isFirstTime = !anyPrediction;
    // Si es primer pronóstico (y no se eligió explícitamente un subset),
    // mantenemos el atajo legacy de "guardar en todas" (leagueId omitido).
    // Caso contrario iteramos por las ligas elegidas.
    const useAllShortcut =
      isFirstTime && targetLeagueIds.size <= 1 && myLeagueList.length > 1;

    const targets: (number | null)[] = useAllShortcut
      ? [null] // null = backend propaga a todas
      : Array.from(targetLeagueIds);

    if (!useAllShortcut && targets.length === 0) {
      setSaveError('Elegí al menos una liga');
      return;
    }

    try {
      for (const leagueId of targets) {
        await upsertMutation.mutateAsync({
          matchId: match.id,
          homeScore,
          awayScore,
          ...(leagueId != null ? { leagueId } : {}),
        });
      }
      setSaved(true);
      dirtyRef.current = false;
      vibrate(20);
      play('goal');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      const apiMsg = err?.response?.data?.error?.message ?? '';
      const translated =
        apiMsg.toLowerCase().includes('locked') || apiMsg.toLowerCase().includes('started')
          ? 'El pronóstico está cerrado para este partido'
          : apiMsg || 'Error al guardar pronóstico';
      setSaveError(translated);
    }
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      {/* Header */}
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

      {/* Cooling break: efecto de gotas de agua cayendo sobre la score card.
          FIFA introdujo los "hydration breaks" cuando hace mucho calor; en
          vez de un sub-badge plano, le damos una capa juguetona con drops
          azules animadas que refuerzan visualmente que el partido está
          pausado por sed. Solo se renderiza el efecto cuando la API marca
          liveStatus='cooling_break'. */}
      {/* Score card.
          Live/finished: lo tematizamos con un gradiente sutil que va del
          primary del local al primary del visitante, para que el partido
          en curso se "vista" con los colores de las dos selecciones sin
          tapar el accent global del usuario (que sigue siendo el de
          toda la app). Bordeamos con los mismos hues pero con un alpha
          más alto para que la card se sienta integrada. */}
      {(() => {
        const isThemed = match.status === 'live' || match.status === 'finished';
        const homeColors = getTeamColors(homeTeamDisplay.code);
        const awayColors = getTeamColors(awayTeamDisplay.code);
        // Alpha bajo en el fondo (~15%) para que el bg-card/text de Tailwind
        // siga ganando contraste. El borde va con ~50% para que se note
        // qué equipos están en juego sin gritar.
        const themedStyle: React.CSSProperties | undefined = isThemed
          ? {
              backgroundImage: `linear-gradient(90deg, ${hexToRgba(homeColors.primary, 0.18)} 0%, ${hexToRgba(homeColors.primary, 0.04)} 45%, ${hexToRgba(awayColors.primary, 0.04)} 55%, ${hexToRgba(awayColors.primary, 0.18)} 100%)`,
              borderColor: hexToRgba(homeColors.primary, 0.4),
              // Sombra a juego — el shadow-card de Tailwind queda debajo.
              boxShadow: `0 1px 0 ${hexToRgba(awayColors.primary, 0.3)} inset`,
            }
          : undefined;
        return (
      <div
        className="mx-4 p-4 rounded-xl bg-card border border-border shadow-card overflow-hidden relative"
        style={themedStyle}
      >
        {/* Overlay sutil que oscurece/aclara el fondo gradiente sin tapar
            el contenido — mantiene el contraste del texto/marcador tanto
            en modo claro como oscuro. */}
        {isThemed && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none bg-card/40 dark:bg-card/30 rounded-xl"
          />
        )}
        {/* Cooling-break: capa de gotas animadas */}
        {match.status === 'live' && match.liveStatus === 'cooling_break' && (
          <CoolingBreakDrops />
        )}
        <div className="relative">
        {match.status !== 'scheduled' ? (
          // Live / finished: muestra el marcador real si lo tenemos, o un
          // placeholder "—" mientras el sync no llegó todavía. Antes
          // caíamos al ScoreInput cuando homeScore era null, lo que dejaba
          // editar el pronóstico en partidos ya en vivo o terminados.
          <div className="flex flex-col items-center gap-2">
            {match.status === 'suspended' && (
              <div className="flex flex-col items-center gap-0.5 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs-s font-bold text-amber-500 uppercase tracking-wider">Suspendido</span>
                </span>
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Partido interrumpido
                </span>
              </div>
            )}
            {match.status === 'live' && (() => {
              const paused =
                match.liveStatus === 'half_time' ||
                match.liveStatus === 'extra_time_break' ||
                match.liveStatus === 'cooling_break';
              return (
                <div className="flex flex-col items-center gap-0.5 mb-1">
                  <span className="flex items-center gap-1.5">
                    {/* Heartbeat dot — concentric ping ring on top of a
                        solid dot reads "live broadcast". Apagamos el ping
                        cuando el juego está pausado para señalar que no
                        hay acción en este momento. */}
                    <span className="relative inline-flex w-2.5 h-2.5">
                      {!paused && (
                        <span className="absolute inset-0 rounded-full bg-red-400/60 animate-ping" />
                      )}
                      <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-500" />
                    </span>
                    <span className="text-xs-s font-bold text-red-400 uppercase tracking-wider">En Vivo</span>
                    {/* Minuto actual del partido — viene de FIFA con
                        stoppage incluido ("90'+3'"). Cuando está pausado
                        lo escondemos: el sub-label de abajo dice qué
                        clase de pausa es. */}
                    {!paused && match.currentMinute && (
                      <span className="ml-1 px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/40 text-[11px] font-bold text-red-700 dark:text-red-300 tabular-nums">
                        {match.currentMinute}
                      </span>
                    )}
                  </span>
                  {liveStatusLabel(match.liveStatus) && (
                    <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      {liveStatusLabel(match.liveStatus)}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="flex items-center justify-around w-full gap-4">
              <div className="flex flex-col items-center gap-1">
                <TeamFlag code={homeTeamDisplay.code} emoji={homeTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(homeTeamDisplay.code)}</span>
                <span className="text-xs text-muted text-center leading-tight max-w-[120px] line-clamp-2 break-words">{shortTeamName(homeTeamDisplay.name)}</span>
              </div>
              {/* Wrap home / away scores in their own motion.spans keyed by
                  value so each goal triggers a pop animation. Wrap the
                  whole scoreline in a flex container so the pop on either
                  side doesn't shift the layout. */}
              <span className={cn(
                'text-4xl font-display font-bold tabular-nums flex items-baseline gap-1.5',
                match.status === 'live' ? 'text-red-400' : 'text-text'
              )}>
                <motion.span
                  key={`h-${match.homeScore ?? '—'}`}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                  className="inline-block"
                >
                  {match.homeScore ?? '—'}
                </motion.span>
                <span>–</span>
                <motion.span
                  key={`a-${match.awayScore ?? '—'}`}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                  className="inline-block"
                >
                  {match.awayScore ?? '—'}
                </motion.span>
              </span>
              <div className="flex flex-col items-center gap-1">
                <TeamFlag code={awayTeamDisplay.code} emoji={awayTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(awayTeamDisplay.code)}</span>
                <span className="text-xs text-muted text-center leading-tight max-w-[120px] line-clamp-2 break-words">{shortTeamName(awayTeamDisplay.name)}</span>
              </div>
            </div>
            {match.status === 'finished' && (
              <span className="text-xs-s text-muted mt-1">Resultado final</span>
            )}
          </div>
        ) : isPredictionLocked ? (
          // Scheduled pero el lock ya pasó: bloquea la edición sin esperar
          // a que llegue el sync FIFA con el status='live'/'finished'.
          <div className="flex flex-col items-center gap-2">
            <span className="flex items-center gap-1.5 mb-1">
              <Lock size={12} className="text-muted" />
              <span className="text-xs-s font-bold text-muted uppercase tracking-wider">Pronóstico cerrado</span>
            </span>
            <div className="flex items-center justify-around w-full gap-4">
              <div className="flex flex-col items-center gap-1">
                <TeamFlag code={homeTeamDisplay.code} emoji={homeTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(homeTeamDisplay.code)}</span>
                <span className="text-xs text-muted text-center leading-tight max-w-[120px] line-clamp-2 break-words">{shortTeamName(homeTeamDisplay.name)}</span>
              </div>
              <span className="text-4xl font-display font-bold text-muted tabular-nums">— – —</span>
              <div className="flex flex-col items-center gap-1">
                <TeamFlag code={awayTeamDisplay.code} emoji={awayTeamDisplay.flag} size={48} />
                <span className="text-base-s font-bold text-text">{teamDisplayCode(awayTeamDisplay.code)}</span>
                <span className="text-xs text-muted text-center leading-tight max-w-[120px] line-clamp-2 break-words">{shortTeamName(awayTeamDisplay.name)}</span>
              </div>
            </div>
          </div>
        ) : (
          // Scheduled + abierto: inputs editables.
          <div className="flex items-center justify-between gap-1">
            <ScoreInput value={homeScore} onChange={updateHomeScore} team={homeTeamDisplay} />
            <span className="text-sm font-bold text-muted/50 flex-shrink-0 pb-4">vs</span>
            <ScoreInput value={awayScore} onChange={updateAwayScore} team={awayTeamDisplay} />
          </div>
        )}
        </div>
      </div>
        );
      })()}

      {/* Match info */}
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

      {/* Live/finished events — goles, asistencias, tarjetas */}
      <MatchEvents
        events={match.events}
        timeline={match.timeline}
        homeTeamCode={homeTeamDisplay.code}
        status={match.status}
      />

      {/* Points preview */}
      {match.status === 'scheduled' && !teamsAreTbd && (
        <PointsPreview home={homeScore} away={awayScore} />
      )}

      {/* Modelo sugiere — probabilidades del Oloráculo (Poisson + Elo).
          Solo en scheduled, con equipos reales. No reemplaza al pronóstico
          del usuario; sirve de referencia estadística. */}
      {match.status === 'scheduled' && !teamsAreTbd && matchId !== undefined && (
        <ForecastPanel
          matchId={matchId}
          homeCode={homeTeamDisplay.code}
          awayCode={awayTeamDisplay.code}
        />
      )}

      {/* TBD block — teams not yet determined */}
      {match.status === 'scheduled' && teamsAreTbd && (
        <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🔒</span>
          <div>
            <p className="text-sm-s font-semibold text-text">Pronóstico no disponible aún</p>
            <p className="text-xs-s text-muted mt-0.5">
              Los equipos de este partido se definen en la fase de grupos. Podrás pronosticar cuando se conozcan los clasificados.
            </p>
          </div>
        </div>
      )}

      {/* Save / saved state */}
      {match.status === 'scheduled' && !teamsAreTbd ? (
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
              {/* Multi-liga selector — solo si está en >1 ligas. Default
                  arranca con la liga activa tildada, así editar un marcador
                  no contamina otras ligas. */}
              {myLeagueList.length > 1 && (
                <div className="mb-3 p-3 rounded-lg bg-elevated border border-border">
                  {!anyPrediction ? (
                    <p className="text-xs-s text-muted mb-2 text-center">
                      📣 Tu primer pronóstico se guarda en <span className="text-accent font-semibold">todas tus ligas</span>
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs-s font-semibold text-text">Aplicar a</p>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetLeagueIds((prev) =>
                              prev.size === myLeagueList.length
                                ? new Set(selectedLeagueId != null ? [selectedLeagueId] : [])
                                : new Set(myLeagueList.map((l) => l.id)),
                            );
                          }}
                          className="text-xs-s text-accent font-semibold"
                        >
                          {targetLeagueIds.size === myLeagueList.length ? 'Solo esta liga' : 'Todas las ligas'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {myLeagueList.map((league) => {
                          const checked = targetLeagueIds.has(league.id);
                          return (
                            <button
                              key={league.id}
                              type="button"
                              onClick={() => toggleTargetLeague(league.id)}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs-s font-semibold border transition-colors',
                                checked
                                  ? 'bg-accent text-accent-on border-accent'
                                  : 'bg-card border-border text-muted hover:text-text',
                              )}
                            >
                              {checked && <CheckCircle2 size={12} />}
                              {league.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Aviso visible cuando hay cambios sin guardar — el bug
                  clásico es "tipeé el marcador y me olvidé de apretar
                  Guardar". El badge pulsante + el ring en el botón
                  hacen ese caso imposible de pasar por alto. */}
              {hasUnsavedChanges && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/40">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
                  <p className="text-xs-s text-orange-700 dark:text-orange-300 font-semibold">
                    Cambios sin guardar — tocá el botón abajo
                  </p>
                </div>
              )}
              <Button
                fullWidth
                size="lg"
                onClick={handleSave}
                loading={upsertMutation.isPending}
                disabled={
                  upsertMutation.isPending ||
                  (!!anyPrediction && myLeagueList.length > 1 && targetLeagueIds.size === 0)
                }
                className={cn(hasUnsavedChanges && 'ring-2 ring-orange-400/60 animate-pulse')}
              >
                {!!anyPrediction && targetLeagueIds.size > 1
                  ? `Guardar en ${targetLeagueIds.size === myLeagueList.length ? 'todas las ligas' : `${targetLeagueIds.size} ligas`}`
                  : existingPrediction
                    ? 'Actualizar pronóstico'
                    : 'Guardar pronóstico'}
              </Button>
              {saveError && (
                <p className="text-xs-s text-red-400 mt-2 text-center">{saveError}</p>
              )}
            </>
          )}

          {/* Join league nudge — shown after saving if user has no league */}
          {!hasLeague && (
            <div className="mt-3 p-3 rounded-lg bg-elevated border border-border flex items-center gap-3">
              <Users size={16} className="text-muted flex-shrink-0" />
              <p className="text-xs-s text-muted flex-1">
                Unite a una liga para competir con amigos
              </p>
              <div className="flex gap-2">
                <Link
                  to="/leagues/create"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-accent-on text-xs-s font-semibold"
                >
                  <Plus size={12} />
                  Crear
                </Link>
                <Link
                  to="/leagues/join"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-text text-xs-s font-semibold"
                >
                  Unirse
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : existingPrediction && (
        <MyPredictionPanel
          predsByLeague={predsByLeague ?? []}
          fallbackHome={existingPrediction.homeScore}
          fallbackAway={existingPrediction.awayScore}
          fallbackPoints={existingPrediction.points}
        />
      )}

      {/* League picker + league-mates' predictions — surface this prominently
          right after the save area so members know where to find each other's
          predictions and how the visibility setting affects them. */}
      {hasLeague && (
        <div className="mx-4 mt-4">
          <p className="text-xs-s text-muted mb-2">Pronósticos de la liga</p>
          {myLeagueList.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mb-2">
              {myLeagueList.map((league) => (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => setSelectedLeagueId(league.id)}
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
          )}
          {selectedLeagueId && (
            <LeaguePredictionsSection
              matchId={match.id}
              leagueId={selectedLeagueId}
            />
          )}
        </div>
      )}

      {/* Scoring reference */}
      <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-2">Sistema de puntuación</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['Marcador exacto', '5 pts'],
            ['Ganador + diferencia', '3 pts'],
            ['Empate acertado', '3 pts'],
            ['Ganador correcto', '1 pt'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}

// ─── Live events block ────────────────────────────────────────────────────────

import type { MatchEvent, MatchTimelineEvent } from '@/shared/types/api';

/** Formatea el minuto sumando 45 cuando el evento es del 2T y el feed
 *  emite el minuto absoluto crudo. FIFA ya da minutos en escala 0-90+,
 *  así que solo etiquetamos con el sufijo "'" estándar.
 *  ET1/ET2/penales se muestran con prefijo claro. */
function formatMinute(minute: number | null, period: number | null): string {
  if (minute == null) return '?';
  if (period === 3 || period === 4) return `ET ${minute}'`;
  if (period === 5) return 'Penales';
  return `${minute}'`;
}

/**
 * Capa de gotas de agua cayendo, para el sub-estado "cooling_break".
 * No es interactiva — `pointer-events-none` y `aria-hidden` para que no
 * moleste al lector ni a la tab key. Las posiciones son determinísticas
 * (no aleatorias) para evitar re-cálculo en cada render y para que cada
 * gota tenga su delay propio que entrelaza el shower.
 */
function CoolingBreakDrops() {
  const drops = [
    { left: 8,  delay: 0.0, dur: 1.6, size: 5 },
    { left: 22, delay: 0.4, dur: 2.0, size: 6 },
    { left: 38, delay: 0.9, dur: 1.8, size: 5 },
    { left: 54, delay: 0.2, dur: 2.2, size: 7 },
    { left: 70, delay: 1.1, dur: 1.7, size: 5 },
    { left: 88, delay: 0.6, dur: 2.0, size: 6 },
    { left: 14, delay: 1.4, dur: 1.9, size: 4 },
    { left: 60, delay: 1.7, dur: 2.1, size: 5 },
    { left: 78, delay: 0.0, dur: 1.6, size: 4 },
  ];
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {/* Tinte azulado muy suave que envuelve toda la card */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/8 via-cyan-400/4 to-sky-500/12" />
      {drops.map((d, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-sky-300/70 dark:bg-sky-300/80 shadow-[0_0_4px_rgba(14,165,233,0.6)]"
          style={{ left: `${d.left}%`, width: d.size, height: d.size * 1.4, top: '-12%' }}
          animate={{ top: ['-12%', '110%'], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: 'easeIn', times: [0, 0.1, 0.85, 1] }}
        />
      ))}
    </div>
  );
}

/**
 * Etiquetas + íconos para cada tipo de evento. Los emojis nativos (🟨🟥🅰️🔼🔽)
 * se veían inconsistentes entre OS (Apple vs Windows vs Android) y los de
 * sustitución/asistencia quedaban especialmente toscos. Reemplazamos por:
 *  - cards SVG con color exacto para amarilla/roja (estilo árbitro real)
 *  - íconos lucide para sub_in/sub_out y assist (vectoriales = nítidos)
 *  - mantenemos ⚽ para goal/own_goal porque el emoji de pelota sí queda bien
 *    cross-platform y es universalmente reconocible.
 */
type EventDisplay = {
  label: string;
  /** Render compacto del ícono. size en px (16 / 20 / 24). */
  render: (props: { size?: number; className?: string }) => React.ReactNode;
};

const RefereeCard = ({ color, className }: { color: 'yellow' | 'red'; className?: string }) => (
  <span
    className={cn(
      'inline-block rounded-[1.5px] shadow-sm align-middle',
      color === 'yellow' ? 'bg-yellow-400 border border-yellow-600/30' : 'bg-red-500 border border-red-800/30',
      className,
    )}
    style={{ width: '0.65em', height: '0.95em' }}
    aria-hidden
  />
);

const EVENT_LABEL: Record<MatchTimelineEvent['type'], EventDisplay> = {
  goal:     {
    label: 'Gol',
    render: ({ size = 14 }) => <span style={{ fontSize: size }} aria-label="Gol">⚽</span>,
  },
  own_goal: {
    label: 'Gol en contra',
    render: ({ size = 14 }) => (
      <span className="relative inline-flex items-center justify-center" aria-label="Gol en contra">
        <span style={{ fontSize: size }}>⚽</span>
        <span className="absolute -bottom-0.5 -right-0.5 text-[7px] leading-none font-black text-red-500">✕</span>
      </span>
    ),
  },
  assist:   {
    label: 'Asistencia',
    render: ({ size = 14 }) => <Handshake size={size} className="text-blue-500" aria-label="Asistencia" />,
  },
  yellow:   {
    label: 'Amarilla',
    render: ({ className }) => <RefereeCard color="yellow" className={className} />,
  },
  red:      {
    label: 'Roja',
    render: ({ className }) => <RefereeCard color="red" className={className} />,
  },
  sub_in:   {
    label: 'Entra',
    render: ({ size = 12 }) => <ArrowRightLeft size={size} className="text-emerald-500 rotate-90" aria-label="Entra" />,
  },
  sub_out:  {
    label: 'Sale',
    render: ({ size = 12 }) => <ArrowRightLeft size={size} className="text-rose-500 rotate-90 scale-y-[-1]" aria-label="Sale" />,
  },
  // 'penalty_awarded': el árbitro cobró el penal (en juego o tanda). Diana
  // ámbar = el punto del penal, momento previo al remate.
  penalty_awarded: {
    label: 'Penal cobrado',
    render: ({ size = 14 }) => <Target size={size} className="text-amber-500" aria-label="Penal cobrado" />,
  },
  // Tanda de penales — los tres tipos son exclusivos de period=5 (shootout).
  // 'penalty_goal': penal convertido. Usamos ⚽ con badge "P" para diferenciarlo
  // visualmente de un gol en juego sin confundir al usuario.
  penalty_goal: {
    label: 'Penal convertido',
    render: ({ size = 14 }) => (
      <span className="relative inline-flex items-center justify-center" aria-label="Penal convertido">
        <span style={{ fontSize: size }}>⚽</span>
        <span className="absolute -bottom-0.5 -right-0.5 text-[6px] leading-none font-black text-emerald-400">✓</span>
      </span>
    ),
  },
  // 'penalty_miss': pateó y erró (afuera o al poste). X roja sobre silueta de pelota.
  penalty_miss: {
    label: 'Penal errado',
    render: ({ size = 14 }) => (
      <span className="relative inline-flex items-center justify-center" aria-label="Penal errado">
        <span style={{ fontSize: size }} className="opacity-40">⚽</span>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none font-black text-red-500">✕</span>
      </span>
    ),
  },
  // 'penalty_save': atajado por el arquero. Guante (mano) para representar la atajada.
  penalty_save: {
    label: 'Penal atajado',
    render: ({ size = 14 }) => (
      <span className="relative inline-flex items-center justify-center" aria-label="Penal atajado">
        <span style={{ fontSize: size }} className="opacity-40">⚽</span>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none font-black text-sky-500">🧤</span>
      </span>
    ),
  },
};

const MatchEvents = memo(function MatchEvents({
  events,
  timeline,
  homeTeamCode,
  status,
}: {
  events?: MatchEvent[];
  timeline?: MatchTimelineEvent[];
  homeTeamCode: string;
  status: 'scheduled' | 'live' | 'finished' | 'suspended';
}) {
  if (status === 'scheduled') return null;

  const hasTimeline = timeline && timeline.length > 0;
  const hasAggregated = events && events.length > 0;

  // Match terminado pero todavía sin nada cargado — placeholder claro.
  if (!hasTimeline && !hasAggregated) {
    if (status === 'live') return null;
    return (
      <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-1">Resumen del partido</p>
        <p className="text-xs-s text-muted leading-snug">
          Los goles y tarjetas se cargan automáticamente cuando el feed
          oficial los publica. A veces tarda unos minutos tras el final.
        </p>
      </div>
    );
  }

  // Timeline minuto-a-minuto al estilo FIFA: una sola columna con el
  // minuto centrado y los eventos pivoteando izquierda/derecha según el
  // equipo. Eventos en orden descendente (lo más reciente arriba) +
  // marcadores de fin de período intercalados.
  if (hasTimeline) {
    // Ordenamos descendente: período mayor + minuto mayor arriba. Es el
    // orden natural para alguien que abre el partido en vivo.
    const sorted = [...timeline].sort((a, b) => {
      const pa = a.period ?? 99, pb = b.period ?? 99;
      if (pa !== pb) return pb - pa;
      const ma = a.minute ?? 999, mb = b.minute ?? 999;
      return mb - ma;
    });

    // Marcadores de transición de período: "Entretiempo" entre el último
    // evento del 1T y el primero del 2T, etc. Construimos la lista
    // intercalando eventos + marcadores.
    type Row =
      | { kind: 'event'; ev: MatchTimelineEvent }
      | { kind: 'marker'; id: string; label: string };

    const rows: Row[] = [];
    let lastPeriod: number | null = null;
    for (const ev of sorted) {
      if (lastPeriod != null && ev.period != null && ev.period !== lastPeriod) {
        // Transición de período → marcador.
        const label =
          lastPeriod === 2 ? 'Entretiempo'
          : lastPeriod === 3 ? 'Fin del 1° tiempo extra'
          : lastPeriod === 4 ? 'Fin del 2° tiempo extra'
          : 'Inicio';
        rows.push({ kind: 'marker', id: `m-${ev.id}`, label });
      }
      rows.push({ kind: 'event', ev });
      lastPeriod = ev.period;
    }
    rows.push({ kind: 'marker', id: 'kick-off', label: 'Inicio del juego' });

    const isSub = (type: MatchTimelineEvent['type']) => type === 'sub_in' || type === 'sub_out';

    // Para gol en contra el `teamCode` del evento es el equipo del autor
    // del gol (quien la mete en su propio arco). Pero quien suma al
    // marcador es el equipo CONTRARIO, así que el evento se debe mostrar
    // del lado opuesto en el timeline (donde está la celebración real).
    const displaySideIsHome = (ev: MatchTimelineEvent): boolean => {
      const playersTeamIsHome = ev.teamCode === homeTeamCode;
      return ev.type === 'own_goal' ? !playersTeamIsHome : playersTeamIsHome;
    };

    const EventSide = ({ ev, highlight = false }: { ev: MatchTimelineEvent; highlight?: boolean }) => {
      const cfg = EVENT_LABEL[ev.type];
      const isHome = displaySideIsHome(ev);
      const sub = isSub(ev.type);
      // Fresh goals get a brief celebration on the ball: scale-up + rotate.
      // Run it once on mount (initial→animate); not infinite, otherwise it
      // turns into a distraction while the user reads the rest of the list.
      const ballMotion = highlight
        ? {
            initial: { scale: 0.4, rotate: -180 },
            animate: { scale: 1.15, rotate: 0 },
            transition: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] },
          }
        : {};
      return (
        <div
          className={cn(
            'flex items-center gap-1.5 min-w-0',
            isHome ? 'flex-row' : 'flex-row-reverse',
            sub ? 'text-xs-s text-muted' : 'text-sm-s',
          )}
        >
          <motion.span
            {...ballMotion}
            className={cn('flex-shrink-0 leading-none inline-flex items-center justify-center', sub ? 'text-xs' : 'text-sm')}
            aria-label={cfg.label}
          >
            {cfg.render({ size: sub ? 11 : 14 })}
          </motion.span>
          <span className={cn('truncate', sub ? 'text-muted' : 'font-medium text-text', highlight && 'text-accent')}>
            {ev.type === 'own_goal' ? (
              <>
                <span className="text-[10px] text-red-400 font-bold mr-1">EN CONTRA de</span>
                <span className="text-muted">{ev.playerName}</span>
              </>
            ) : (
              ev.playerName
            )}
          </span>
        </div>
      );
    };

    // While the match is live, the freshest item (rows[0] event, since
    // we sort desc) gets a ring + soft pulse so a returning viewer can
    // immediately spot what's new. Goals also get a brief icon wiggle.
    const freshEventId =
      status === 'live'
        ? sorted.find((e) => !isSub(e.type))?.id ?? sorted[0]?.id ?? null
        : null;

    return (
      <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-xs-s text-muted font-bold uppercase tracking-wider mb-3">
          Minuto a minuto
        </p>
        <div className="flex flex-col">
          {rows.map((row, i) => {
            if (row.kind === 'marker') {
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.2 }}
                  className="flex items-center gap-2 py-2 text-[10px] font-bold text-accent uppercase tracking-wider"
                >
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-accent/30 to-accent/40" />
                  <span>{row.label}</span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-accent/30 to-accent/40" />
                </motion.div>
              );
            }
            const ev = row.ev;
            const isHome = displaySideIsHome(ev);
            const sub = isSub(ev.type);
            const isFresh = ev.id === freshEventId;
            const isGoal = ev.type === 'goal' || ev.type === 'own_goal' || ev.type === 'penalty_goal';
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, x: isHome ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.25, ease: 'easeOut' }}
                className={cn(
                  'grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/40 last:border-b-0 rounded-md transition-colors',
                  sub ? 'py-1' : 'py-1.5',
                  isFresh && !sub && 'bg-accent/5 ring-1 ring-accent/30 border-transparent',
                )}
              >
                {/* Local */}
                <div className="min-w-0">{isHome && <EventSide ev={ev} highlight={isFresh && isGoal} />}</div>
                {/* Minuto */}
                <span className={cn('font-bold tabular-nums px-2 flex-shrink-0', sub ? 'text-[10px] text-muted' : 'text-xs-s', isFresh && !sub ? 'text-accent' : 'text-muted')}>
                  {formatMinute(ev.minute, ev.period)}
                </span>
                {/* Visitante */}
                <div className="min-w-0 text-right">{!isHome && <EventSide ev={ev} highlight={isFresh && isGoal} />}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback (eventos agregados sin minuto, p.ej. partidos sincronizados
  // antes de que existiera la tabla match_events).
  const items: { kind: 'goal' | 'yellow' | 'red'; player: string; team: string; count?: number }[] = [];
  for (const e of events!) {
    if (e.goals > 0) items.push({ kind: 'goal', player: e.playerName, team: e.teamCode, count: e.goals });
    if (e.yellowCards > 0) items.push({ kind: 'yellow', player: e.playerName, team: e.teamCode, count: e.yellowCards });
    if (e.redCard) items.push({ kind: 'red', player: e.playerName, team: e.teamCode });
  }
  if (items.length === 0) return null;

  const home = items.filter((i) => i.team === homeTeamCode);
  const away = items.filter((i) => i.team !== homeTeamCode);

  const Row = ({ item }: { item: typeof items[number] }) => {
    const icon = item.kind === 'goal' ? '⚽' : item.kind === 'yellow' ? '🟨' : '🟥';
    return (
      <div className="flex items-center gap-2 text-sm-s text-text">
        <span>{icon}</span>
        <span className="font-medium">{item.player}</span>
        {item.count && item.count > 1 && <span className="text-muted">×{item.count}</span>}
      </div>
    );
  };

  return (
    <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
      <p className="text-sm-s font-semibold text-text mb-3">
        {status === 'live' ? 'Sucesos del partido (en vivo)' : 'Resumen del partido'}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs-s text-muted font-bold uppercase">Local</p>
          {home.length === 0 ? <span className="text-xs-s text-muted">—</span> : home.map((i, idx) => <Row key={idx} item={i} />)}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs-s text-muted font-bold uppercase">Visitante</p>
          {away.length === 0 ? <span className="text-xs-s text-muted">—</span> : away.map((i, idx) => <Row key={idx} item={i} />)}
        </div>
      </div>
    </div>
  );
});
