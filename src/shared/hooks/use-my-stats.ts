import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface MyStats {
  totalPredictions: number;
  exactScores: number;
  correctResults: number;
  totalPoints: number;
  accuracy: number;
}

export function useMyStats() {
  return useQuery({
    queryKey: ['my-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: MyStats }>('/users/me/stats');
      return data.data;
    },
  });
}
