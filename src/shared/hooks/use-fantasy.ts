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

/** Fantasy team of any user (read-only, for standings viewer). */
export function useUserFantasyTeam(userId: number | null) {
  return useQuery({
    queryKey: ['fantasy', 'team', userId],
    queryFn: async () => {
      const { data } = await apiClient.get<FantasyTeamWithSquad>(`/fantasy/team/${userId}`);
      return data;
    },
    enabled: userId != null,
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
