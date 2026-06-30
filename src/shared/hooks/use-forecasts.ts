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
  reachR16: number;
  reachQF: number;
  reachSF: number;
  reachFinal: number;
  winTournament: number;
  expectedPoints: number;
  topOfGroup: number;
}

/**
 * Pronóstico estadístico para un partido (Poisson + Elo).
 *
 * `homeTeamId`/`awayTeamId` son opcionales: en los cruces de eliminación la DB
 * guarda TBD en los equipos del partido, así que el front resuelve los equipos
 * reales vía proyección del cuadro y los pasa acá para que el modelo no calcule
 * TBD vs TBD (un 50/50 simétrico sin sentido).
 */
export function useMatchForecast(
  matchId: number | undefined,
  homeTeamId?: number,
  awayTeamId?: number,
) {
  return useQuery({
    queryKey: ['forecast', 'match', matchId, homeTeamId ?? null, awayTeamId ?? null],
    queryFn: async () => {
      const params =
        homeTeamId != null && awayTeamId != null
          ? { home: homeTeamId, away: awayTeamId }
          : undefined;
      const { data } = await apiClient.get<{ data: MatchForecast }>(
        `/forecasts/match/${matchId}`,
        { params },
      );
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
