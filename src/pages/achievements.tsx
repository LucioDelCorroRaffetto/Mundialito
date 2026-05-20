import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useAllAchievements, useMyAchievements } from '@/shared/hooks/use-achievements';
import { SkeletonList } from '@/shared/components/skeleton';

export function AchievementsPage() {
  const { data: allData, isLoading: allLoading } = useAllAchievements();
  const { data: myData } = useMyAchievements();

  const all = allData?.data ?? [];
  const earnedSlugs = new Set((myData?.data ?? []).map(a => a.slug));
  const earnedMap = new Map((myData?.data ?? []).map(a => [a.slug, a.earnedAt]));

  const earned = all.filter(a => earnedSlugs.has(a.slug));
  const locked = all.filter(a => !earnedSlugs.has(a.slug));

  if (allLoading) return <div className="p-4"><SkeletonList count={8} /></div>;

  return (
    <div className="flex flex-col gap-4 pb-8 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Logros</h1>
        <p className="text-sm-s text-muted mt-1">
          {earned.length} de {all.length} desbloqueados
        </p>
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${all.length ? (earned.length / all.length) * 100 : 0}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full bg-accent rounded-full"
        />
      </div>

      {/* Earned */}
      {earned.length > 0 && (
        <div className="px-4">
          <h2 className="text-xs-s font-semibold text-muted uppercase tracking-wider mb-3">
            Desbloqueados
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {earned.map((a, i) => (
              <motion.div
                key={a.slug}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 rounded-xl bg-card border border-accent/30 flex flex-col gap-2"
              >
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="text-sm-s font-bold text-text leading-tight">{a.name}</p>
                  <p className="text-xs-s text-muted mt-0.5 leading-snug">{a.description}</p>
                </div>
                {a.pointsBonus > 0 && (
                  <span className="self-start text-xs-s bg-accent/20 text-accent px-2 py-0.5 rounded-full font-semibold">
                    +{a.pointsBonus} pts
                  </span>
                )}
                <p className="text-xs-s text-muted">
                  {earnedMap.get(a.slug) ? new Date(earnedMap.get(a.slug)!).toLocaleDateString('es-AR') : ''}
                </p>
              </motion.div>
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
              <motion.div
                key={a.slug}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="p-4 rounded-xl bg-card border border-border flex flex-col gap-2 opacity-50"
              >
                <div className="relative self-start">
                  <span className="text-3xl grayscale">{a.icon}</span>
                  <Lock size={12} className="absolute -bottom-1 -right-1 text-muted" />
                </div>
                <div>
                  <p className="text-sm-s font-bold text-muted leading-tight">{a.name}</p>
                  <p className="text-xs-s text-muted/70 mt-0.5 leading-snug">{a.description}</p>
                </div>
                {a.pointsBonus > 0 && (
                  <span className="self-start text-xs-s bg-white/5 text-muted px-2 py-0.5 rounded-full font-semibold">
                    +{a.pointsBonus} pts
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
