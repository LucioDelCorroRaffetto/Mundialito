import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { ApiList, Prediction } from '@/shared/types/api';

export interface LeagueMemberPrediction {
  predictionId: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  homeScore: number | null;
  awayScore: number | null;
  points: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeagueMatchPredictionsResponse {
  data: LeagueMemberPrediction[];
  meta: { total: number; matchStatus: string; revealed: boolean };
}

export function useMyPredictions(leagueId?: number) {
  return useQuery({
    queryKey: ['predictions', 'mine', leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Prediction>>('/predictions/mine', {
        params: leagueId ? { leagueId } : undefined,
      });
      return data;
    },
  });
}

export function useMyPredictionForMatch(matchId: number | undefined, leagueId: number | undefined) {
  return useQuery({
    queryKey: ['prediction', matchId, leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<Prediction>(`/predictions/match/${matchId}/mine`, {
        params: { leagueId },
      });
      return data;
    },
    enabled: matchId !== undefined && leagueId !== undefined,
    retry: (failureCount, error: any) => {
      // No retry en 404 (no hay predicción todavía)
      if (error?.response?.status === 404) return false;
      return failureCount < 1;
    },
  });
}

export interface UpsertPredictionInput {
  matchId: number;
  leagueId: number;
  homeScore: number;
  awayScore: number;
}

export function useUpsertPrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPredictionInput) => {
      const { data } = await apiClient.post<Prediction>('/predictions', input);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['predictions', 'mine', data.leagueId] });
      qc.invalidateQueries({ queryKey: ['prediction', data.matchId, data.leagueId] });
    },
  });
}

export function useLeagueMatchPredictions(matchId: number | undefined, leagueId: number | null | undefined) {
  return useQuery({
    queryKey: ['predictions', 'league-match', matchId, leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<LeagueMatchPredictionsResponse>(
        `/predictions/match/${matchId}`,
        { params: { leagueId } },
      );
      return data;
    },
    enabled: matchId !== undefined && leagueId != null,
  });
}

export function useDeletePrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/predictions/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions'] });
      qc.invalidateQueries({ queryKey: ['prediction'] });
    },
  });
}
