import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, Player } from '@/shared/types/api';

/**
 * Fetches every player in the tournament from GET /api/v1/players. 48 teams
 * × 26 = 1248 players, plus a handful of provisional rosters >26 → ~1280.
 *
 * The previous version asked for `limit=400` which silently truncated the
 * response — most teams ended up missing from the fantasy picker. Now we
 * ask for everything in one shot.
 */
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Player>>('/players', {
        params: { limit: 2000, offset: 0 },
      });
      return data.data;
    },
    staleTime: 60 * 60 * 1000, // 1h — rosters don't change mid-tournament
    retry: false,
  });
}
