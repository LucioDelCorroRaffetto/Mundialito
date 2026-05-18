import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, Users, TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import { MY_LEAGUES, LEAGUE_STANDINGS, type StandingsRow } from '@/shared/data/mock';
import { cn } from '@/shared/lib/cn';

const TABS = ['Tabla', 'Info'] as const;
type Tab = (typeof TABS)[number];

const TREND_ICON = {
  up: <TrendingUp size={12} className="text-green-400" />,
  down: <TrendingDown size={12} className="text-red-400" />,
  same: <Minus size={12} className="text-muted" />,
};

function Row({ row, isMe }: { row: StandingsRow; isMe: boolean }) {
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
      <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-shrink-0">
        <span className="text-sm-s font-bold text-text">{row.avatar}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm-s font-semibold truncate', isMe ? 'text-accent' : 'text-text')}>
          {row.displayName} {isMe && '(vos)'}
        </p>
        <p className="text-xs-s text-muted">{row.exact} exactos · {row.result} resultados</p>
      </div>
      <div className="flex items-center gap-1.5">
        {TREND_ICON[row.trend]}
        <span className={cn('text-base-s font-bold', isMe ? 'text-accent' : 'text-text')}>{row.points}</span>
      </div>
    </motion.div>
  );
}

export function LeagueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Tabla');

  const league = MY_LEAGUES.find((l) => l.id === Number(id)) ?? MY_LEAGUES[0];

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg-s font-display font-bold text-text truncate">{league.name}</h1>
          <p className="text-sm-s text-muted">{league.memberCount} miembros · código: {league.code}</p>
        </div>
        <button className="p-2 rounded-md bg-elevated border border-border" aria-label="Compartir">
          <Share2 size={18} className="text-text" />
        </button>
      </div>

      <div className="mx-4 mb-4 p-3 rounded-lg bg-accent-soft border border-accent-border flex items-center gap-3">
        <Trophy size={20} className="text-accent flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm-s font-semibold text-text">Tu posición: #{league.myPosition}</p>
          <p className="text-xs-s text-muted">
            {league.myPoints} pts · Líder: {league.leader.name} ({league.leader.points} pts)
          </p>
        </div>
      </div>

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
          {LEAGUE_STANDINGS.map((row) => (
            <Row key={row.userId} row={row} isMe={row.userId === 99} />
          ))}
        </div>
      )}

      {tab === 'Info' && (
        <div className="mt-3 px-4 flex flex-col gap-4 pb-4">
          <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-3">
            {[
              ['Nombre', league.name],
              ['Código', league.code],
              ['Visibilidad', league.isPublic ? 'Pública' : 'Privada'],
              ['Admin', league.adminName],
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
                <span className="text-sm-s font-semibold text-text">{league.memberCount}</span>
              </div>
            </div>
          </div>
          <button className="w-full py-3 rounded-lg border border-red-500/40 text-red-400 text-sm-s font-semibold hover:bg-red-500/10 transition-colors">
            Salir de la liga
          </button>
        </div>
      )}
    </div>
  );
}
