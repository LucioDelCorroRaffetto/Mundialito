import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface TournamentPredictionData {
  id?: number;
  leagueId: number;
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  bestDefenseTeamId: number | null;
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

export interface OutcomeTeamRef {
  id: number;
  code: string;
  name: string;
}

export interface OutcomeCandidate {
  team: OutcomeTeamRef | null;
  included: boolean;
  gap: number;
  reason: string;
}

export interface DefenseTableRow {
  team: OutcomeTeamRef | null;
  played: number;
  goalsAgainst: number;
  avg: number;
}

/** Estado provisional pre-final: mismas categorías "de tabla", sin podio. */
export interface ProvisionalOutcomeData {
  surprises: OutcomeCandidate[];
  disappointments: OutcomeCandidate[];
  defenseTable: DefenseTableRow[];
  topScorers: Array<{ id: number; name: string; goals: number }>;
}

export interface TournamentOutcomeData {
  resolved: boolean;
  champion?: OutcomeTeamRef | null;
  runnerUp?: OutcomeTeamRef | null;
  thirdPlace?: OutcomeTeamRef | null;
  topScorers?: Array<{ id: number; name: string }>;
  bestDefense?: OutcomeTeamRef[];
  defenseTable?: DefenseTableRow[];
  surprises?: OutcomeCandidate[];
  disappointments?: OutcomeCandidate[];
  /** Presente solo cuando resolved es false y el torneo ya está en marcha. */
  provisional?: ProvisionalOutcomeData;
}

/**
 * Resultado resuelto del torneo con las explicaciones de sorpresa/decepción.
 * `resolved` queda false hasta que se juegue la final; recién ahí el back
 * libera los puntos y este endpoint devuelve el porqué de cada sí y cada no.
 */
export function useTournamentOutcome() {
  return useQuery({
    queryKey: ['tournament-outcome'],
    queryFn: async () => {
      const { data } = await apiClient.get<TournamentOutcomeData>('/tournament-predictions/outcome');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Picks de Copa de un miembro de la liga (GET /leagues/:id/tournament-predictions). */
export interface LeagueTournamentPick {
  userId: number;
  username: string;
  avatarUrl: string | null;
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorerPlayerId: number | null;
  topScorerName: string | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  bestDefenseTeamId: number | null;
  points: number | null;
}

/**
 * Picks de Copa de TODOS los miembros de una liga. El server solo devuelve
 * los ajenos después del lock (anti-copia); `meta.locked` lo indica.
 */
export function useLeagueTournamentPicks(leagueId: number | undefined) {
  return useQuery({
    queryKey: ['league-tournament-picks', leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: LeagueTournamentPick[]; meta: { total: number; locked: boolean } }>(
        `/leagues/${leagueId}/tournament-predictions`,
      );
      return data;
    },
    enabled: leagueId !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}

export interface UpsertTournamentPredictionInput {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  bestDefenseTeamId: number | null;
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
