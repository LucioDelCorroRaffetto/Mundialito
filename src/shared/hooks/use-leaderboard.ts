import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface TopBadge {
  slug: string;
  name: string;
  icon: string;
  tier: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
  /** Bonus pts coming from logros. Counted toward totalPoints only once the
   *  Mundial kicks off (see meta.bonusesCountTowardRank). */
  achievementBonus?: number;
  leagueCount: number;
  predictionCount: number;
  topBadge: TopBadge | null;
}

export interface GlobalLeaderboardResponse {
  data: LeaderboardEntry[];
  meta: {
    limit: number;
    offset: number;
    total: number;
    /** False until the opening match kicks off. While false, totalPoints
     *  reflects prediction points only; achievement bonuses are returned
     *  on each entry but not folded into the rank. */
    bonusesCountTowardRank?: boolean;
  };
}

export function useGlobalLeaderboard(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['global-leaderboard', limit, offset],
    queryFn: async () => {
      const { data } = await apiClient.get<GlobalLeaderboardResponse>('/users/leaderboard', {
        params: { limit, offset },
      });
      return data;
    },
    staleTime: 60_000, // 1 minute
  });
}
