import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface MatchForecast {
  homeWin: number;
  draw: number;
  awayWin: number;
  topScores: { home: number; away: number; prob: number }[];
  lambdaHome: number;
  lambdaAway: number;
  homeTeamId: number;
  awayTeamId: number;
}

export interface TournamentForecastRow {
  teamId: number;
  teamCode: string;
  teamName: string;
  teamFlag: string;
  group: string;
  reachR32: number;
  expectedPoints: number;
  topOfGroup: number;
}

/** Pronóstico estadístico para un partido (Poisson + Elo). */
export function useMatchForecast(matchId: number | undefined) {
  return useQuery({
    queryKey: ['forecast', 'match', matchId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: MatchForecast }>(`/forecasts/match/${matchId}`);
      return data.data;
    },
    enabled: matchId !== undefined,
    staleTime: 5 * 60_000,
  });
}

/** Monte Carlo de fase de grupos — % de clasificación a R32 por equipo. */
export function useTournamentForecast() {
  return useQuery({
    queryKey: ['forecast', 'tournament'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: TournamentForecastRow[] }>('/forecasts/tournament');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });
}
