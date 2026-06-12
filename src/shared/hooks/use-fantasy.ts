import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { Player, FantasyStandingEntry } from '@/shared/types/api';

export interface FantasyTeam {
  id: number;
  userId: number;
  leagueId: number | null;
  name: string;
  totalPoints: number;
  updatedAt: string;
}

export interface FantasySquadPlayer extends Player {
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  fantasyPoints: number;
}

export interface FantasyTeamWithSquad {
  team: FantasyTeam | null;
  squad: FantasySquadPlayer[];
  round?: string;
  lineupHidden?: boolean;
}

/** Body de PUT /fantasy/squad — plantel completo + titulares + capitán. */
export interface UpdateSquadInput {
  playerIds: number[];
  starterIds: number[];
  captainId: number;
}

/** Global fantasy team — one per user, no leagueId required */
export function useMyFantasyTeam() {
  return useQuery({
    queryKey: ['fantasy', 'team'],
    queryFn: async () => {
      const { data } = await apiClient.get<FantasyTeamWithSquad>('/fantasy/my-team');
      return data;
    },
  });
}

export function useUpdateFantasySquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSquadInput) => {
      const { data } = await apiClient.put<FantasyTeamWithSquad>('/fantasy/squad', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasy', 'team'] });
      qc.invalidateQueries({ queryKey: ['fantasy', 'standings'] });
      // Squad changes affect which players are eligible for each round's
      // lineup. Without this invalidate, the lineup tab keeps showing
      // already-removed players until manual refresh.
      qc.invalidateQueries({ queryKey: ['fantasy', 'lineup'] });
    },
  });
}

/** Fantasy team of any user (read-only, for standings viewer).
 *  Optional `round` viewer: lets the drawer flip between Fecha 1 / Fecha 2 /
 *  etc. to compare lineups across stages without leaving the same modal.
 *  When omitted, the server picks the current round (with fallback to the
 *  user's last saved lineup if the current round is still empty). */
export function useUserFantasyTeam(userId: number | null, round?: string | null) {
  return useQuery({
    queryKey: ['fantasy', 'team', userId, round ?? null],
    queryFn: async () => {
      const params = round ? { round } : undefined;
      const { data } = await apiClient.get<FantasyTeamWithSquad>(
        `/fantasy/team/${userId}`,
        { params },
      );
      return data;
    },
    enabled: userId != null,
  });
}

/** Puntos del usuario por round (lee de la cache fantasy_round_scores).
 *  Devuelve solo los rounds que ya tienen score; el cliente completa con 0. */
export function useUserFantasyPointsByRound(userId: number | null) {
  return useQuery({
    queryKey: ['fantasy', 'points-by-round', userId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: { round: string; points: number }[] }>(
        `/fantasy/team/${userId}/points-by-round`,
      );
      return data.data;
    },
    enabled: userId != null,
    staleTime: 30_000,
  });
}

/** Tabla de posiciones fantasy global (o de una liga si se pasa leagueId). */
export function useFantasyStandings(leagueId?: number) {
  return useQuery({
    queryKey: ['fantasy', 'standings', leagueId ?? 'global'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: FantasyStandingEntry[] }>(
        '/fantasy/standings',
        leagueId != null ? { params: { leagueId } } : undefined
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}
