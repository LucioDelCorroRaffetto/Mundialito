import { useState, useEffect, memo } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, Users, Trophy, ChevronRight, ChevronDown, Pencil, X, Check, Swords,
  Medal, Award, Goal, Shield, Sparkles, TrendingDown, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { ShareSheet } from '@/shared/components/share-sheet';
import { SkeletonList } from '@/shared/components/skeleton';
import { LeagueBannerPicker } from '@/shared/components/ui/image-picker';
import { LeagueHistoryChart } from '@/shared/components/league-history-chart';
import {
  useLeague,
  useLeagueStandings,
  useLeagueStandingsHistory,
  useLeaveLeague,
  useUpdateLeague,
  type StandingRow,
} from '@/shared/hooks/use-leagues';
import { useLeagueTournamentPicks, type LeagueTournamentPick } from '@/shared/hooks/use-tournament-predictions';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { useAuthStore } from '@/shared/stores/auth-store';
import { podiumStyle } from '@/shared/components/logros-gate-banner';
import { staggerContainer, staggerItem, useMotionPrefs, springSnappy, useCountUp, slideUpVariants } from '@/shared/lib/motion';

const TABS = ['Tabla', 'Info'] as const;
type Tab = (typeof TABS)[number];

/**
 * League description card. Read-only for members; admins get an inline
 * editor with a 1000-char limit. Intentionally free-form so leagues can use
 * it for prize text, house rules, in-jokes — anything.
 */
function LeagueDescriptionBlock({
  description,
  canEdit,
  saving,
  onSave,
}: {
  leagueId: number;
  description: string | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? '');

  useEffect(() => {
    if (!editing) setDraft(description ?? '');
  }, [description, editing]);

  // Hide entirely when there's nothing to show and the viewer can't edit.
  if (!description && !canEdit) return null;

  return (
    <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm-s font-semibold text-text">Descripción</p>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs-s text-accent font-semibold"
          >
            <Pencil size={12} />
            {description ? 'Editar' : 'Agregar'}
          </button>
        )}
      </div>

      {!editing && (
        description ? (
          <p className="text-sm-s text-text whitespace-pre-wrap break-words">{description}</p>
        ) : (
          <p className="text-xs-s text-muted italic">
            Sin descripción. Agregá una con reglas, premio, o lo que quieras compartir con los miembros.
          </p>
        )
      )}

      {editing && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            placeholder="Reglas internas, premio para el ganador, lo que quieras..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-elevated border border-border text-sm-s text-text placeholder:text-muted outline-none focus:border-accent resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs-s text-muted">{draft.length}/1000</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-elevated border border-border text-xs-s font-semibold text-muted"
              >
                <X size={12} />
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const next = draft.trim() ? draft.trim() : null;
                  await onSave(next);
                  setEditing(false);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-accent-on text-xs-s font-semibold disabled:opacity-50"
              >
                <Check size={12} />
                Guardar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const Row = memo(function Row({
  row,
  isMe,
  reduced,
  myUserId,
}: {
  row: StandingRow;
  isMe: boolean;
  reduced: boolean;
  myUserId: number | undefined;
}) {
  const navigate = useNavigate();
  const initials = row.username.slice(0, 1).toUpperCase();
  // Podium spots get medal styling. The "me" highlight wins when it overlaps —
  // people care more about finding themselves than seeing a medal anyway.
  const podium = podiumStyle(row.position);
  const points = useCountUp(row.points);

  return (
    <motion.div
      layout={!reduced}
      transition={springSnappy}
      variants={staggerItem(reduced)}
      className={cn(
        'flex items-center gap-3 px-4 border-b last:border-0 transition-colors',
        isMe
          ? 'bg-accent-soft hover:bg-accent-soft/80 border-border'
          : podium
            ? `${podium.rowBg} ${podium.rowBorder}`
            : 'border-border hover:bg-elevated',
      )}
    >
      {/* Link y botón de comparar van como HERMANOS, no anidados: un <button>
          dentro de un <a> es HTML inválido y en mobile a veces el tap del
          botón también dispara la navegación del Link padre (bug reportado
          en prod — "a veces me redirecciona al perfil"). */}
      <Link
        to={`/u/${row.userId}`}
        aria-current={isMe ? 'true' : undefined}
        className="flex items-center gap-3 flex-1 min-w-0 py-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {podium ? (
          <span
            className={cn(
              'w-7 h-7 rounded-full border flex items-center justify-center text-xs-s font-bold flex-shrink-0',
              podium.rankPill,
            )}
            title={`Puesto ${row.position}`}
          >
            <span aria-hidden>{podium.medal}</span>
          </span>
        ) : (
          <span className={cn('w-6 text-center text-sm-s font-bold', isMe ? 'text-accent' : 'text-muted')}>
            {row.position}
          </span>
        )}
        <div
          className={cn(
            'w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 overflow-hidden',
            podium && `ring-2 ring-offset-0 ${podium.rowBorder.replace('border-', 'ring-')}`,
          )}
        >
          {row.avatarUrl ? (
            <img src={row.avatarUrl} alt={row.username} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm-s font-bold text-text">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm-s font-semibold truncate',
              isMe ? 'text-accent' : podium ? podium.text : 'text-text',
            )}
          >
            {row.username} {isMe && '(vos)'}
          </p>
          <p className="text-xs-s text-muted">{row.matchesPlayed} jugados</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-base-s font-bold tabular-nums',
              isMe ? 'text-accent' : podium ? podium.text : 'text-text',
            )}
          >
            {points}
          </span>
          <ChevronRight size={16} className="text-muted flex-shrink-0" />
        </div>
      </Link>
      {!isMe && myUserId != null && (
        <button
          type="button"
          aria-label={`Comparar con ${row.username}`}
          onClick={() => navigate(`/h2h/${myUserId}/${row.userId}`)}
          className="flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-accent hover:bg-accent-soft transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Swords size={14} />
        </button>
      )}
    </motion.div>
  );
});

