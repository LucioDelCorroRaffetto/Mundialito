import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export const ALLOWED_REACTIONS = ['😂', '🔥', '💀', '🎯', '🤡', '⚽'] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export interface PredictionReactionSummary {
  predictionId: number;
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

function reactionsQueryKey(matchId: number | undefined, leagueId: number | null | undefined) {
  return ['reactions', 'match', matchId, leagueId] as const;
}

export function useMatchReactions(matchId: number | undefined, leagueId: number | null | undefined) {
  return useQuery({
    queryKey: reactionsQueryKey(matchId, leagueId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: PredictionReactionSummary[] }>(
        `/predictions/match/${matchId}/reactions`,
        { params: { leagueId } },
      );
      return data.data;
    },
    enabled: matchId !== undefined && leagueId != null,
    staleTime: 30_000,
  });
}

export function useToggleReaction(matchId: number | undefined, leagueId: number | null | undefined) {
  const qc = useQueryClient();
  const queryKey = reactionsQueryKey(matchId, leagueId);

  return useMutation({
    mutationFn: async ({ predictionId, emoji }: { predictionId: number; emoji: AllowedReaction }) => {
      const { data } = await apiClient.post<{ data: { reacted: boolean } }>(
        `/predictions/${predictionId}/reactions`,
        { emoji },
      );
      return data.data;
    },
    onMutate: async ({ predictionId, emoji }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<PredictionReactionSummary[]>(queryKey);

      qc.setQueryData<PredictionReactionSummary[]>(queryKey, (old = []) => {
        const idx = old.findIndex((r) => r.predictionId === predictionId && r.emoji === emoji);
        if (idx === -1) {
          return [...old, { predictionId, emoji, count: 1, reactedByMe: true }];
        }
        const row = old[idx];
        const nextCount = row.count - 1;
        const next = [...old];
        if (nextCount <= 0) {
          next.splice(idx, 1);
        } else {
          next[idx] = { ...row, count: nextCount, reactedByMe: false };
        }
        return next;
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });
}
