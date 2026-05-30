import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export interface UserPublicProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  adminProfile: {
    role: string;
    emoji: string;
    bio: string;
  } | null;
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

export interface AdminProfilePointer {
  id: number;
  username: string;
  avatarUrl: string | null;
}

/** Returns the public pointer to the Presidente FIFA account so we can link
 *  to it from anywhere without hardcoding an id. */
export function useAdminProfile() {
  return useQuery({
    queryKey: ['users', 'admin'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AdminProfilePointer | null }>('/users/admin');
      return data.data;
    },
    staleTime: 1000 * 60 * 60, // 1h — admin id changes basically never
  });
}
