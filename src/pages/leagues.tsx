import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Lock, Globe, ChevronRight, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useMyLeagues, useJoinLeague, useSearchLeagues } from '@/shared/hooks/use-leagues';
import { SkeletonList } from '@/shared/components/skeleton';
import { staggerContainer, staggerItem, useMotionPrefs, tapScale } from '@/shared/lib/motion';

const TABS = ['Mis ligas', 'Explorar'] as const;
type Tab = (typeof TABS)[number];

export function LeaguesPage() {
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const [tab, setTab] = useState<Tab>('Mis ligas');
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const { data: myLeaguesData, isLoading: myLeaguesLoading } = useMyLeagues();
  const myLeagues = myLeaguesData?.data ?? [];

  const { data: searchData, isLoading: searchLoading } = useSearchLeagues(debouncedQuery);
  const searchResults = searchData?.data ?? [];

  const joinMutation = useJoinLeague();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const handleJoin = (code: string, leagueId: number) => {
    joinMutation.mutate(code, {
      onSuccess: () => {
        navigate(`/leagues/${leagueId}`);
      },
      onError: () => {
        toast.error('No se pudo unir a la liga. Verificá el código e intentá de nuevo.');
      },
    });
  };

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Ligas</h1>
        <p className="text-sm-s text-muted mt-0.5">Competí con tus amigos por la cima de la tabla</p>
      </div>

      <div role="tablist" aria-label="Filtrar ligas" className="flex gap-1 px-4 pb-3 pt-1">
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

      {tab === 'Mis ligas' && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex gap-3">
            <Link
              to="/leagues/create"
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-dashed border-accent-border hover:bg-accent-soft transition-colors"
            >
              <Plus size={22} className="text-accent" />
              <span className="text-sm-s font-semibold text-accent">Crear liga</span>
            </Link>
            <Link
              to="/leagues/join"
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-dashed border-border hover:border-accent-border transition-colors"
            >
              <Search size={22} className="text-muted" />
              <span className="text-sm-s font-semibold text-muted">Unirse</span>
            </Link>
          </div>

          {myLeaguesLoading && <SkeletonList count={3} />}

          {!myLeaguesLoading && myLeagues.length === 0 && (
            <div className="mt-2 p-6 rounded-xl bg-card border border-border flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
                <Trophy size={22} className="text-accent" />
              </div>
              <div>
                <p className="text-base-s font-bold text-text">Sin ligas todavía</p>
                <p className="text-sm-s text-muted mt-1 max-w-xs">
                  Creá una para competir con tus amigos, o usá la pestaña <span className="text-text font-semibold">Explorar</span> para sumarte a una pública.
                </p>
              </div>
            </div>
          )}

          {!myLeaguesLoading && myLeagues.length > 0 && (
          <motion.div
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-3"
          >
          {myLeagues.map((league) => (
            <motion.div key={league.id} variants={staggerItem(reduced)} whileTap={reduced ? undefined : tapScale}>
              <Link
                to={`/leagues/${league.id}`}
                className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-accent-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {league.imageUrl ? (
                  <img
                    src={league.imageUrl}
                    alt={league.name}
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-elevated"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-accent-soft flex items-center justify-center flex-shrink-0">
                    <Trophy size={18} className="text-accent" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base-s font-semibold text-text truncate">{league.name}</p>
                    {league.isPublic
                      ? <Globe size={13} className="text-muted flex-shrink-0" />
                      : <Lock size={13} className="text-muted flex-shrink-0" />
                    }
                  </div>
                  <p className="text-sm-s text-muted mt-0.5 font-mono">{league.code}</p>
                </div>
                <ChevronRight size={16} className="text-muted flex-shrink-0" />
              </Link>
            </motion.div>
          ))}
          </motion.div>
          )}
        </div>
      )}

      {tab === 'Explorar' && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Buscar ligas públicas..."
              aria-label="Buscar ligas públicas"
              className="w-full h-11 pl-9 pr-4 rounded-md bg-card border border-border text-text text-sm-s placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {searchLoading && debouncedQuery.length >= 2 && <SkeletonList count={3} />}

          {!searchLoading && searchResults.length > 0 && (
          <motion.div
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-3"
          >
          {searchResults.map((league) => (
            <motion.div key={league.id} variants={staggerItem(reduced)}>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                {league.imageUrl ? (
                  <img
                    src={league.imageUrl}
                    alt={league.name}
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-elevated"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-elevated flex items-center justify-center flex-shrink-0">
                    <Globe size={18} className="text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base-s font-semibold text-text truncate">{league.name}</p>
                  <p className="text-sm-s text-muted mt-0.5 font-mono">{league.code}</p>
                </div>
                <button
                  onClick={() => handleJoin(league.code, league.id)}
                  disabled={joinMutation.isPending}
                  aria-label={`Unirse a la liga ${league.name}`}
                  className="min-h-[40px] px-4 py-2 rounded-md bg-accent text-accent-on text-sm-s font-semibold flex-shrink-0 hover:opacity-90 transition-opacity disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Unirse
                </button>
              </div>
            </motion.div>
          ))}
          </motion.div>
          )}

          {!searchLoading && debouncedQuery.length >= 2 && searchResults.length === 0 && (
            <div className="mt-2 p-6 rounded-xl bg-card border border-border flex flex-col items-center gap-2 text-center">
              <span className="text-2xl opacity-60">🔍</span>
              <p className="text-base-s font-semibold text-text">Sin resultados</p>
              <p className="text-sm-s text-muted max-w-xs">
                No encontramos ligas que coincidan con "{debouncedQuery}". Probá otro nombre o pedile el código a quien la creó.
              </p>
            </div>
          )}

          {debouncedQuery.length < 2 && !searchLoading && (
            <div className="mt-2 p-6 rounded-xl bg-card border border-border flex flex-col items-center gap-2 text-center">
              <Search size={22} className="text-muted opacity-60" />
              <p className="text-base-s font-semibold text-text">Buscá una liga pública</p>
              <p className="text-sm-s text-muted max-w-xs">
                Escribí al menos 2 caracteres del nombre para empezar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
