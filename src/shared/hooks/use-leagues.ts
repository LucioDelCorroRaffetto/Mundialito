import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, League } from '@/shared/types/api';

export interface LeaguePreview {
  id: number;
  name: string;
  code: string;
  isPublic: boolean;
  stakesMeme: string | null;
  memberCount: number;
  adminName: string | null;
}

export interface StandingRow {
  userId: number;
  username: string;
  avatarUrl: string | null;
  points: number;
  matchesPlayed: number;
  position: number;
}

export function useMyLeagues() {
  return useQuery({
    queryKey: ['leagues', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<League>>('/leagues/mine');
      return data;
    },
  });
}

export function useLeague(id: number | undefined) {
  return useQuery({
    queryKey: ['league', id],
    queryFn: async () => {
      const { data } = await apiClient.get<League>(`/leagues/${id}`);
      return data;
    },
    enabled: id !== undefined && Number.isInteger(id),
  });
}

export function useLeagueByCode(code: string | undefined) {
  return useQuery({
    queryKey: ['league', 'by-code', code],
    queryFn: async () => {
      const { data } = await apiClient.get<LeaguePreview>(`/leagues/by-code/${code}`);
      return data;
    },
    enabled: !!code && code.length >= 4,
    retry: false,
  });
}

export function useLeagueStandings(id: number | undefined) {
  return useQuery({
    queryKey: ['league', id, 'standings'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: StandingRow[]; meta: { total: number } }>(
        `/leagues/${id}/standings`
      );
      return data;
    },
    enabled: id !== undefined && Number.isInteger(id),
  });
}

export function useJoinLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await apiClient.post<League>('/leagues/join', { code });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues', 'mine'] });
    },
  });
}

export function useCreateLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; isPublic: boolean; stakesMeme?: string | null }) => {
      const { data } = await apiClient.post<League>('/leagues', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues', 'mine'] });
    },
  });
}

export function useSearchLeagues(query: string) {
  return useQuery({
    queryKey: ['leagues', 'search', query],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<League>>('/leagues/public/search', {
        params: { q: query, limit: 20 },
      });
      return data;
    },
    enabled: query.length >= 2,
  });
}

export function usePublicLeagues() {
  return useQuery({
    queryKey: ['leagues', 'public'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<League>>('/leagues/public/search', {
        params: { limit: 20 },
      });
      return data;
    },
  });
}

export function useLeaveLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: number) => {
      await apiClient.post(`/leagues/${leagueId}/leave`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues', 'mine'] });
    },
  });
}
