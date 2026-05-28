import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface TournamentPredictionData {
  id?: number;
  leagueId: number;
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  points?: number | null;
}

export function useTournamentPrediction(leagueId: number | undefined) {
  return useQuery({
    queryKey: ['tournament-prediction', leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<TournamentPredictionData>('/tournament-predictions', {
        params: { leagueId },
      });
      return data;
    },
    enabled: leagueId !== undefined,
  });
}

/** All my tournament predictions across every league — used to detect the
 *  first-ever pick (empty list ⇒ saving propagates to all leagues). */
export function useMyTournamentPredictions() {
  return useQuery({
    queryKey: ['tournament-prediction', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: TournamentPredictionData[]; meta: { total: number } }>(
        '/tournament-predictions/mine',
      );
      return data;
    },
  });
}

export interface UpsertTournamentPredictionInput {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  /** Omit to write the same pick to every league the user belongs to. */
  leagueId?: number;
}

export function useUpsertTournamentPrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertTournamentPredictionInput) => {
      const { data } = await apiClient.post('/tournament-predictions', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-prediction'] });
    },
  });
}
