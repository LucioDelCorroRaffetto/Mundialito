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

export type LiveStatus =
  | 'in_play'
  | 'half_time'
  | 'cooling_break'
  | 'extra_time_break'
  | 'penalty_shootout'
  | 'full_time';

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
  status: 'scheduled' | 'live' | 'finished' | 'suspended';
  /**
   * Sub-estado mientras está en vivo: 'in_play' | 'half_time' |
   * 'extra_time_break' | 'penalty_shootout' | 'full_time' | null.
   * Permite distinguir "Entretiempo" del juego activo en la UI sin
   * inferirlo del timeline. Si el feed no lo aporta, queda null.
   */
  liveStatus: LiveStatus | null;
  /** Último minuto reportado por FIFA (ej. "67'", "90'+3'"). null si no hay eventos aún. */
  currentMinute: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /**
   * 1 cuando el cruce se definió por PENALES. El marcador guardado ya trae +1
   * al ganador; este flag deja anotar "(pen.)" en el cuadro/lista sin el
   * timeline. Ausente en payloads viejos ⇒ tratar como 0.
   */
  decidedByPenalties?: number;
  /**
   * Ganador de la tanda de penales como LADO del partido ('home' | 'away'),
   * independiente del marcador. Señal que usa el CUADRO para avanzar al ganador
   * cuando el resultado guardado es un empate (sin bump). No afecta el marcador
   * ni el scoring. Ausente/null ⇒ el cruce no se definió por penales (o el
   * ganador viene por bump en el marcador). */
  penaltyWinner?: 'home' | 'away' | null;
  // Solo lo devuelve GET /matches/:id (no la lista). Acumulados por jugador.
  events?: MatchEvent[];
  // Timeline minuto-a-minuto: cada gol/asist/tarjeta en su instante.
  timeline?: MatchTimelineEvent[];
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

/** Evento individual con minuto — para el timeline en match-detail. */
export interface MatchTimelineEvent {
  id: number;
  /**
   * 'penalty_goal' / 'penalty_miss' / 'penalty_save' son exclusivos de la
   * tanda (period=5). NO cuentan como gol en el juego ni en el fantasy.
   */
  type: 'goal' | 'own_goal' | 'assist' | 'yellow' | 'red' | 'sub_in' | 'sub_out' | 'penalty_awarded' | 'penalty_miss' | 'penalty_save' | 'penalty_goal';
  minute: number | null;
  /** 1=1T, 2=2T, 3=ET1, 4=ET2, 5=penales (normalizado por el sync). */
  period: number | null;
  playerId: number;
  playerName: string;
  teamId: number;
  teamCode: string;
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
  /** CSV de roles cortos: "LW,LB" o "ST". null si Wikipedia no publicó info. */
  subPosition: string | null;
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

/**
 * Desglose de puntos fantasy de un jugador en una fecha cerrada.
 * Viene dentro de cada entrada del lineup cuando la fecha ya cerró.
 */
export interface FantasyPlayerBreakdown {
  played: boolean;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCard: boolean;
  /** Puntos antes de aplicar el multiplicador de capitán/vice. */
  basePoints: number;
  /** Puntos finales (basePoints × multiplicador). */
  totalPoints: number;
}

// ─── Wrapped ─────────────────────────────────────────────────────────────────

export interface WrappedBestHit {
  matchId: number;
  homeScore: number;
  awayScore: number;
  rarity: number | null;
  homeTeam: { id: number; name: string; flag: string } | null;
  awayTeam: { id: number; name: string; flag: string } | null;
}

export interface WrappedPerLeague {
  leagueId: number;
  name: string;
  position: number;
  points: number;
}

export interface WrappedNearestRival {
  userId: number;
  points: number;
  position: number;
}

export interface WrappedTeamRef {
  id: number;
  name: string;
  flag: string;
}

export interface WrappedChampionPick {
  teamId: number;
  name: string;
  flag: string;
  correct: boolean;
  points: number;
}

export interface WrappedFantasy {
  points: number;
  rank: number;
}

export interface WrappedAchievement {
  slug: string;
  name: string;
  icon: string;
  xpReward: number;
  earnedAt: string;
}

export interface Wrapped {
  totalPoints: number;
  exactCount: number;
  correctCount: number;
  totalPredictions: number;
  accuracy: number;
  globalRank: number | null;
  perLeague: WrappedPerLeague[];
  longestStreak: number;
  bestHit: WrappedBestHit | null;
  nearestRival: WrappedNearestRival | null;
  mostPredictedTeam: WrappedTeamRef | null;
  championPick: WrappedChampionPick | null;
  fantasy: WrappedFantasy | null;
  topAchievements: WrappedAchievement[];
  xp: number;
  level: number;
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
