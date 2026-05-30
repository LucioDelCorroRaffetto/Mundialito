import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  pointsBonus: number;
  earnedAt?: string;
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
