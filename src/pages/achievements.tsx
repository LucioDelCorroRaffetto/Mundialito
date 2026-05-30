import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Zap } from 'lucide-react';
import { useAllAchievements, useMyAchievements, type Achievement } from '@/shared/hooks/use-achievements';
import { SkeletonList } from '@/shared/components/skeleton';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { cn } from '@/shared/lib/cn';

const TIER_RING: Record<string, string> = {
  bronze: 'border-amber-700/40 hover:border-amber-500/70',
  silver: 'border-slate-400/40 hover:border-slate-300/70',
  gold: 'border-yellow-400/40 hover:border-yellow-300/70',
  platinum: 'border-cyan-300/40 hover:border-cyan-200/70',
};

export function AchievementsPage() {
  const { data: allData, isLoading: allLoading } = useAllAchievements();
  const { data: myData } = useMyAchievements();
  const [selected, setSelected] = useState<{ achievement: Achievement; earned: boolean; earnedAt?: string } | null>(null);

  const all = allData?.data ?? [];
  const earnedSlugs = new Set((myData?.data ?? []).map(a => a.slug));
  const earnedMap = new Map((myData?.data ?? []).map(a => [a.slug, a.earnedAt]));

  const earned = all.filter(a => earnedSlugs.has(a.slug));
  const locked = all.filter(a => !earnedSlugs.has(a.slug));

  const totalBonus = earned.reduce((sum, a) => sum + a.pointsBonus, 0);

  function openCard(achievement: Achievement, isEarned: boolean) {
    setSelected({
      achievement,
      earned: isEarned,
      earnedAt: isEarned ? earnedMap.get(achievement.slug) : undefined,
    });
  }

  if (allLoading) return <div className="p-4"><SkeletonList count={8} /></div>;

  return (
    <div className="flex flex-col gap-4 pb-8 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Logros</h1>
        <p className="text-sm-s text-muted mt-1">
          {earned.length} de {all.length} desbloqueados · tocá una carta para verla en grande
        </p>
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-2 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${all.length ? (earned.length / all.length) * 100 : 0}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full bg-accent rounded-full"
        />
      </div>

      {/* Bonus points explanation */}
      <div className="mx-4 p-4 rounded-xl bg-accent/10 border border-accent/20 flex items-start gap-3">
        <Zap size={18} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm-s font-semibold text-text">Los puntos de logros cuentan de verdad</p>
          <p className="text-xs-s text-muted mt-0.5 leading-relaxed">
            Cada logro tiene un <span className="text-text font-semibold">bonus de puntos</span> que se suma
            automáticamente a tu puntaje en la tabla global y en las ligas. Desbloquear logros es una
            forma extra de escalar posiciones.
          </p>
          {totalBonus > 0 && (
            <p className="text-sm-s font-bold text-accent mt-2">
              +{totalBonus} pts acumulados hasta ahora
            </p>
          )}
        </div>
      </div>

      {/* Earned */}
      {earned.length > 0 && (
        <div className="px-4">
          <h2 className="text-xs-s font-semibold text-muted uppercase tracking-wider mb-3">
            Desbloqueados
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {earned.map((a, i) => (
              <motion.button
                key={a.slug}
                type="button"
                onClick={() => openCard(a, true)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'p-4 rounded-xl bg-card border flex flex-col gap-2 text-left transition-colors',
                  TIER_RING[a.tier] ?? 'border-accent/30',
                )}
              >
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="text-sm-s font-bold text-text leading-tight">{a.name}</p>
                  <p className="text-xs-s text-muted mt-0.5 leading-snug">{a.description}</p>
                </div>
                <span className="self-start text-xs-s bg-accent/20 text-accent px-2 py-0.5 rounded-full font-semibold">
                  +{a.pointsBonus} pts
                </span>
                <p className="text-xs-s text-muted">
                  {earnedMap.get(a.slug) ? new Date(earnedMap.get(a.slug)!).toLocaleDateString('es-AR') : ''}
                </p>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div className="px-4">
          <h2 className="text-xs-s font-semibold text-muted uppercase tracking-wider mb-3">
            Por desbloquear
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {locked.map((a, i) => (
              <motion.button
                key={a.slug}
                type="button"
                onClick={() => openCard(a, false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'p-4 rounded-xl bg-card border flex flex-col gap-2 text-left opacity-60 hover:opacity-100 transition-opacity',
                  TIER_RING[a.tier] ?? 'border-border',
                )}
              >
                <div className="relative self-start">
                  <span className="text-3xl grayscale">{a.icon}</span>
                  <Lock size={12} className="absolute -bottom-1 -right-1 text-muted" />
                </div>
                <div>
                  <p className="text-sm-s font-bold text-muted leading-tight">{a.name}</p>
                  <p className="text-xs-s text-muted/70 mt-0.5 leading-snug">{a.description}</p>
                </div>
                <span className="self-start text-xs-s text-muted px-2 py-0.5 rounded-full font-semibold bg-black/5 dark:bg-white/5">
                  +{a.pointsBonus} pts
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <AchievementCardModal
        achievement={selected?.achievement ?? null}
        earned={selected?.earned ?? false}
        earnedAt={selected?.earnedAt}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
