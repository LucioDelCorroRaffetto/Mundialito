import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { FantasyPlayerBreakdown } from '@/shared/types/api';

export interface FantasyRoundInfo {
  slug: string;
  label: string;
  deadline: string;
  isOpen: boolean;
  isCurrent: boolean;
}

export interface FantasyLineupPlayer {
  playerId: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  player: {
    id: number;
    name: string;
    position: string;
    teamId: number;
    teamCode: string;
    teamFlag: string;
    teamName: string;
  } | null;
  /** Populated only when the round is closed (deadline passed). */
  breakdown: FantasyPlayerBreakdown | null;
}

export interface FantasyLineupData {
  data: FantasyLineupPlayer[] | null;
  meta: { round: string; points: number };
}

export function useFantasyRounds() {
  return useQuery({
    queryKey: ['fantasy', 'rounds'],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: FantasyRoundInfo[];
        meta: { currentRound: string | null };
      }>('/fantasy/rounds');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useFantasyLineup(round: string | null | undefined) {
  return useQuery({
    queryKey: ['fantasy', 'lineup', round],
    queryFn: async () => {
      const { data } = await apiClient.get<FantasyLineupData>(`/fantasy/lineup/${round}`);
      return data;
    },
    enabled: !!round,
  });
}

export interface LineupPlayerInput {
  playerId: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export function useUpsertLineup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ round, players }: { round: string; players: LineupPlayerInput[] }) => {
      const { data } = await apiClient.put(`/fantasy/lineup/${round}`, { round, players });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['fantasy', 'lineup', vars.round] });
      qc.invalidateQueries({ queryKey: ['fantasy', 'rounds'] });
    },
  });
}
