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
      // The API returns either a single Prediction row when targeting one
      // league, or `{ data: Prediction[] }` when propagating to multiple
      // leagues. We normalise to an array so the invalidation logic is
      // the same regardless of how many rows came back.
      const { data } = await apiClient.post<Prediction | { data: Prediction[] }>(
        '/predictions',
        input,
      );
      const rows: Prediction[] = Array.isArray((data as any).data)
        ? (data as { data: Prediction[] }).data
        : [data as Prediction];
      return { rows, matchId: rows[0]?.matchId ?? input.matchId };
    },
    onSuccess: ({ matchId }) => {
      qc.invalidateQueries({ queryKey: ['predictions', 'mine'] });
      qc.invalidateQueries({ queryKey: ['prediction', matchId] });
      qc.invalidateQueries({ queryKey: ['predictions', 'league-match', matchId] });
      qc.invalidateQueries({ queryKey: ['leagues', 'mine'] });
      qc.invalidateQueries({ queryKey: ['leagues', 'standings'] });
    },
    // On a 409 LOCKED (or any error) we need to refetch the prediction so
    // the UI doesn't keep displaying the optimistic local value the user
    // typed — otherwise after the lock fires the user still sees their
    // last attempt as if it had saved. Invalidating brings back the
    // server-side truth.
    onError: (_err, input) => {
      qc.invalidateQueries({ queryKey: ['prediction', input.matchId] });
      qc.invalidateQueries({ queryKey: ['predictions', 'mine'] });
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
    // Refresh cada 60s mientras la pestaña esté activa: cuando el sync FIFA
    // recalcula `predictions.points` al terminar un partido, el cliente que
    // tenía la página abierta no se enteraba — los `+X pts` no aparecían
    // hasta que recargara. Con este intervalo, la columna de puntos por
    // pronóstico se actualiza sola en los minutos posteriores al final.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    // Sin staleTime: queremos que cada montaje del componente (cambiar de
    // tab de liga y volver) traiga fresco, no la versión cacheada que
    // todavía tenía points=null.
    staleTime: 0,
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
