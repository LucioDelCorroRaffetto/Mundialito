import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Users, Lock, Globe, ChevronRight, Trophy } from 'lucide-react';
import { MY_LEAGUES, PUBLIC_LEAGUES } from '@/shared/data/mock';
import { cn } from '@/shared/lib/cn';

const TABS = ['Mis ligas', 'Explorar'] as const;
type Tab = (typeof TABS)[number];

export function LeaguesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Mis ligas');
  const [query, setQuery] = useState('');

  const publicFiltered = PUBLIC_LEAGUES.filter((l) =>
    l.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Ligas</h1>
      </div>

      <div className="flex gap-1 px-4 pb-3 pt-1">
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

      {tab === 'Mis ligas' && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex gap-3">
            <Link to="/leagues/create" className="flex-1">
              <button className="w-full flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-dashed border-accent-border hover:bg-accent-soft transition-colors">
                <Plus size={22} className="text-accent" />
                <span className="text-sm-s font-semibold text-accent">Crear liga</span>
              </button>
            </Link>
            <Link to="/leagues/join" className="flex-1">
              <button className="w-full flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-dashed border-border hover:border-accent-border transition-colors">
                <Search size={22} className="text-muted" />
                <span className="text-sm-s font-semibold text-muted">Unirse</span>
              </button>
            </Link>
          </div>

          {MY_LEAGUES.map((league, i) => (
            <motion.div key={league.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link
                to={`/leagues/${league.id}`}
                className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
              >
                <div className="w-10 h-10 rounded-md bg-accent-soft flex items-center justify-center flex-shrink-0">
                  <Trophy size={18} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base-s font-semibold text-text truncate">{league.name}</p>
                    {league.isPublic
                      ? <Globe size={13} className="text-muted flex-shrink-0" />
                      : <Lock size={13} className="text-muted flex-shrink-0" />
                    }
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Users size={12} className="text-muted" />
                    <span className="text-sm-s text-muted">{league.memberCount}</span>
                    <span className="text-xs-s text-muted">·</span>
                    <span className="text-sm-s font-semibold text-text">{league.myPoints} pts</span>
                    <span className={cn('text-xs-s font-bold px-1.5 py-0.5 rounded', league.myPosition === 1 ? 'bg-accent text-accent-on' : 'bg-elevated text-muted')}>
                      {league.myPosition === 1 ? '🥇 1°' : `#${league.myPosition}`}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted flex-shrink-0" />
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {tab === 'Explorar' && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ligas públicas..."
              className="w-full h-11 pl-9 pr-4 rounded-md bg-card border border-border text-text text-sm-s placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {publicFiltered.map((league, i) => (
            <motion.div key={league.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                <div className="w-10 h-10 rounded-md bg-elevated flex items-center justify-center flex-shrink-0">
                  <Globe size={18} className="text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base-s font-semibold text-text truncate">{league.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Users size={12} className="text-muted" />
                    <span className="text-sm-s text-muted">{league.memberCount} miembros</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/leagues/' + league.id)}
                  className="px-3 py-1.5 rounded-md bg-accent text-accent-on text-sm-s font-semibold flex-shrink-0 hover:opacity-90 transition-opacity"
                >
                  Unirse
                </button>
              </div>
            </motion.div>
          ))}

          {publicFiltered.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-base-s text-muted">No se encontraron ligas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
