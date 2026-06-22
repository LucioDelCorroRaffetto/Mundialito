import { Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/shared/components/layout/app-shell';
import { RequireAuth } from '@/shared/components/require-auth';
import { RequireAdmin } from '@/shared/components/require-admin';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { lazyWithReload } from '@/shared/lib/lazy-with-reload';

// Critical-path pages stay in the main bundle so the first paint after login
// doesn't need a second network round-trip.
import { SplashPage } from '@/pages/splash';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';

// Everything else is code-split — each page becomes its own JS chunk that's
// fetched the first time the user navigates to it. This roughly halves the
// initial bundle and keeps interactive pages fast on mobile.
//
// `lazyWithReload` wraps `lazy()` to auto-reload the page when a chunk fails
// to load because the user has a stale index.html referencing an old build's
// hashes (common after a Vercel deploy). Without it the user got stuck on
// the ErrorBoundary's "Algo salió mal" screen until they manually refreshed.
const HomePage = lazyWithReload(() => import('@/pages/home').then((m) => ({ default: m.HomePage })));
const MatchesPage = lazyWithReload(() => import('@/pages/matches').then((m) => ({ default: m.MatchesPage })));
const MatchDetailPage = lazyWithReload(() => import('@/pages/match-detail').then((m) => ({ default: m.MatchDetailPage })));
const LeaguesPage = lazyWithReload(() => import('@/pages/leagues').then((m) => ({ default: m.LeaguesPage })));
const LeagueDetailPage = lazyWithReload(() => import('@/pages/league-detail').then((m) => ({ default: m.LeagueDetailPage })));
const LeagueCreatePage = lazyWithReload(() => import('@/pages/league-create').then((m) => ({ default: m.LeagueCreatePage })));
const LeagueJoinPage = lazyWithReload(() => import('@/pages/league-join').then((m) => ({ default: m.LeagueJoinPage })));
const LeagueInvitePage = lazyWithReload(() => import('@/pages/league-invite').then((m) => ({ default: m.LeagueInvitePage })));
const ProfilePage = lazyWithReload(() => import('@/pages/profile').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazyWithReload(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })));
const FantasyPage = lazyWithReload(() => import('@/pages/fantasy').then((m) => ({ default: m.FantasyPage })));
const AchievementsPage = lazyWithReload(() => import('@/pages/achievements').then((m) => ({ default: m.AchievementsPage })));
const AdminPage = lazyWithReload(() => import('@/pages/admin').then((m) => ({ default: m.AdminPage })));
const LeaderboardPage = lazyWithReload(() => import('@/pages/leaderboard').then((m) => ({ default: m.LeaderboardPage })));
const TournamentPredictionsPage = lazyWithReload(() => import('@/pages/tournament-predictions').then((m) => ({ default: m.TournamentPredictionsPage })));
const UserProfilePage = lazyWithReload(() => import('@/pages/user-profile').then((m) => ({ default: m.UserProfilePage })));
const HelpPage = lazyWithReload(() => import('@/pages/help').then((m) => ({ default: m.HelpPage })));
const StatsPage = lazyWithReload(() => import('@/pages/stats').then((m) => ({ default: m.StatsPage })));

/**
 * Minimal full-bleed fallback shown while a lazy page chunk is downloading.
 * Matches the page rhythm (small spinner centered) so users don't see a
 * jarring blank screen between routes.
 */
function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

/** Wraps the page in both an ErrorBoundary and a Suspense boundary so a
 *  failed chunk download or a runtime crash is caught in one go.
 *
 *  Transición de ruta: un fade-in sutil al montar cada página vía la clase
 *  CSS `animate-fade-in` (definida en tailwind.config). Se eligió CSS en vez
 *  de AnimatePresence de framer porque el data-router + Suspense +
 *  `lazyWithReload` hacen frágil el exit-animation (ver Gotcha #2: el chunk
 *  puede fallar y forzar reload). El CSS es inofensivo para el lazy loading
 *  y reduce-motion ya lo neutraliza (`[data-reduce-motion="true"]` en
 *  index.css). El fade envuelve el contenido, NO el fallback, así el spinner
 *  de Suspense no parpadea. */
function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <div className="animate-fade-in">{children}</div>
      </Suspense>
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <ErrorBoundary><SplashPage /></ErrorBoundary> },
  { path: '/login', element: <ErrorBoundary><LoginPage /></ErrorBoundary> },
  { path: '/register', element: <ErrorBoundary><RegisterPage /></ErrorBoundary> },
  { path: '/j/:code', element: <Page><LeagueInvitePage /></Page> },
  // Guía de onboarding — pública a propósito, para compartirla por WhatsApp
  // con amigos que todavía no tienen cuenta.
  { path: '/ayuda', element: <Page><HelpPage /></Page> },
  {
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { path: '/home', element: <Page><HomePage /></Page> },
      { path: '/matches', element: <Page><MatchesPage /></Page> },
      { path: '/matches/:id', element: <Page><MatchDetailPage /></Page> },
      { path: '/leagues', element: <Page><LeaguesPage /></Page> },
      { path: '/leagues/create', element: <Page><LeagueCreatePage /></Page> },
      { path: '/leagues/join', element: <Page><LeagueJoinPage /></Page> },
      { path: '/leagues/:id', element: <Page><LeagueDetailPage /></Page> },
      { path: '/profile', element: <Page><ProfilePage /></Page> },
      { path: '/settings', element: <Page><SettingsPage /></Page> },
      { path: '/fantasy', element: <Page><FantasyPage /></Page> },
      { path: '/achievements', element: <Page><AchievementsPage /></Page> },
      { path: '/leaderboard', element: <Page><LeaderboardPage /></Page> },
      { path: '/tournament', element: <Page><TournamentPredictionsPage /></Page> },
      { path: '/stats', element: <Page><StatsPage /></Page> },
      { path: '/u/:userId', element: <Page><UserProfilePage /></Page> },
      { path: '/admin', element: <Page><RequireAdmin><AdminPage /></RequireAdmin></Page> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
