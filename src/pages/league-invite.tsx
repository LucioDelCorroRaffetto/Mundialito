import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Trophy, Lock, Globe } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { MY_LEAGUES, PUBLIC_LEAGUES, LEAGUE_STANDINGS } from '@/shared/data/mock';
import { useAuthStore } from '@/shared/stores/auth-store';

export function LeagueInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const allLeagues = [...MY_LEAGUES, ...PUBLIC_LEAGUES];
  const league = allLeagues.find((l) => l.code === code);

  if (!league) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <Trophy size={48} className="text-muted" />
        <p className="text-xl-s font-bold text-text">Liga no encontrada</p>
        <p className="text-sm-s text-muted">El código "{code}" no corresponde a ninguna liga activa.</p>
        <Button onClick={() => navigate('/home')}>Ir al inicio</Button>
      </div>
    );
  }

  // Top 3 del standing
  const standings = LEAGUE_STANDINGS.slice(0, 3);

  const handleJoin = () => {
    if (!isAuthenticated) {
      navigate(`/register?returnTo=/j/${code}`);
    } else {
      navigate(`/leagues/${league.id}`);
    }
  };

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
        </motion.div>

        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-sm-s text-muted">
            <Users size={14} />
            <span>{league.memberCount} miembros</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm-s text-muted">
            {league.isPublic ? <Globe size={14} /> : <Lock size={14} />}
            <span>{league.isPublic ? 'Pública' : 'Privada'}</span>
          </div>
        </div>
      </div>

      {/* Preview tabla (anónima) */}
      <div className="mx-4 p-4 rounded-xl bg-card border border-border mb-4">
        <p className="text-sm-s font-semibold text-text mb-3">Top 3 actual</p>
        <div className="flex flex-col gap-2">
          {standings.map((row, i) => (
            <div key={row.userId} className="flex items-center gap-3">
              <span className="w-6 text-center text-sm-s font-bold text-muted">{i + 1}</span>
              <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center">
                <span className="text-sm-s font-bold text-text">{row.avatar}</span>
              </div>
              <span className="flex-1 text-sm-s font-semibold text-text">
                {i === 0 ? row.displayName : `Jugador ${i + 1}`}
              </span>
              <span className="text-sm-s font-bold text-accent">{row.points} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 flex flex-col gap-3 mt-auto pb-8">
        <Button size="lg" fullWidth onClick={handleJoin}>
          ¡Me sumo a la liga! 🏆
        </Button>
        <p className="text-xs-s text-muted text-center">
          Vas a necesitar una cuenta para pronosticar
        </p>
      </div>
    </div>
  );
}
