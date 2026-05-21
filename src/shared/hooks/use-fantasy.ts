import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { Player } from '@/shared/types/api';

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
}

export interface FantasyTeamWithSquad {
  team: FantasyTeam | null;
  squad: FantasySquadPlayer[];
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
    mutationFn: async (input: { playerIds: number[] }) => {
      const { data } = await apiClient.put<FantasyTeamWithSquad>('/fantasy/squad', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasy', 'team'] });
    },
  });
}
