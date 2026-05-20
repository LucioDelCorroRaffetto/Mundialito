import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Trophy, Lock, Globe, Copy, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { useLeagueByCode, useJoinLeague } from '@/shared/hooks/use-leagues';
import { useAuthStore } from '@/shared/stores/auth-store';

export function LeagueInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState('');

  const { data: league, isLoading, isError } = useLeagueByCode(code);
  const joinMutation = useJoinLeague();

  const inviteUrl = `https://mundialito-pi.vercel.app/j/${code}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  const handleJoin = async () => {
    if (!isAuthenticated) {
      navigate(`/register?returnTo=/j/${code}`);
      return;
    }
    if (!code) return;
    setJoinError('');
    try {
      const joined = await joinMutation.mutateAsync(code);
      navigate(`/leagues/${joined.id}`);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = apiError?.response?.data?.error?.message;
      if (msg === 'Already a member of this league') {
        // Already a member — navigate there using league data we have
        if (league) navigate(`/leagues/${league.id}`);
      } else {
        setJoinError('No se pudo unir a la liga. Intentá de nuevo.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <Loader2 size={32} className="text-accent animate-spin" />
        <p className="text-sm-s text-muted">Cargando liga...</p>
      </div>
    );
  }

  if (isError || !league) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <Trophy size={48} className="text-muted" />
        <p className="text-xl-s font-bold text-text">Liga no encontrada</p>
        <p className="text-sm-s text-muted">El código "{code}" no corresponde a ninguna liga activa.</p>
        <Button onClick={() => navigate('/home')}>Ir al inicio</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen animate-fade-in bg-bg">
      {/* Hero */}
      <div className="flex flex-col items-center gap-3 px-6 pt-12 pb-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center"
        >
          <Trophy size={36} className="text-accent-on" />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-1"
        >
          <p className="text-2xl-s font-display font-bold text-text">{league.name}</p>
          {league.adminName && (
            <p className="text-sm-s text-muted">Organizada por {league.adminName}</p>
          )}
        </motion.div>

        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-sm-s text-muted">
            <Users size={14} />
            <span>{league.memberCount} {league.memberCount === 1 ? 'miembro' : 'miembros'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm-s text-muted">
            {league.isPublic ? <Globe size={14} /> : <Lock size={14} />}
            <span>{league.isPublic ? 'Pública' : 'Privada'}</span>
          </div>
        </div>
      </div>

      {/* Invite code + copy link */}
      <div className="mx-4 p-4 rounded-xl bg-card border border-border mb-4">
        <p className="text-xs-s text-muted mb-1">Código de invitación</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl-s font-display font-bold text-accent tracking-widest">{league.code}</p>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-elevated border border-border text-sm-s font-semibold text-text hover:opacity-80 transition-opacity"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            <span>{copied ? '¡Copiado!' : 'Copiar link'}</span>
          </button>
        </div>
        {league.stakesMeme && (
          <p className="text-sm-s text-muted mt-2 italic">"{league.stakesMeme}"</p>
        )}
      </div>

      {/* CTA */}
      <div className="px-4 flex flex-col gap-3 mt-auto pb-8">
        {joinError && (
          <p className="text-sm-s text-red-500 text-center">{joinError}</p>
        )}
        <Button size="lg" fullWidth onClick={handleJoin} loading={joinMutation.isPending}>
          ¡Me sumo a la liga! 🏆
        </Button>
        {!isAuthenticated && (
          <p className="text-xs-s text-muted text-center">
            Vas a necesitar una cuenta para pronosticar
          </p>
        )}
      </div>
    </div>
  );
}
