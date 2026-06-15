import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Trophy, ChevronRight, AlertCircle, Sparkles, Bell, Volume2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMatches } from '@/shared/hooks/use-matches';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { useMyPredictions } from '@/shared/hooks/use-predictions';
import { useMyFantasyTeam } from '@/shared/hooks/use-fantasy';
import { usePwaInstall } from '@/shared/hooks/use-pwa-install';
import { usePushNotifications } from '@/shared/hooks/use-push';
import { useThemeStore } from '@/theme/theme-store';
import { play } from '@/shared/lib/sounds';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/auth-store';
import type { Match, Team } from '@/shared/types/api';
import { Button } from '@/shared/components/ui/button';
import { TeamFlag } from '@/shared/components/ui/team-flag';

const WORLD_CUP_START = '2026-06-11T19:00:00Z';

function useCountdown(targetUtc: string, onEnded?: () => void) {
  const [diff, setDiff] = useState(() => new Date(targetUtc).getTime() - Date.now());
  useEffect(() => {
    // Re-seed when the target changes so the countdown picks up the new
    // kickoff (e.g. the home pointing at the next match after the previous
    // one finished).
    setDiff(new Date(targetUtc).getTime() - Date.now());
  }, [targetUtc]);

  useEffect(() => {
    // If the countdown has already ended, fire the callback once so the
    // caller can invalidate its queries and advance to the next match,
    // then exit — no point burning CPU re-rendering every second forever.
    if (diff <= 0) {
      onEnded?.();
      return;
    }

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => {
        const next = new Date(targetUtc).getTime() - Date.now();
        setDiff(next);
        if (next <= 0 && id != null) {
          clearInterval(id);
          id = null;
          // Reaching zero is also a signal that the match has (likely)
          // kicked off, so let the caller refetch the match list to find
          // the next upcoming match.
          onEnded?.();
        }
      }, 1000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Coming back to a tab that was hidden for a while: re-seed the
        // diff, re-check whether the target already passed (in which
        // case fire onEnded), and only restart the interval if there's
        // still time left.
        const fresh = new Date(targetUtc).getTime() - Date.now();
        setDiff(fresh);
        if (fresh <= 0) {
          onEnded?.();
        } else {
          start();
        }
      } else {
        stop();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // diff in deps would restart the interval every tick; we intentionally
    // only react to a fresh target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUtc]);
  const total = Math.max(0, diff);
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const mins = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  return { days, hours, mins, secs, ended: diff <= 0 };
}

function CountdownTiles({ targetUtc, onEnded }: { targetUtc: string; onEnded?: () => void }) {
  const { days, hours, mins, secs } = useCountdown(targetUtc, onEnded);
  // Each tile re-mounts its inner number on value change (via `key={value}`)
  // so framer's enter animation runs — a soft fade + slide that feels like
  // a flip clock without the gimmick.
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
          className="relative flex flex-col items-center gap-0.5 bg-card/80 backdrop-blur-sm border border-accent/30 rounded-xl px-3 py-2.5 min-w-[64px] shadow-[0_0_20px_-8px] shadow-accent/40 overflow-hidden"
        >
          <div className="relative h-[1.875rem] w-full flex items-center justify-center">
            <motion.span
              key={value}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="absolute text-3xl font-display font-black text-accent tabular-nums leading-none"
            >
              {String(value).padStart(2, '0')}
            </motion.span>
          </div>
          <span className="text-[10px] text-muted uppercase tracking-wider font-bold mt-1">{label}</span>
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
  const queryClient = useQueryClient();
  // Triggered when the countdown reaches 0 — invalidates the matches
  // query so the home auto-advances to the next match without needing the
  // user to refresh. Also kicks the standings / predictions caches because
  // a match just kicking off is correlated with points landing soon.
  const onCountdownEnded = () => {
    queryClient.invalidateQueries({ queryKey: ['matches'] });
  };

  const tournamentStarted = Date.now() > new Date(WORLD_CUP_START).getTime();

  // Before tournament: countdown to first match. Bigger, more cinematic
  // hero — radial gradient + soft trophy backdrop + animated sweep so the
  // first thing users see really feels like a "Mundial coming" moment.
  if (!tournamentStarted) {
    // Caption pulled from the actual opening match in the DB instead of
    // hard-coded. Falls back to a generic line while data is still loading
    // so we never display the wrong matchup.
    const openHome = nextMatch ? teamMap?.get(nextMatch.homeTeamId) : null;
    const openAway = nextMatch ? teamMap?.get(nextMatch.awayTeamId) : null;
    const openCaption =
      openHome && openAway
        ? `11 de junio · ${openHome.name} vs ${openAway.name}`
        : '11 de junio · Estadio Azteca';
    // Prefer the kickoff of the actual first match in the DB so the
    // countdown stays in sync if FIFA shifts the opening time. Falls back
    // to the constant only if the API hasn't returned matches yet.
    const targetUtc = nextMatch?.kickoffUtc ?? WORLD_CUP_START;
    return (
      <div className="wc26-ring relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/25 via-card to-card p-6">
        {/* Animated sheen across the hero */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none"
          aria-hidden
        />
        {/* Big trophy watermark */}
        <span className="absolute -right-4 -top-4 text-[140px] opacity-[0.05] select-none pointer-events-none" aria-hidden>
          🏆
        </span>
        <div className="relative">
          <p className="text-[11px] font-bold text-accent uppercase tracking-[0.3em] mb-2 text-center">
            Cuenta regresiva
          </p>
          <p className="text-xl font-display font-black text-text mb-4 text-center">
            Arranca el Mundial 2026 🌎
          </p>
          <CountdownTiles targetUtc={targetUtc} onEnded={onCountdownEnded} />
          <p className="mt-3 text-center text-xs text-muted">{openCaption}</p>
        </div>
      </div>
    );
  }

  // Tournament started but no scheduled match left. Distinguish "torneo en
  // curso pero entre partidos" from "torneo terminado" so the message isn't
  // misleading once the final is in the books.
  if (!nextMatch) {
    const finalDate = new Date('2026-07-19T19:00:00Z');
    const tournamentOver = Date.now() > finalDate.getTime();
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        {tournamentOver ? (
          <>
            <p className="text-base font-bold text-accent text-center">¡Terminó el Mundial! 🏆</p>
            <p className="text-xs text-muted text-center mt-1">
              Mirá la tabla final en la pestaña Global
            </p>
          </>
        ) : (
          <p className="text-base font-bold text-accent text-center">No hay próximos partidos por ahora ⚽</p>
        )}
      </div>
    );
  }

  const homeTeam = teamMap?.get(nextMatch.homeTeamId);
  const awayTeam = teamMap?.get(nextMatch.awayTeamId);
  const kickoffMs = new Date(nextMatch.kickoffUtc).getTime();
  const isLive = Date.now() > kickoffMs;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/20 via-card to-card p-5">
      {isLive ? (
        <div className="flex items-center gap-2 mb-3 justify-center">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider">En juego ahora</p>
        </div>
      ) : (
        <p className="text-[11px] font-bold text-accent uppercase tracking-[0.3em] mb-3 text-center">
          Próximo partido ⚽
        </p>
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

      {!isLive && <CountdownTiles targetUtc={nextMatch.kickoffUtc} onEnded={onCountdownEnded} />}
    </div>
  );
}

function formatKickoff(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  // Sin timeZone explícito → usa la zona del dispositivo. La app sirve a
  // usuarios desde Argentina hasta México (5h de diferencia); fijar AR
  // mostraba horarios incorrectos a todos los demás.
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const PLACEHOLDER_TEAM: Team = {
  id: 0,
  code: '???',
  flag: '🏳️',
  name: 'Cargando...',
  group: null,
  confederation: null,
};

/**
 * Banner para activar push + sonidos. Aparece si falta alguno de los dos
 * (y el usuario no lo descartó). Se descarta en localStorage por separado
 * para no insistir si el usuario rechazó explícitamente.
 *
 * Cómo funciona:
 *  - "Activar notificaciones" pide permiso al browser y suscribe push.
 *  - "Activar sonidos" tildea el flag global y dispara un chime de test
 *    para que el usuario confirme que escucha (verificación end-to-end).
 *  - Si el browser bloqueó las notifs en settings, mostramos un mensaje
 *    distinto orientando a habilitarlo manualmente.
 */
const NOTIF_SOUND_DISMISS_KEY = 'home.notifSoundBanner.dismissed';

function NotifSoundBanner() {
  const { isSubscribed, isLoading, subscribe } = usePushNotifications();
  const soundEnabled = useThemeStore((s) => s.soundEnabled);
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTIF_SOUND_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [working, setWorking] = useState(false);

  const supportsPush =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const permissionDenied =
    supportsPush && typeof Notification !== 'undefined' && Notification.permission === 'denied';

  // Nada pendiente o ya descartado → no mostrar.
  const allGood = (isSubscribed || !supportsPush) && soundEnabled;
  if (isLoading || allGood || dismissed) return null;

  const handleEnableNotifs = async () => {
    if (!supportsPush) {
      toast.error('Este navegador no soporta notificaciones push');
      return;
    }
    if (permissionDenied) {
      toast.error('Habilitalas desde la configuración del navegador');
      return;
    }
    setWorking(true);
    try {
      await subscribe();
      toast.success('¡Notificaciones activadas!');
    } catch {
      toast.error('No se pudieron activar las notificaciones');
    } finally {
      setWorking(false);
    }
  };

  const handleEnableSound = () => {
    setSoundEnabled(true);
    // Test inmediato — si el usuario no escucha, sabe en el acto que tiene
    // el volumen apagado en el sistema (verificación end-to-end del sonido).
    play('chime');
    toast.success('Sonidos activados — sonó un chime de prueba');
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(NOTIF_SOUND_DISMISS_KEY, '1');
    } catch {
      /* localStorage no disponible (private mode) — sólo afecta esta sesión */
    }
    setDismissed(true);
  };

  return (
    <div className="relative mb-4 rounded-xl bg-gradient-to-br from-accent/15 to-accent/5 border border-accent/30 p-4">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Descartar"
        className="absolute top-2 right-2 p-1 rounded-md text-muted hover:text-text hover:bg-elevated"
      >
        <X size={14} />
      </button>
      <p className="text-sm font-bold text-text mb-1">No te pierdas un solo partido</p>
      <p className="text-xs text-muted mb-3">
        Activá notificaciones para enterarte de partidos y goles, y sonidos para celebrar tus aciertos.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        {!isSubscribed && supportsPush && (
          <button
            type="button"
            onClick={handleEnableNotifs}
            disabled={working || permissionDenied}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-on text-sm font-semibold disabled:opacity-60"
          >
            <Bell size={14} />
            {permissionDenied ? 'Habilitar en el navegador' : 'Activar notificaciones'}
          </button>
        )}
        {!soundEnabled && (
          <button
            type="button"
            onClick={handleEnableSound}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-elevated border border-border text-text text-sm font-semibold hover:border-accent-border"
          >
            <Volume2 size={14} />
            Activar sonidos
          </button>
        )}
      </div>
    </div>
  );
}

export function HomePage() {
  // Refetch every 60s so the home auto-rotates to the next match when the
  // worker flips one from scheduled → live/finished, even if the user
  // never refreshes the tab.
  const { data: matchesResponse } = useMatches(
    { status: 'scheduled', limit: 6 },
    { refetchInterval: 60_000 },
  );
  const { data: teamMap } = useTeamMap();
  const { data: leaguesResponse } = useMyLeagues();
  const { data: myPredictionsData } = useMyPredictions();
  const { data: fantasyTeamData } = useMyFantasyTeam();
  const { isInstallable, isInstalled, install } = usePwaInstall();
  const username = useAuthStore((s) => s.user?.username);

  const apiMatches = matchesResponse?.data ?? [];
  const liveMatches = apiMatches.filter((m) => m.status === 'live');
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
    imageUrl: l.imageUrl ?? null,
  }));

  const predictedIds = new Set((myPredictionsData?.data ?? []).map((p) => p.matchId));
  const pendingCount = apiMatches.filter(
    (m) => m.status !== 'finished' && !predictedIds.has(m.id)
  ).length;

  const hasLeagues = apiLeagues.length > 0;
  // Fantasy CTA: hide once the user has at least the minimum (squad
  // exists). The exact "11 starters + captain" check happens inside the
  // Fantasy page; the home banner just nudges users who haven't started.
  const fantasySquadSize = fantasyTeamData?.squad?.length ?? 0;
  const needsFantasy = fantasySquadSize < 15;

  return (
    <div className="animate-fade-in px-4 pt-6 pb-4 md:px-0 md:pt-8">
      {/* Greeting */}
      <div className="mb-5">
        <p className="text-[11px] text-accent uppercase tracking-[0.3em] font-bold mb-1">Mundialito</p>
        <h1 className="text-3xl font-display font-black text-text leading-tight">
          ¡Hola, <span className="text-accent">{username ?? 'crack'}</span>! 👋
        </h1>
        <p className="text-sm text-muted mt-1">
          {needsFantasy
            ? 'Armá tu fantasy y dejá tus pronósticos antes del kickoff.'
            : '¡Todo listo para el Mundial!'}
        </p>
      </div>

      {/* PWA install banner */}
      {isInstallable && !isInstalled && (
        <button
          onClick={install}
          className="w-full flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4"
        >
          <span>📲</span>
          <span className="flex-1 text-left">Instalá Mundialito en tu celular</span>
          <span className="text-emerald-400 font-semibold">Instalar</span>
        </button>
      )}

      {/* Notificaciones + sonidos — solo si falta alguno y no se descartó */}
      <NotifSoundBanner />

      {/* Two-column layout on desktop */}
      <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 lg:grid-cols-[1fr_340px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-5">
          {/* Live matches banner — only when something's actually on. Sits
              above the countdown so it gets first attention. */}
          {liveMatches.length > 0 && (() => {
            // Si TODOS los partidos en curso están en entretiempo, atenuamos
            // la animación y el subtítulo lo refleja — evita prometer
            // "directo" cuando en realidad están parados.
            const halftimeCount = liveMatches.filter(
              (m) => m.liveStatus === 'half_time' || m.liveStatus === 'extra_time_break',
            ).length;
            const allHalftime = halftimeCount === liveMatches.length;
            const subtitle = allHalftime
              ? liveMatches.length === 1 ? 'En entretiempo' : 'Todos en entretiempo'
              : halftimeCount > 0
                ? `${halftimeCount} en entretiempo · Tocá para seguirlos`
                : 'Tocá para seguirlos en directo';
            return (
            <Link
              to="/matches?filter=live"
              className="relative overflow-hidden flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-red-500/20 via-red-500/15 to-red-500/20 border border-red-500/40 hover:border-red-500/60 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-red-500/30 flex items-center justify-center flex-shrink-0 relative">
                {!allHalftime && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-300 animate-pulse absolute" />
                    <span className="w-3.5 h-3.5 rounded-full bg-red-400/40 animate-ping" />
                  </>
                )}
                {allHalftime && <span className="w-2 h-2 rounded-full bg-red-300 absolute" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700 dark:text-red-200 uppercase tracking-wide">
                  {liveMatches.length === 1 ? 'Un partido en vivo' : `${liveMatches.length} partidos en vivo`}
                </p>
                <p className="text-xs text-red-800/70 dark:text-red-200/70">{subtitle}</p>
              </div>
              <ChevronRight size={16} className="text-red-600 dark:text-red-300 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            );
          })()}

          {/* Countdown */}
          <CountdownHero nextMatch={nextMatch} teamMap={teamMap} />

          {/* Pending predictions call-to-action */}
          {pendingCount > 0 && (
            <Link
              to="/matches"
              className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-orange-500/15 to-orange-500/5 border border-orange-500/40 hover:border-orange-400/60 hover:from-orange-500/20 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-orange-500/25 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-orange-600 dark:text-orange-300" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">
                  {/* orange-300 era invisible sobre fondo claro — variante 600 en light */}
                  Te quedan <span className="text-orange-600 dark:text-orange-300 font-bold">{pendingCount}</span> pronósticos sin hacer
                </p>
                <p className="text-xs text-muted">de tus próximos {apiMatches.length} partidos</p>
              </div>
              <ChevronRight size={16} className="text-orange-600 dark:text-orange-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          {/* Fantasy call-to-action — appears when the user hasn't yet
              picked their 15 players. The Fantasy page tab bar already
              guides them, but on the home this nudge gets users in
              proactively so they don't miss the deadline. */}
          {needsFantasy && (
            <Link
              to="/fantasy"
              className="relative overflow-hidden flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-violet-500/15 border border-violet-500/40 hover:border-violet-400/60 transition-all group"
            >
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'linear', repeatDelay: 1.5 }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
                aria-hidden
              />
              <div className="relative w-10 h-10 rounded-lg bg-violet-500/25 flex items-center justify-center flex-shrink-0">
                <Sparkles size={20} className="text-violet-700 dark:text-violet-300" />
              </div>
              <div className="relative flex-1">
                <p className="text-sm font-bold text-text">
                  {fantasySquadSize === 0
                    ? '¡Armá tu equipo Fantasy!'
                    : `Te faltan ${15 - fantasySquadSize} jugadores en tu Fantasy`}
                </p>
                {/* violet-200 era ilegible sobre fondo claro */}
                <p className="text-xs text-violet-800/80 dark:text-violet-200/80 mt-0.5">
                  Elegí 15 cracks y sumá puntos cada fecha
                </p>
              </div>
              <ChevronRight size={16} className="relative text-violet-700 dark:text-violet-300 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
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
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-accent-soft flex items-center justify-center overflow-hidden">
                      {league.imageUrl ? (
                        <img src={league.imageUrl} alt={league.name} className="w-full h-full object-cover" />
                      ) : (
                        <Trophy size={20} className="text-accent" />
                      )}
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
              <Link to="/ayuda" className="text-xs text-accent underline underline-offset-2">
                Ver guía: instalar la app e invitar amigos
              </Link>
            </div>
          )}

          {/* League actions */}
          <div className="flex items-center gap-3">
            <Link to="/leagues/join" className="flex-1">
              <Button variant="secondary" size="sm" fullWidth>
                <Search size={15} />
                Unirse a una liga
              </Button>
            </Link>
            <Link
              to="/leagues"
              className="flex-shrink-0 text-sm font-semibold text-accent hover:underline"
            >
              Ver todas
            </Link>
          </div>

          {/* Upcoming matches — mobile only (shown in right column on desktop) */}
          <div className="md:hidden">
            <UpcomingMatchesSection upcoming={upcoming} />
          </div>

          {/* Tournament shortcut — mobile only */}
          <div className="md:hidden">
            <TournamentShortcut />
          </div>
        </div>

        {/* ── RIGHT COLUMN (desktop only) ── */}
        <div className="hidden md:flex flex-col gap-5">
          <TournamentShortcut />
          <UpcomingMatchesSection upcoming={upcoming} />
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
}: {
  upcoming: UpcomingMatch[];
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
            to={`/matches/${match.id}`}
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
