import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, Match } from '@/shared/types/api';

export interface UseMatchesParams {
  status?: 'scheduled' | 'live' | 'finished';
  from?: string;
  to?: string;
  group?: string;
  limit?: number;
}

export function useMatches(params: UseMatchesParams = {}) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Match>>('/matches', { params });
      return data;
    },
  });
}

export function useMatch(id: number | undefined) {
  return useQuery({
    queryKey: ['match', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Match>(`/matches/${id}`);
      return data;
    },
    enabled: id !== undefined && Number.isInteger(id),
  });
}
