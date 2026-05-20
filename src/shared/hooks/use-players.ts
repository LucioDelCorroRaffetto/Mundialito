import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, Player } from '@/shared/types/api';

/**
 * Fetches all players from GET /api/v1/players.
 * Requests up to 400 records (48 teams x up to ~8 players each) in one shot.
 * Players data is stable for the duration of the tournament.
 */
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Player>>('/players', {
        params: { limit: 400, offset: 0 },
      });
      return data.data;
    },
    staleTime: 60 * 60 * 1000, // 1h — rosters don't change mid-tournament
    retry: false,
  });
}
