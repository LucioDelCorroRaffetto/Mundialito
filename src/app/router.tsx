import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/shared/components/layout/app-shell';
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

export const router = createBrowserRouter([
  { path: '/', element: <SplashPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/home', element: <HomePage /> },
      { path: '/matches', element: <MatchesPage /> },
      { path: '/matches/:id', element: <MatchDetailPage /> },
      { path: '/leagues', element: <LeaguesPage /> },
      { path: '/leagues/create', element: <LeagueCreatePage /> },
      { path: '/leagues/join', element: <LeagueJoinPage /> },
      { path: '/leagues/:id', element: <LeagueDetailPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