/** Sección colapsable con la evolución de puntos acumulados por día. Solo se
 *  renderiza si hay al menos 2 días con datos (si no, el gráfico no dice nada). */
function LeagueHistorySection({
  leagueId,
  currentUserId,
}: {
  leagueId: number | undefined;
  currentUserId: number | undefined;
}) {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const { data: history } = useLeagueStandingsHistory(leagueId);

  if (!history || history.days.length < 2) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm-s font-semibold text-text"
      >
        Evolución
        <ChevronDown size={16} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={slideUpVariants(reduced, 10)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="px-4 pb-4"
          >
            <LeagueHistoryChart history={history} currentUserId={currentUserId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Config visual de cada categoría de Copa: ícono, color y de dónde sale el valor. */
const COPA_CATEGORIES: Array<{
  key: keyof Pick<
    LeagueTournamentPick,
    'championTeamId' | 'runnerUpTeamId' | 'thirdPlaceTeamId' | 'revelationTeamId' | 'surpriseEliminatedTeamId' | 'bestDefenseTeamId'
  > | 'topScorerName';
  label: string;
  icon: LucideIcon;
  iconClass: string;
  chipClass: string;
}> = [
  { key: 'championTeamId', label: 'Campeón', icon: Trophy, iconClass: 'text-amber-500', chipClass: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'runnerUpTeamId', label: 'Finalista', icon: Medal, iconClass: 'text-slate-400', chipClass: 'bg-slate-400/10 border-slate-400/20' },
  { key: 'thirdPlaceTeamId', label: 'Tercer puesto', icon: Award, iconClass: 'text-orange-500', chipClass: 'bg-orange-500/10 border-orange-500/20' },
  { key: 'topScorerName', label: 'Goleador', icon: Goal, iconClass: 'text-emerald-500', chipClass: 'bg-emerald-500/10 border-emerald-500/20' },
  { key: 'revelationTeamId', label: 'Ceniciento', icon: Sparkles, iconClass: 'text-violet-400', chipClass: 'bg-violet-400/10 border-violet-400/20' },
  { key: 'surpriseEliminatedTeamId', label: 'Decepción', icon: TrendingDown, iconClass: 'text-red-400', chipClass: 'bg-red-400/10 border-red-400/20' },
  { key: 'bestDefenseTeamId', label: 'Valla menos vencida', icon: Shield, iconClass: 'text-sky-500', chipClass: 'bg-sky-500/10 border-sky-500/20' },
];

/** Un pick como pill con ícono de categoría + bandera/nombre; '—' si no eligió. */
function PickChip({
  cat,
  teamId,
  text,
  teamMap,
}: {
  cat: (typeof COPA_CATEGORIES)[number];
  teamId?: number | null;
  text?: string | null;
  teamMap: ReturnType<typeof useTeamMap>['data'];
}) {
  const team = teamId != null ? teamMap?.get(teamId) : undefined;
  const Icon = cat.icon;
  const filled = !!team || !!text;
  return (
    <span
      title={cat.label}
      className={cn(
        'inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border text-xs-s whitespace-nowrap',
        filled ? cat.chipClass : 'bg-elevated border-border',
      )}
    >
      <Icon size={12} className={filled ? cat.iconClass : 'text-muted/60'} aria-label={cat.label} />
      {team ? (
        <span className="inline-flex items-center gap-1 font-semibold text-text">
          <TeamFlag code={team.code} emoji={team.flag} size={16} />
          {team.code}
        </span>
      ) : text ? (
        <span className="font-semibold text-text truncate max-w-[8rem]">{text}</span>
      ) : (
        <span className="text-muted">sin elegir</span>
      )}
    </span>
  );
}

/**
 * Picks de Copa (campeón, goleador, sorpresa…) de cada miembro de la liga.
 * Las predicciones de Copa son POR LIGA, por eso viven acá y no en el perfil.
 * El server solo entrega los picks ajenos después del lock (anti-copia), y
 * `points` llega con los puntos de Copa una vez resuelta la final.
 */
function LeagueCopaPicksSection({
  leagueId,
  currentUserId,
}: {
  leagueId: number | undefined;
  currentUserId: number | undefined;
}) {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const { data } = useLeagueTournamentPicks(leagueId);
  const { data: teamMap } = useTeamMap();

  const picks = data?.data ?? [];
  if (picks.length === 0) return null;

  const anyScored = picks.some((p) => p.points != null);
  // Orden: el propio user primero (para verse sin scrollear), después el
  // orden que ya vino del server (puntos desc cuando hay, alfabético si no).
  const sortedPicks = [...picks].sort((a, b) =>
    a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : 0,
  );

  const row = (p: LeagueTournamentPick) => {
    const isMe = p.userId === currentUserId;
    return (
      <div
        key={p.userId}
        className={cn(
          'p-3 rounded-xl border',
          isMe ? 'bg-accent-soft/50 border-accent-border' : 'bg-card border-border',
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {p.avatarUrl ? (
            <img src={p.avatarUrl} alt="" loading="lazy" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-elevated border border-border flex items-center justify-center text-[10px] font-bold text-muted flex-shrink-0">
              {p.username.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="text-sm-s font-semibold text-text truncate">
            {p.username}
            {isMe && <span className="text-muted font-normal"> (vos)</span>}
          </span>
          {anyScored && (
            <span className="ml-auto flex-shrink-0 text-sm-s font-bold text-accent tabular-nums">
              {p.points != null ? `+${p.points} pts` : '—'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COPA_CATEGORIES.map((cat) => (
            <PickChip
              key={cat.key}
              cat={cat}
              teamId={cat.key === 'topScorerName' ? undefined : (p[cat.key] as number | null)}
              text={cat.key === 'topScorerName' ? p.topScorerName : undefined}
              teamMap={teamMap}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm-s font-semibold text-text"
      >
        <Trophy size={15} className="text-accent flex-shrink-0" />
        <span className="flex-1 text-left">Picks de Copa</span>
        {anyScored && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
            Puntuado
          </span>
        )}
        <ChevronDown size={16} className={cn('text-muted transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={slideUpVariants(reduced, 10)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="px-4 pb-4"
          >
            <p className="pb-3 text-xs-s text-muted leading-snug">
              {anyScored
                ? 'Los puntos de Copa ya están liberados y suman a la tabla.'
                : 'Los puntos se liberan cuando termine la final.'}
            </p>
            <div className="flex flex-col gap-2">{sortedPicks.map(row)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LeagueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const [tab, setTab] = useState<Tab>('Tabla');
  const [shareOpen, setShareOpen] = useState(false);

  const currentUser = useAuthStore((s) => s.user);

  const leagueId = Number(id);
  // Skip the data hooks entirely when the route param is malformed so we
  // don't fire `/leagues/NaN` requests, and use declarative <Navigate>
  // instead of calling navigate() during render (which was triggering a
  // setState-on-render warning and could double-fire on strict mode).
  const validLeagueId = Number.isFinite(leagueId) && leagueId > 0;

  const { data: league, isLoading: leagueLoading, isError: leagueError } = useLeague(validLeagueId ? leagueId : undefined);
  const { data: standingsData, isLoading: standingsLoading } = useLeagueStandings(validLeagueId ? leagueId : undefined);
  const leaveMutation = useLeaveLeague();
  const updateLeague = useUpdateLeague();
  const isAdmin = league?.adminId === currentUser?.id;
  const standings = standingsData?.data ?? [];

  if (!validLeagueId || leagueError) {
    return <Navigate to="/leagues" replace />;
  }

  if (leagueLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="animate-pulse h-5 bg-black/10 dark:bg-white/10 rounded w-40 mb-1" />
            <div className="animate-pulse h-3 bg-black/10 dark:bg-white/10 rounded w-24" />
          </div>
        </div>
        <div className="px-4">
          <SkeletonList count={5} />
        </div>
      </div>
    );
  }

  if (!league) return null;

  const myStanding = standings.find((r) => r.userId === currentUser?.id);

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      {/* Banner image (if set) */}
      {league.imageUrl && (
        <div className="w-full h-32 overflow-hidden flex-shrink-0">
          <img src={league.imageUrl} alt="banner" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg-s font-display font-bold text-text truncate">{league.name}</h1>
          <p className="text-sm-s text-muted">código: {league.code}</p>
        </div>
        <button onClick={() => setShareOpen(true)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Compartir">
          <Share2 size={18} className="text-text" />
        </button>
      </div>

      {myStanding && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-accent-soft border border-accent-border flex items-center gap-3">
          <Trophy size={20} className="text-accent flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm-s font-semibold text-text">Tu posición: #{myStanding.position}</p>
            <p className="text-xs-s text-muted">
              {myStanding.points} pts · {myStanding.matchesPlayed} jugados
            </p>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Secciones de la liga" className="flex gap-1 px-4 mb-0">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 min-h-[44px] py-2.5 rounded-md text-sm-s font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              tab === t ? 'bg-accent text-accent-on' : 'bg-card border border-border text-muted hover:text-text'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tabla' && (
        <div className="mt-3 mx-4 rounded-lg bg-card border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-elevated">
            <span className="w-6 text-center text-xs-s text-muted">#</span>
            <span className="w-8 flex-shrink-0" />
            <span className="flex-1 text-xs-s text-muted">Jugador</span>
            <span className="text-xs-s text-muted">Pts</span>
          </div>
          {standingsLoading ? (
            <div className="p-4">
              <SkeletonList count={5} />
            </div>
          ) : standings.length === 0 ? (
            <div className="py-10 px-6 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
                <Trophy size={22} className="text-accent" />
              </div>
              <div>
                <p className="text-base-s font-bold text-text">Todavía no hay posiciones</p>
                <p className="text-sm-s text-muted mt-1 max-w-xs">
                  La tabla se arma cuando los miembros empiezan a sumar puntos con sus pronósticos.
                </p>
              </div>
            </div>
          ) : (
            <LayoutGroup>
              <motion.div
                variants={staggerContainer(reduced)}
                initial="initial"
                animate="animate"
              >
                {standings.map((row) => (
                  <Row
                    key={row.userId}
                    row={row}
                    isMe={row.userId === currentUser?.id}
                    reduced={reduced}
                    myUserId={currentUser?.id}
                  />
                ))}
              </motion.div>
            </LayoutGroup>
          )}

          <LeagueHistorySection leagueId={validLeagueId ? leagueId : undefined} currentUserId={currentUser?.id} />

          <LeagueCopaPicksSection leagueId={validLeagueId ? leagueId : undefined} currentUserId={currentUser?.id} />
        </div>
      )}

      {tab === 'Info' && (
        <div className="mt-3 px-4 flex flex-col gap-4 pb-4">

          {/* Image (admin can change it) */}
          {isAdmin && (
            <div className="flex flex-col gap-2">
              <p className="text-sm-s font-semibold text-text">Imagen de la liga</p>
              <LeagueBannerPicker
                value={league.imageUrl ?? null}
                onChange={async (newUrl) => {
                  try {
                    await updateLeague.mutateAsync({ id: leagueId, imageUrl: newUrl });
                    toast.success(newUrl ? 'Imagen actualizada' : 'Imagen eliminada');
                  } catch {
                    toast.error('No se pudo guardar la imagen');
                  }
                }}
                disabled={updateLeague.isPending}
              />
            </div>
          )}

          {isAdmin && (
            <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-3">
              <p className="text-sm-s font-semibold text-text">Pronósticos de los miembros</p>
              <div className="flex gap-2">
                {([
                  { value: 'after_kickoff' as const, label: 'Al inicio del partido' },
                  { value: 'always' as const, label: 'Siempre visibles' },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={updateLeague.isPending}
                    onClick={async () => {
                      if (league.predictionsVisibility === value) return;
                      try {
                        await updateLeague.mutateAsync({ id: leagueId, predictionsVisibility: value });
                        toast.success('Visibilidad actualizada');
                      } catch {
                        toast.error('No se pudo actualizar');
                      }
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-md text-xs-s font-semibold border transition-colors',
                      league.predictionsVisibility === value
                        ? 'bg-accent text-accent-on border-accent'
                        : 'bg-elevated text-text border-border',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs-s text-muted">
                Determina cuándo cada miembro puede ver los pronósticos de los demás en esta liga.
              </p>
            </div>
          )}

          <LeagueDescriptionBlock
            leagueId={leagueId}
            description={league.description ?? null}
            canEdit={isAdmin}
            saving={updateLeague.isPending}
            onSave={async (next) => {
              try {
                await updateLeague.mutateAsync({ id: leagueId, description: next });
                toast.success(next ? 'Descripción actualizada' : 'Descripción eliminada');
              } catch {
                toast.error('No se pudo guardar la descripción');
              }
            }}
          />

          <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-3">
            {[
              ['Nombre', league.name],
              ['Código', league.code],
              ['Visibilidad', league.isPublic ? 'Pública' : 'Privada'],
              ['Pronósticos', league.predictionsVisibility === 'always' ? 'Visibles siempre' : 'Al inicio del partido'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm-s text-muted">{label}</span>
                <span className={cn('text-sm-s font-semibold', label === 'Código' ? 'font-mono text-accent' : 'text-text')}>{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-sm-s text-muted">Miembros</span>
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-muted" />
                <span className="text-sm-s font-semibold text-text">{standings.length}</span>
              </div>
            </div>
          </div>
          <button
            className="w-full py-3 rounded-lg border border-red-500/40 text-red-400 text-sm-s font-semibold hover:bg-red-500/10 transition-colors disabled:opacity-50"
            disabled={leaveMutation.isPending}
            onClick={async () => {
              if (!window.confirm('¿Seguro que querés salir de la liga?')) return;
              try {
                await leaveMutation.mutateAsync(leagueId);
                navigate('/leagues', { replace: true });
              } catch (e: any) {
                toast.error(e?.response?.data?.error?.message ?? 'Error al salir de la liga');
              }
            }}
          >
            {leaveMutation.isPending ? 'Saliendo...' : 'Salir de la liga'}
          </button>
        </div>
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        leagueName={league.name}
        code={league.code}
        stakesMeme={league.stakesMeme ?? undefined}
      />
    </div>
  );
}
