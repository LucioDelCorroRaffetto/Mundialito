import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { useAuthStore } from '@/shared/stores/auth-store';
import type { User } from '@/shared/types/api';

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export function useLogin() {
  const storeLogin = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await apiClient.post<AuthResponse>('/auth/login', input);
      return data;
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.accessToken);
      // Guardar refresh token también
      localStorage.setItem('mundialito_refresh', data.refreshToken);
    },
  });
}

export function useRegister() {
  const storeLogin = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { data } = await apiClient.post<AuthResponse>('/auth/register', input);
      return data;
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.accessToken);
      localStorage.setItem('mundialito_refresh', data.refreshToken);
    },
  });
}

export function useUpdateUsername() {
  const storeLogin = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: async (username: string) => {
      const { data } = await apiClient.patch<User>('/users/me', { username });
      return data;
    },
    onSuccess: (data) => {
      if (token) storeLogin(data, token);
    },
  });
}

export function useUpdateAvatar() {
  const storeLogin = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      const { data } = await apiClient.patch<User>('/users/me', { avatarUrl });
      return data;
    },
    onSuccess: (data) => {
      if (token) storeLogin(data, token);
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (confirmUsername: string) => {
      await apiClient.delete('/auth/me', { data: { confirmUsername } });
    },
  });
}

export function useMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await apiClient.get<User>('/auth/me');
      return data;
    },
    enabled: isAuthenticated,
  });
}
