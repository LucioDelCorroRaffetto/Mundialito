import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
  leagueCount: number;
  predictionCount: number;
}

export interface GlobalLeaderboardResponse {
  data: LeaderboardEntry[];
  meta: { limit: number; offset: number; total: number };
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
