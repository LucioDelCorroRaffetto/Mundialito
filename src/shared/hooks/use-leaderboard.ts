import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { LevelInfo } from '@/shared/lib/levels';

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
  leagueCount: number;
  predictionCount: number;
  topBadge: TopBadge | null;
  /** Achievement-derived level (separate from totalPoints). */
  level?: LevelInfo;
  /** Currently displayed title (if user picked one). */
  title?: { slug: string; name: string } | null;
}

export interface GlobalLeaderboardResponse {
  data: LeaderboardEntry[];
  meta: {
    limit: number;
    offset: number;
    total: number;
    /**
     * Always false in the XP-based model — achievements no longer
     * contribute to the leaderboard score. Kept on the wire for backward
     * compatibility with older clients that branched on this flag.
     */
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
