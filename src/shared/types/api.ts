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
  // Solo lo devuelve GET /matches/:id (no la lista). Acumulados por jugador.
  events?: MatchEvent[];
}

export interface MatchEvent {
  playerId: number;
  playerName: string;
  teamId: number;
  teamCode: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCard: boolean;
  shirtNumber: number | null;
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
  description: string | null;
  imageUrl: string | null;
  predictionsVisibility: 'after_kickoff' | 'always';
  // Auto-created hidden league so the user can predict without joining
  // anything. Filtered out of public listings; shown to the owner as
  // 'Mis pronósticos'.
  isPersonal?: boolean;
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
  photoUrl: string | null;
}

export interface ApiList<T> {
  data: T[];
  meta: { total: number };
}

export interface ApiError {
  error: { code: string; message: string };
}

// ─── Fantasy ─────────────────────────────────────────────────────────────────

/** Stats de un jugador en un partido (formulario admin). */
export interface PlayerMatchStats {
  playerId: number;
  played: boolean;
  goals: number;
  assists: number;
  yellowCards: number;
  redCard: boolean;
}

/** Jugador devuelto por GET /admin/matches/:matchId/player-stats */
export interface MatchStatPlayer {
  id: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  teamId: number;
  shirtNumber: number | null;
}

/** Respuesta de GET /admin/matches/:matchId/player-stats (dentro del envelope { data }). */
export interface MatchPlayerStatsResponse {
  players: MatchStatPlayer[];
  stats: PlayerMatchStats[];
}

/** Una fila de la tabla de posiciones fantasy. */
export interface FantasyStandingEntry {
  rank: number;
  teamName: string;
  userId: number;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
}
