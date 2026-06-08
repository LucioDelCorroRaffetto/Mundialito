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

// Sync auth state across tabs: if one tab logs out (clears the persisted
// key) or logs in as a different user, every other open tab should follow
// suit instead of letting a stale token continue making authenticated
// requests. Zustand's `persist` writes to localStorage on change but
// doesn't subscribe to the storage event — we wire that up here.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'mundialito_auth') return;
    if (e.newValue == null) {
      // Key was removed in the other tab → logout here too.
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const parsed = JSON.parse(e.newValue) as { state?: AuthState };
      if (parsed.state) {
        useAuthStore.setState({
          user: parsed.state.user ?? null,
          token: parsed.state.token ?? null,
          isAuthenticated: parsed.state.isAuthenticated ?? false,
        });
      }
    } catch {
      // Malformed payload — fail safe to logged-out.
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    }
  });
}
