import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, Users, Trophy, ChevronRight, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { ShareSheet } from '@/shared/components/share-sheet';
import { SkeletonList } from '@/shared/components/skeleton';
import { LeagueBannerPicker } from '@/shared/components/ui/image-picker';
import { useLeague, useLeagueStandings, useLeaveLeague, useUpdateLeague, type StandingRow } from '@/shared/hooks/use-leagues';
import { useAuthStore } from '@/shared/stores/auth-store';
import { podiumStyle } from '@/shared/components/logros-gate-banner';

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

function Row({ row, isMe }: { row: StandingRow; isMe: boolean }) {
  const initials = row.username.slice(0, 1).toUpperCase();
  // Podium spots get medal styling. The "me" highlight wins when it overlaps —
  // people care more about finding themselves than seeing a medal anyway.
  const podium = podiumStyle(row.position);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: row.position * 0.04 }}
    >
      <Link
        to={`/u/${row.userId}`}
        className={cn(
          'flex items-center gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors',
          isMe
            ? 'bg-accent-soft hover:bg-accent-soft/80 border-border'
            : podium
              ? `${podium.rowBg} ${podium.rowBorder}`
              : 'border-border hover:bg-elevated',
        )}
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
            <img src={row.avatarUrl} alt={row.username} className="w-full h-full object-cover" />
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
              'text-base-s font-bold',
              isMe ? 'text-accent' : podium ? podium.text : 'text-text',
            )}
          >
            {row.points}
          </span>
          <ChevronRight size={16} className="text-muted flex-shrink-0" />
        </div>
      </Link>
    </motion.div>
  );
}

export function LeagueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Tabla');
  const [shareOpen, setShareOpen] = useState(false);

  const currentUser = useAuthStore((s) => s.user);

  const leagueId = Number(id);
  if (isNaN(leagueId)) {
    navigate('/leagues', { replace: true });
    return null;
  }

  const { data: league, isLoading: leagueLoading, isError: leagueError } = useLeague(leagueId);
  const { data: standingsData, isLoading: standingsLoading } = useLeagueStandings(leagueId);
  const leaveMutation = useLeaveLeague();
  const updateLeague = useUpdateLeague();
  const isAdmin = league?.adminId === currentUser?.id;
  const standings = standingsData?.data ?? [];

  if (leagueError) {
    navigate('/leagues', { replace: true });
    return null;
  }

  if (leagueLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="animate-pulse h-5 bg-white/10 rounded w-40 mb-1" />
            <div className="animate-pulse h-3 bg-white/10 rounded w-24" />
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
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg-s font-display font-bold text-text truncate">{league.name}</h1>
          <p className="text-sm-s text-muted">código: {league.code}</p>
        </div>
        <button onClick={() => setShareOpen(true)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Compartir">
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

      <div className="flex gap-1 px-4 mb-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 rounded-md text-sm-s font-semibold transition-colors',
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
            <div className="py-8 text-center">
              <p className="text-sm-s text-muted">Todavía no hay posiciones</p>
            </div>
          ) : (
            standings.map((row) => (
              <Row key={row.userId} row={row} isMe={row.userId === currentUser?.id} />
            ))
          )}
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
