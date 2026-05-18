import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, League } from '@/shared/types/api';

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
