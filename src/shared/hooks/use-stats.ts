import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface LeaderboardRow {
  playerId: number;
  playerName: string;
  position: string;
  photoUrl: string | null;
  teamId: number;
  teamCode: string;
  teamFlag: string;
  teamName: string;
  total: number;
}

export interface Leaderboards {
  topScorers: LeaderboardRow[];
  topAssists: LeaderboardRow[];
  topYellows: LeaderboardRow[];
  topReds: LeaderboardRow[];
}

/** Tablas de goleadores / asistencias / amarillas / rojas del torneo.
 *  Una sola call al backend devuelve las cuatro; el cliente cachea por 60s
 *  para no martillar el endpoint al cambiar entre tabs. */
export function useLeaderboards() {
  return useQuery({
    queryKey: ['stats', 'leaderboards'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Leaderboards }>('/stats/leaderboards');
      return data.data;
    },
    staleTime: 60_000,
  });
}
