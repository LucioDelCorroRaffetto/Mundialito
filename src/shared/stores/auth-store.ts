import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LevelInfo } from '@/shared/lib/levels';

interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
  // Achievement-derived prestige. xp is the source of truth; level is a
  // derived view computed by the backend (or recomputed client-side from
  // xp via computeLevel() when missing).
  xp?: number;
  level?: LevelInfo;
  title?: { slug: string; name: string } | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'mundialito_auth' }
  )
);

export const getStoredToken = () => useAuthStore.getState().token;
