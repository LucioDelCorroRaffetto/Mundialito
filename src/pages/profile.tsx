import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, ChevronRight, Star } from 'lucide-react';
import { MY_STATS, ACHIEVEMENTS, RARITY_COLOR } from '@/shared/data/mock';
import { cn } from '@/shared/lib/cn';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
}

export function ProfilePage() {
  const unlocked = ACHIEVEMENTS.filter((a) => a.unlocked);
  const locked = ACHIEVEMENTS.filter((a) => !a.unlocked);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-4 px-4 pt-6">
        <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-2xl-s font-display font-bold text-accent-on">V</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl-s font-display font-bold text-text">vos</h1>
          <p className="text-sm-s text-muted">vos@email.com</p>
        </div>
        <Link
          to="/settings"
          className="p-2 rounded-md bg-elevated border border-border hover:border-accent-border transition-colors"
          aria-label="Configuración"
        >
          <Settings size={20} className="text-muted" />
        </Link>
      </div>

      <div className="px-4">
        <h2 className="text-base-s font-display font-bold text-text mb-3">Mis estadísticas</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Puntos totales" value={MY_STATS.totalPoints} />
          <StatCard label="Exactos 🎯" value={MY_STATS.exactPredictions} />
          <StatCard label="Resultados ✓" value={MY_STATS.resultPredictions} />
          <StatCard label="Pronósticos" value={MY_STATS.totalPredictions} />
          <StatCard label="% Acierto" value={`${MY_STATS.accuracy}%`} />
          <StatCard label="Racha actual" value={`${MY_STATS.currentStreak}🔥`} />
        </div>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base-s font-display font-bold text-text">
            Logros ({unlocked.length}/{ACHIEVEMENTS.length})
          </h2>
          <Star size={16} className="text-accent" />
        </div>

        {unlocked.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {unlocked.map((a) => (
              <motion.div
                key={a.code}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-accent-border"
              >
                <span className="text-2xl-s">{a.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm-s font-semibold text-text">{a.name}</p>
                  <p className={cn('text-xs-s font-semibold capitalize', RARITY_COLOR[a.rarity])}>{a.rarity}</p>
                </div>
                <span className="text-xs-s text-muted">{a.unlockedAt}</span>
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {locked.map((a) => (
            <div key={a.code} className="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-border opacity-60">
              <span className="text-2xl-s grayscale">{'secret' in a && a.secret ? '❓' : a.emoji}</span>
              <div className="flex-1">
                <p className="text-sm-s font-semibold text-muted">{'secret' in a && a.secret ? '???' : a.name}</p>
                <p className={cn('text-xs-s font-semibold capitalize', RARITY_COLOR[a.rarity])}>{a.rarity}</p>
              </div>
              <span className="text-xs-s text-muted">🔒</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link
          to="/settings"
          className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-accent-border transition-colors"
        >
          <div className="w-9 h-9 rounded-md bg-elevated flex items-center justify-center">
            <Settings size={18} className="text-muted" />
          </div>
          <div className="flex-1">
            <p className="text-base-s font-semibold text-text">Configuración</p>
            <p className="text-sm-s text-muted">Tema · fuente · notificaciones</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Link>
      </div>
    </div>
  );
}
