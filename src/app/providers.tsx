import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '@/theme/theme-provider';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 2-minute stale window: returning users see instant cached content
      // (reduces LCP on revisits dramatically — no spinner on nav)
      staleTime: 1000 * 60 * 2,
      // Keep unused cache for 10 minutes so back-navigation is instant
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export function Providers() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors />
        </QueryClientProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
