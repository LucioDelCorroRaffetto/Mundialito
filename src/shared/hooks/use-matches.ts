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

export interface UseMatchesOptions {
  /**
   * How often to refetch in the background, in milliseconds. Use this on
   * surfaces that need to react to the worker flipping a match from
   * scheduled → live/finished without a page reload (e.g. the home
   * countdown switching to the next match).
   */
  refetchInterval?: number;
}

export function useMatches(
  params: UseMatchesParams = {},
  opts: UseMatchesOptions = {},
) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Match>>('/matches', { params });
      return data;
    },
    refetchInterval: opts.refetchInterval,
    // Pause the polling when the tab is hidden so we don't hammer Render's
    // free tier with background tabs.
    refetchIntervalInBackground: false,
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
