import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { Player } from '@/shared/types/api';

export interface FantasyTeam {
  id: number;
  userId: number;
  leagueId: number;
  name: string;
  totalPoints: number;
  updatedAt: string;
}

export interface FantasySquadPlayer extends Player {
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface FantasyTeamWithSquad {
  team: FantasyTeam | null;
  squad: FantasySquadPlayer[];
}

export function useMyFantasyTeam(leagueId: number | undefined) {
  return useQuery({
    queryKey: ['fantasy', 'team', leagueId],
    queryFn: async () => {
      const { data } = await apiClient.get<FantasyTeamWithSquad>('/fantasy/my-team', {
        params: { leagueId },
      });
      return data;
    },
    enabled: leagueId !== undefined,
  });
}

export function useEnsureFantasyTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: number; name?: string }) => {
      const { data } = await apiClient.post<FantasyTeam>('/fantasy/my-team', input);
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['fantasy', 'team', variables.leagueId] });
    },
  });
}

export function useUpdateFantasySquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: number; playerIds: number[] }) => {
      const { data } = await apiClient.put<FantasyTeamWithSquad>('/fantasy/squad', input);
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['fantasy', 'team', variables.leagueId] });
    },
  });
}
