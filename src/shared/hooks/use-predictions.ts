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
  meta: {
    total: number;
    matchStatus: string;
    revealed: boolean;
    visibility?: 'after_kickoff' | 'always';
  };
}

/** All my predictions, optionally scoped to a league. */
export function useMyPredictions(leagueId?: number | null) {
  return useQuery({
    queryKey: ['predictions', 'mine', leagueId ?? null],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiList<Prediction>>('/predictions/mine', {
        params: leagueId != null ? { leagueId } : undefined,
      });
      return data;
    },
  });
}

/** My prediction for a specific match, scoped to a league when provided.
 *  Returns null (not an error) when no prediction exists yet. */
export function useMyPredictionForMatch(
  matchId: number | undefined,
  leagueId?: number | null,
) {
  return useQuery({
    queryKey: ['prediction', matchId, leagueId ?? null],
    queryFn: async (): Promise<Prediction | null> => {
      const { data } = await apiClient.get<{ data: Prediction | null }>(
        `/predictions/match/${matchId}/mine`,
        { params: leagueId != null ? { leagueId } : undefined },
      );
      return data.data;
    },
    enabled: matchId !== undefined,
  });
}

export interface UpsertPredictionInput {
  matchId: number;
  homeScore: number;
  awayScore: number;
  /** Optional. When omitted on the *first* prediction for a match, the API
   *  propagates the result to every league the user belongs to. Required on
   *  subsequent edits to disambiguate which league's prediction to update. */
  leagueId?: number;
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
      qc.invalidateQueries({ queryKey: ['predictions', 'league-match', data.matchId] });
      qc.invalidateQueries({ queryKey: ['leagues', 'mine'] });
      qc.invalidateQueries({ queryKey: ['leagues', 'standings'] });
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
