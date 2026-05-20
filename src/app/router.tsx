import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/shared/components/layout/app-shell';
import { RequireAuth } from '@/shared/components/require-auth';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { SplashPage } from '@/pages/splash';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { HomePage } from '@/pages/home';
import { MatchesPage } from '@/pages/matches';
import { MatchDetailPage } from '@/pages/match-detail';
import { LeaguesPage } from '@/pages/leagues';
import { LeagueDetailPage } from '@/pages/league-detail';
import { LeagueCreatePage } from '@/pages/league-create';
import { LeagueJoinPage } from '@/pages/league-join';
import { ProfilePage } from '@/pages/profile';
import { SettingsPage } from '@/pages/settings';
import { LeagueInvitePage } from '@/pages/league-invite';
import { FantasyPage } from '@/pages/fantasy';
import { AchievementsPage } from '@/pages/achievements';
import { AdminPage } from '@/pages/admin';

export const router = createBrowserRouter([
  { path: '/', element: <ErrorBoundary><SplashPage /></ErrorBoundary> },
  { path: '/login', element: <ErrorBoundary><LoginPage /></ErrorBoundary> },
  { path: '/register', element: <ErrorBoundary><RegisterPage /></ErrorBoundary> },
  { path: '/j/:code', element: <ErrorBoundary><LeagueInvitePage /></ErrorBoundary> },
  {
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { path: '/home', element: <ErrorBoundary><HomePage /></ErrorBoundary> },
      { path: '/matches', element: <ErrorBoundary><MatchesPage /></ErrorBoundary> },
      { path: '/matches/:id', element: <ErrorBoundary><MatchDetailPage /></ErrorBoundary> },
      { path: '/leagues', element: <ErrorBoundary><LeaguesPage /></ErrorBoundary> },
      { path: '/leagues/create', element: <ErrorBoundary><LeagueCreatePage /></ErrorBoundary> },
      { path: '/leagues/join', element: <ErrorBoundary><LeagueJoinPage /></ErrorBoundary> },
      { path: '/leagues/:id', element: <ErrorBoundary><LeagueDetailPage /></ErrorBoundary> },
      { path: '/profile', element: <ErrorBoundary><ProfilePage /></ErrorBoundary> },
      { path: '/settings', element: <ErrorBoundary><SettingsPage /></ErrorBoundary> },
      { path: '/fantasy', element: <ErrorBoundary><FantasyPage /></ErrorBoundary> },
      { path: '/achievements', element: <ErrorBoundary><AchievementsPage /></ErrorBoundary> },
      { path: '/admin', element: <ErrorBoundary><AdminPage /></ErrorBoundary> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
