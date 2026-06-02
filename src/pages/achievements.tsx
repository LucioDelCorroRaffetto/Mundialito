import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAllAchievements, useMyAchievements, type Achievement } from '@/shared/hooks/use-achievements';
import { SkeletonList } from '@/shared/components/skeleton';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { UserLevelCard } from '@/shared/components/user-level-badge';
import { useAuthStore } from '@/shared/stores/auth-store';
import { computeLevel } from '@/shared/lib/levels';
import { apiClient } from '@/shared/lib/api-client';
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
  const me = useAuthStore((s) => s.user);
  const setMeInStore = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ achievement: Achievement; earned: boolean; earnedAt?: string } | null>(null);

  const all = allData?.data ?? [];
  const mine = myData?.data ?? [];
  const earnedSlugs = new Set(mine.map(a => a.slug));
  const earnedMap = new Map(mine.map(a => [a.slug, a.earnedAt]));
  const selectedTitleSlug = mine.find((a) => a.isSelectedTitle)?.slug
    ?? me?.title?.slug
    ?? null;

  const earned = all.filter(a => earnedSlugs.has(a.slug));
  const locked = all.filter(a => !earnedSlugs.has(a.slug));

  const totalXp = earned.reduce((sum, a) => sum + a.xpReward, 0);
  const level = me?.level ?? computeLevel(me?.xp ?? totalXp);

  // Picking a title is a PATCH /users/me with selectedTitleSlug = the slug
  // (or null to clear). The server validates that the user owns the
  // achievement before saving.
  const titleMutation = useMutation({
    mutationFn: async (slug: string | null) => {
      const { data } = await apiClient.patch('/users/me', { selectedTitleSlug: slug });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['achievements', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['global-leaderboard'] });
      // Reflect the new title locally without forcing a /auth/me refetch.
      if (me && token) {
        setMeInStore({ ...me, title: data.selectedTitleSlug ? { slug: data.selectedTitleSlug, name: '' } : null }, token);
      }
    },
  });

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

      {/* Level card + explanation. Logros ya no afectan el puntaje de
          predicciones — dan XP que sube el nivel y desbloquea títulos
          elegibles. */}
      <div className="mx-4 flex flex-col gap-3">
        <UserLevelCard level={level} />
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-start gap-3">
          <Sparkles size={18} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm-s font-semibold text-text">Los logros suben tu nivel, no tu puntaje</p>
            <p className="text-xs-s text-muted mt-0.5 leading-relaxed">
              Cada logro da <span className="text-text font-semibold">XP</span> que sube tu
              nivel (visible al lado de tu nombre) y desbloquea un{' '}
              <span className="text-text font-semibold">título</span> elegible para mostrar
              bajo tu nombre. La tabla de posiciones depende sólo de tus pronósticos.
            </p>
          </div>
        </div>
      </div>

      {/* Earned */}
      {earned.length > 0 && (
        <div className="px-4">
          <h2 className="text-xs-s font-semibold text-muted uppercase tracking-wider mb-3">
            Desbloqueados
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {earned.map((a, i) => {
              const isCurrentTitle = a.slug === selectedTitleSlug;
              return (
                <motion.div
                  key={a.slug}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'p-4 rounded-xl bg-card border flex flex-col gap-2 transition-colors relative',
                    isCurrentTitle
                      ? 'border-accent ring-2 ring-accent/30'
                      : TIER_RING[a.tier] ?? 'border-accent/30',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openCard(a, true)}
                    className="text-left flex flex-col gap-2"
                  >
                    <span className="text-3xl">{a.icon}</span>
                    <div>
                      <p className="text-sm-s font-bold text-text leading-tight">{a.name}</p>
                      <p className="text-xs-s text-muted mt-0.5 leading-snug">{a.description}</p>
                    </div>
                    <span className="self-start text-xs-s bg-accent/20 text-accent px-2 py-0.5 rounded-full font-semibold">
                      +{a.xpReward} XP
                    </span>
                    <p className="text-xs-s text-muted">
                      {earnedMap.get(a.slug) ? new Date(earnedMap.get(a.slug)!).toLocaleDateString('es-AR') : ''}
                    </p>
                  </button>
                  {/* "Usar como título" — clicking sets selectedTitleSlug
                      so this achievement's name appears under the user's
                      username everywhere. Clicking on the current title
                      clears it. */}
                  <button
                    type="button"
                    disabled={titleMutation.isPending}
                    onClick={() => titleMutation.mutate(isCurrentTitle ? null : a.slug)}
                    className={cn(
                      'mt-1 text-[11px] font-semibold rounded-md py-1.5 px-2 border transition-colors',
                      isCurrentTitle
                        ? 'bg-accent text-accent-on border-accent flex items-center justify-center gap-1'
                        : 'bg-elevated text-text border-border hover:border-accent/60',
                    )}
                  >
                    {isCurrentTitle ? (
                      <>
                        <Check size={12} /> Título actual
                      </>
                    ) : (
                      'Usar como título'
                    )}
                  </button>
                </motion.div>
              );
            })}
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
                  +{a.xpReward} XP
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
