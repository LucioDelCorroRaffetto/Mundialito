import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, Team } from '@/shared/types/api';

/**
 * NOTE: depende del endpoint GET /teams que NO existe todavía en el backend.
 * Cuando se agregue, este hook funcionará sin cambios.
 * Mientras tanto, los consumidores verán `data` undefined y caerán a placeholders.
 */
export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Team>>('/teams');
      return data.data;
    },
    staleTime: 60 * 60 * 1000, // 1h — los equipos no cambian
    retry: false,
  });
}

export function useTeamMap() {
  const teams = useTeams();
  return {
    ...teams,
    data: teams.data ? new Map(teams.data.map((t) => [t.id, t])) : undefined,
  };
}
