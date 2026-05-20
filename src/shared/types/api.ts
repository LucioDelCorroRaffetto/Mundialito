export interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  createdAt?: string;
  isAdmin?: boolean;
}

export interface Team {
  id: number;
  name: string;
  code: string;
  flag: string;
  group: string | null;
  confederation: string | null;
}

export interface Match {
  id: number;
  matchNumber: number;
  homeTeamId: number;
  awayTeamId: number;
  kickoffUtc: string;
  predictionLockUtc: string;
  venue: string;
  city: string;
  group: string | null;
  round: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore: number | null;
  awayScore: number | null;
}

export interface Prediction {
  id: number;
  userId: number;
  matchId: number;
  leagueId: number;
  homeScore: number;
  awayScore: number;
  points: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface League {
  id: number;
  name: string;
  code: string;
  isPublic: boolean;
  adminId: number;
  stakesMeme: string | null;
  createdAt: string;
  // Enriched fields returned by /leagues/mine
  memberCount?: number;
  myPoints?: number;
  myMatchesPlayed?: number;
}

export interface Player {
  id: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  teamId: number;
  nationality: string | null;
  shirtNumber: number | null;
}

export interface ApiList<T> {
  data: T[];
  meta: { total: number };
}

export interface ApiError {
  error: { code: string; message: string };
}
