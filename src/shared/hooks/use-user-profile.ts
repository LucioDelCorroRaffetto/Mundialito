import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { LevelInfo } from '@/shared/lib/levels';

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
  /** Achievement-derived level (computed live from earned achievements). */
  level?: LevelInfo;
  /** Currently displayed title (if user picked one). */
  title?: { slug: string; name: string } | null;
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
    xpReward: number;
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

export interface UserPredictionHistoryItem {
  predictionId: number;
  matchId: number;
  round: string;
  kickoffUtc: string;
  matchStatus: string;
  prediction: { homeScore: number; awayScore: number };
  /** Marcador real; null si el partido arrancó pero todavía no terminó. */
  result: { homeScore: number; awayScore: number } | null;
  points: number | null;
  outcome: 'pending' | 'exact' | 'correct' | 'missed';
  homeTeam: { name: string | null; code: string | null; flag: string | null };
  awayTeam: { name: string | null; code: string | null; flag: string | null };
}

/**
 * Historial de pronósticos de OTRO usuario (perfil ajeno). El backend solo
 * devuelve pronósticos de partidos que YA arrancaron — el gate de seguridad
 * vive en el server, nunca acá. Ordenados del más reciente al más viejo.
 */
export function useUserPredictionHistory(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'prediction-history'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: UserPredictionHistoryItem[] }>(
        `/predictions/user/${userId}/history`,
      );
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
