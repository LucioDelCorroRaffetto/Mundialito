import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface UserPublicProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  stats: {
    totalPoints: number;
    totalPredictions: number;
    exactScores: number;
    correctResults: number;
    accuracy: number;
  };
  achievements: Array<{
    slug: string;
    name: string;
    description: string;
    icon: string;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    earnedAt: string;
  }>;
  leagueCount: number;
  fantasyPoints: number;
}

export function useUserProfile(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'profile'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: UserPublicProfile }>(`/users/${userId}`);
      return data.data;
    },
    enabled: !!userId,
  });
}
