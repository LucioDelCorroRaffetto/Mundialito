import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { MATCHES, MY_PREDICTIONS, ROUND_LABELS, type Match } from '@/shared/data/mock';
import { cn } from '@/shared/lib/cn';

function formatDate(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

function groupByDate(matches: Match[]) {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const key = m.kickoffUtc.slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

const FILTER_TABS = ['Todos', 'Pendientes', 'Pronosticados'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

export function MatchesPage() {
  const [filter, setFilter] = useState<FilterTab>('Todos');
  const predictedIds = new Set(MY_PREDICTIONS.map((p) => p.matchId));

  const filtered = MATCHES.filter((m) => {
    if (filter === 'Pronosticados') return predictedIds.has(m.id);
    if (filter === 'Pendientes') return !predictedIds.has(m.id) && m.status === 'scheduled';
    return true;
  });

  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Partidos</h1>
        <p className="text-sm-s text-muted mt-0.5">Mundial FIFA 2026 · 104 partidos</p>
      </div>

      <div className="flex gap-1 px-4 pb-4 pt-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'flex-1 py-2 rounded-md text-sm-s font-semibold transition-colors',
              filter === tab ? 'bg-accent text-accent-on' : 'bg-card border border-border text-muted hover:text-text'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 px-4 pb-4">
        {dates.map((date) => (
          <motion.div key={date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
            <p className="text-sm-s font-bold text-muted capitalize">{formatDate(date)}</p>
            {grouped[date].map((match) => {
              const prediction = MY_PREDICTIONS.find((p) => p.matchId === match.id);
              return (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
                >
                  <div className="flex-shrink-0">
                    {prediction
                      ? <CheckCircle2 size={18} className="text-green-400" />
                      : <Clock size={18} className="text-muted" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs-s text-muted">
                        {match.group ? `Grupo ${match.group}` : ROUND_LABELS[match.round]}
                      </span>
                      <span className="text-xs-s text-muted">·</span>
                      <span className="text-xs-s text-muted">{formatTime(match.kickoffUtc)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm-s font-semibold text-text">{match.homeTeam.flag} {match.homeTeam.name}</span>
                      <span className="text-xs-s font-bold text-muted">vs</span>
                      <span className="text-sm-s font-semibold text-text">{match.awayTeam.name} {match.awayTeam.flag}</span>
                    </div>
                    {prediction && (
                      <p className="text-xs-s text-accent font-semibold mt-0.5">
                        Tu pronóstico: {prediction.homeScore} - {prediction.awayScore}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-muted flex-shrink-0" />
                </Link>
              );
            })}
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-3xl-s mb-3">⚽</p>
            <p className="text-base-s font-semibold text-text">No hay partidos</p>
            <p className="text-sm-s text-muted mt-1">
              {filter === 'Pronosticados' ? 'Todavía no pronosticaste ningún partido.' : 'No hay partidos en esta categoría.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
