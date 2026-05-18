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

export function useUpsertTournamentPrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TournamentPredictionData, 'id' | 'points'>) => {
      const { data } = await apiClient.post<TournamentPredictionData>('/tournament-predictions', input);
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['tournament-prediction', variables.leagueId] });
    },
  });
}
