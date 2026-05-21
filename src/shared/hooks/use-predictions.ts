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

/** All my predictions (global — one per match) */
export function useMyPredictions() {
  return useQuery({
    queryKey: ['predictions', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Prediction>>('/predictions/mine');
      return data;
    },
  });
}

/** My prediction for a specific match (global — no leagueId needed) */
export function useMyPredictionForMatch(matchId: number | undefined) {
  return useQuery({
    queryKey: ['prediction', matchId],
    queryFn: async () => {
      const { data } = await apiClient.get<Prediction>(`/predictions/match/${matchId}/mine`);
      return data;
    },
    enabled: matchId !== undefined,
    retry: (failureCount, error: unknown) => {
      // No retry on 404 — prediction doesn't exist yet
      if ((error as { response?: { status?: number } })?.response?.status === 404) return false;
      return failureCount < 1;
    },
  });
}

export interface UpsertPredictionInput {
  matchId: number;
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
      qc.invalidateQueries({ queryKey: ['predictions', 'mine'] });
      qc.invalidateQueries({ queryKey: ['prediction', data.matchId] });
    },
  });
}

/** Predictions for a match from all members of a given league */
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
