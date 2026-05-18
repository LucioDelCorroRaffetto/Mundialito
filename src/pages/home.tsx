import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Trophy, ChevronRight } from 'lucide-react';
import { MY_LEAGUES, MATCHES } from '@/shared/data/mock';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';

function formatKickoff(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

export function HomePage() {
  const upcoming = MATCHES.filter((m) => m.status === 'scheduled').slice(0, 3);

  return (
    <div className="flex flex-col gap-6 p-4 pt-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm-s text-muted">¡Hola, vos! 👋</p>
          <h1 className="text-2xl-s font-display font-bold text-text">Mis ligas</h1>
        </div>
        <Link
          to="/leagues/create"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-accent-on text-sm-s font-semibold"
        >
          <Plus size={16} />
          Nueva
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {MY_LEAGUES.map((league, i) => (
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
                <div className="flex items-center gap-2">
                  <p className="text-base-s font-semibold text-text truncate">{league.name}</p>
                  {!league.isPublic && (
                    <span className="text-xs-s text-muted border border-border rounded px-1.5 py-0.5 flex-shrink-0">privada</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-sm-s text-muted">{league.memberCount} miembros</span>
                  <span className="text-xs-s text-muted">·</span>
                  <span className="text-sm-s text-text font-semibold">{league.myPoints} pts</span>
                  <span
                    className={cn(
                      'text-xs-s font-semibold px-1.5 py-0.5 rounded',
                      league.myPosition === 1 ? 'bg-accent text-accent-on' : 'bg-elevated text-muted'
                    )}
                  >
                    {league.myPosition === 1 ? '🥇' : `#${league.myPosition}`}
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted flex-shrink-0" />
            </Link>
          </motion.div>
        ))}
      </div>

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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg-s font-display font-bold text-text">Próximos partidos</h2>
          <Link to="/matches" className="text-sm-s text-accent font-semibold">Ver todos</Link>
        </div>
        <div className="flex flex-col gap-2">
          {upcoming.map((match) => (
            <Link
              key={match.id}
              to={`/matches/${match.id}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
            >
              <div className="text-center min-w-0 flex-1">
                <p className="text-xs-s text-muted">{formatKickoff(match.kickoffUtc)} · {formatTime(match.kickoffUtc)}</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="text-sm-s font-semibold text-text text-right flex-1 truncate">
                    {match.homeTeam.flag} {match.homeTeam.code}
                  </span>
                  <span className="text-xs-s text-muted font-bold">vs</span>
                  <span className="text-sm-s font-semibold text-text text-left flex-1 truncate">
                    {match.awayTeam.code} {match.awayTeam.flag}
                  </span>
                </div>
                <p className="text-xs-s text-muted mt-0.5">{match.city}</p>
              </div>
              <ChevronRight size={16} className="text-muted flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
