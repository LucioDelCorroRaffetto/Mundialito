import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, Users, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { ShareSheet } from '@/shared/components/share-sheet';
import { SkeletonList } from '@/shared/components/skeleton';
import { LeagueBannerPicker } from '@/shared/components/ui/image-picker';
import { useLeague, useLeagueStandings, useLeaveLeague, useUpdateLeague, type StandingRow } from '@/shared/hooks/use-leagues';
import { useAuthStore } from '@/shared/stores/auth-store';

const TABS = ['Tabla', 'Info'] as const;
type Tab = (typeof TABS)[number];

function Row({ row, isMe }: { row: StandingRow; isMe: boolean }) {
  const initials = row.username.slice(0, 1).toUpperCase();
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: row.position * 0.04 }}
      className={cn('flex items-center gap-3 px-4 py-3 border-b border-border last:border-0', isMe && 'bg-accent-soft')}
    >
      <span className={cn('w-6 text-center text-sm-s font-bold', isMe ? 'text-accent' : 'text-muted')}>
        {row.position}
      </span>
      <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 overflow-hidden">
        {row.avatarUrl ? (
          <img src={row.avatarUrl} alt={row.username} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm-s font-bold text-text">{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm-s font-semibold truncate', isMe ? 'text-accent' : 'text-text')}>
          {row.username} {isMe && '(vos)'}
        </p>
        <p className="text-xs-s text-muted">{row.matchesPlayed} jugados</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn('text-base-s font-bold', isMe ? 'text-accent' : 'text-text')}>{row.points}</span>
      </div>
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

          <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-3">
            {[
              ['Nombre', league.name],
              ['Código', league.code],
              ['Visibilidad', league.isPublic ? 'Pública' : 'Privada'],
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
