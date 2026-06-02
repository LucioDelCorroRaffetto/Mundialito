import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  /**
   * XP granted by this logro. Kept as the source-of-truth value from the
   * catalog; previously this was added to the prediction score, now it
   * feeds the level/title system instead.
   */
  xpReward: number;
  earnedAt?: string;
  /**
   * True only on /achievements/mine when this logro is the one the user
   * currently has selected as their displayed title.
   */
  isSelectedTitle?: boolean;
}

export function useAllAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Achievement[] }>('/achievements');
      return data;
    },
  });
}

export function useMyAchievements() {
  return useQuery({
    queryKey: ['achievements', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Achievement[] }>('/achievements/mine');
      return data;
    },
  });
}
