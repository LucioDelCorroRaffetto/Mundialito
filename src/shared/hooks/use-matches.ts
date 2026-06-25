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
    // While a match is live, poll every 15s so the detail view reflects the
    // running score y la cronología con poco lag. El backend refresca el vivo
    // (ESPN score + FIFA timeline) cada 20s; muestreando a 15s el delay total
    // backend+frontend queda en ~35s en vez de los ~90s que daban los 45s+45s.
    // Stops polling once the match is finished/scheduled to avoid pointless
    // traffic. `query.state.data` is the last fetched match.
    refetchInterval: (query) => {
      const m = query.state.data as Match | undefined;
      if (!m) return false;
      if (m.status === 'live') return 15_000;
      // Poll during the kickoff window: lock has passed but backend hasn't
      // flipped to live yet (FIFA sync lag). Stop once match is finished.
      if (
        m.status === 'scheduled' &&
        new Date(m.predictionLockUtc).getTime() <= Date.now()
      ) return 20_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });
}
