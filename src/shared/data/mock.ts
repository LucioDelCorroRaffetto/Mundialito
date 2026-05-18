export interface Team {
  id: number;
  code: string;
  name: string;
  flag: string;
}

export interface Match {
  id: number;
  matchNumber: number;
  matchday: number;
  round: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final';
  group?: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoffUtc: string;
  venue: string;
  city: string;
  status: 'scheduled' | 'live' | 'ht' | 'ft';
  homeScore?: number;
  awayScore?: number;
  minute?: number;
}

export interface Prediction {
  matchId: number;
  homeScore: number;
  awayScore: number;
  scorerPlayerId?: number;
  submittedAt: string;
}

export interface League {
  id: number;
  name: string;
  code: string;
  isPublic: boolean;
  memberCount: number;
  adminName: string;
  myPosition: number;
  myPoints: number;
  leader: { name: string; points: number };
}

export interface StandingsRow {
  position: number;
  userId: number;
  displayName: string;
  avatar: string;
  points: number;
  exact: number;
  result: number;
  played: number;
  trend: 'up' | 'down' | 'same';
}

export const TEAMS: Record<string, Team> = {
  ARG: { id: 1, code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
  BRA: { id: 2, code: 'BRA', name: 'Brasil', flag: '🇧🇷' },
  FRA: { id: 3, code: 'FRA', name: 'Francia', flag: '🇫🇷' },
  ENG: { id: 4, code: 'ENG', name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  ESP: { id: 5, code: 'ESP', name: 'España', flag: '🇪🇸' },
  GER: { id: 6, code: 'GER', name: 'Alemania', flag: '🇩🇪' },
  POR: { id: 7, code: 'POR', name: 'Portugal', flag: '🇵🇹' },
  MEX: { id: 8, code: 'MEX', name: 'México', flag: '🇲🇽' },
  USA: { id: 9, code: 'USA', name: 'EEUU', flag: '🇺🇸' },
  CAN: { id: 10, code: 'CAN', name: 'Canadá', flag: '🇨🇦' },
  URU: { id: 11, code: 'URU', name: 'Uruguay', flag: '🇺🇾' },
  COL: { id: 12, code: 'COL', name: 'Colombia', flag: '🇨🇴' },
  MOR: { id: 13, code: 'MOR', name: 'Marruecos', flag: '🇲🇦' },
  JPN: { id: 14, code: 'JPN', name: 'Japón', flag: '🇯🇵' },
  NED: { id: 15, code: 'NED', name: 'Países Bajos', flag: '🇳🇱' },
  AUS: { id: 16, code: 'AUS', name: 'Australia', flag: '🇦🇺' },
};

export const MATCHES: Match[] = [
  {
    id: 1, matchNumber: 1, matchday: 1, round: 'group', group: 'A',
    homeTeam: TEAMS.MEX, awayTeam: TEAMS.CAN,
    kickoffUtc: '2026-06-11T20:00:00Z', venue: 'Estadio Azteca', city: 'Ciudad de México',
    status: 'finished', homeScore: 2, awayScore: 1,
  },
  {
    id: 2, matchNumber: 2, matchday: 1, round: 'group', group: 'A',
    homeTeam: TEAMS.USA, awayTeam: TEAMS.ARG,
    kickoffUtc: '2026-06-12T00:00:00Z', venue: 'MetLife Stadium', city: 'Nueva York',
    status: 'finished', homeScore: 0, awayScore: 3,
  },
  {
    id: 3, matchNumber: 3, matchday: 1, round: 'group', group: 'B',
    homeTeam: TEAMS.BRA, awayTeam: TEAMS.JPN,
    kickoffUtc: '2026-06-12T20:00:00Z', venue: 'SoFi Stadium', city: 'Los Ángeles',
    status: 'finished', homeScore: 4, awayScore: 1,
  },
  {
    id: 4, matchNumber: 4, matchday: 1, round: 'group', group: 'C',
    homeTeam: TEAMS.FRA, awayTeam: TEAMS.URU,
    kickoffUtc: '2026-06-13T00:00:00Z', venue: 'AT&T Stadium', city: 'Dallas',
    status: 'live', homeScore: 1, awayScore: 0, minute: 67,
  },
  {
    id: 5, matchNumber: 5, matchday: 1, round: 'group', group: 'D',
    homeTeam: TEAMS.ENG, awayTeam: TEAMS.COL,
    kickoffUtc: '2026-06-13T20:00:00Z', venue: "Levi's Stadium", city: 'San Francisco', status: 'scheduled',
  },
  {
    id: 6, matchNumber: 6, matchday: 1, round: 'group', group: 'E',
    homeTeam: TEAMS.ESP, awayTeam: TEAMS.MOR,
    kickoffUtc: '2026-06-14T00:00:00Z', venue: 'Hard Rock Stadium', city: 'Miami', status: 'scheduled',
  },
  {
    id: 7, matchNumber: 7, matchday: 1, round: 'group', group: 'F',
    homeTeam: TEAMS.GER, awayTeam: TEAMS.AUS,
    kickoffUtc: '2026-06-14T20:00:00Z', venue: 'Lincoln Financial Field', city: 'Filadelfia', status: 'scheduled',
  },
  {
    id: 8, matchNumber: 8, matchday: 1, round: 'group', group: 'G',
    homeTeam: TEAMS.POR, awayTeam: TEAMS.NED,
    kickoffUtc: '2026-06-15T00:00:00Z', venue: 'BC Place', city: 'Vancouver', status: 'scheduled',
  },
  {
    id: 9, matchNumber: 9, matchday: 2, round: 'group', group: 'A',
    homeTeam: TEAMS.ARG, awayTeam: TEAMS.MEX,
    kickoffUtc: '2026-06-19T00:00:00Z', venue: 'Estadio Azteca', city: 'Ciudad de México', status: 'scheduled',
  },
  {
    id: 10, matchNumber: 10, matchday: 2, round: 'group', group: 'A',
    homeTeam: TEAMS.CAN, awayTeam: TEAMS.USA,
    kickoffUtc: '2026-06-19T20:00:00Z', venue: 'Lumen Field', city: 'Seattle', status: 'scheduled',
  },
  {
    id: 11, matchNumber: 11, matchday: 2, round: 'group', group: 'B',
    homeTeam: TEAMS.JPN, awayTeam: TEAMS.CAN,
    kickoffUtc: '2026-06-20T00:00:00Z', venue: 'Rose Bowl', city: 'Los Ángeles', status: 'scheduled',
  },
  {
    id: 12, matchNumber: 12, matchday: 2, round: 'group', group: 'C',
    homeTeam: TEAMS.URU, awayTeam: TEAMS.FRA,
    kickoffUtc: '2026-06-20T20:00:00Z', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', status: 'scheduled',
  },
];

export const MY_LEAGUES: League[] = [
  {
    id: 1, name: 'Asado de los pibes', code: 'ASADO42', isPublic: false,
    memberCount: 8, adminName: 'vos', myPosition: 2, myPoints: 47,
    leader: { name: 'Lucho D.', points: 52 },
  },
  {
    id: 2, name: 'Trabajo remoto', code: 'REMOTE7', isPublic: true,
    memberCount: 24, adminName: 'Gonza', myPosition: 7, myPoints: 39,
    leader: { name: 'Caro P.', points: 61 },
  },
  {
    id: 3, name: 'Familia Del Corro', code: 'FAMILIA9', isPublic: false,
    memberCount: 5, adminName: 'papá', myPosition: 1, myPoints: 55,
    leader: { name: 'vos', points: 55 },
  },
];

export const LEAGUE_STANDINGS: StandingsRow[] = [
  { position: 1, userId: 99, displayName: 'vos', avatar: 'V', points: 52, exact: 4, result: 8, played: 12, trend: 'up' },
  { position: 2, userId: 1, displayName: 'Lucho D.', avatar: 'L', points: 47, exact: 3, result: 7, played: 12, trend: 'same' },
  { position: 3, userId: 2, displayName: 'Seba M.', avatar: 'S', points: 41, exact: 2, result: 9, played: 12, trend: 'down' },
  { position: 4, userId: 3, displayName: 'Caro P.', avatar: 'C', points: 38, exact: 2, result: 6, played: 12, trend: 'up' },
  { position: 5, userId: 4, displayName: 'Nacho T.', avatar: 'N', points: 35, exact: 1, result: 8, played: 11, trend: 'down' },
  { position: 6, userId: 5, displayName: 'Juli V.', avatar: 'J', points: 32, exact: 2, result: 5, played: 12, trend: 'same' },
  { position: 7, userId: 6, displayName: 'Pablo R.', avatar: 'P', points: 28, exact: 1, result: 7, played: 11, trend: 'down' },
  { position: 8, userId: 7, displayName: 'Mari G.', avatar: 'M', points: 21, exact: 0, result: 6, played: 10, trend: 'same' },
];

export const MY_PREDICTIONS: Prediction[] = [
  { matchId: 2, homeScore: 0, awayScore: 2, submittedAt: '2026-06-10T15:00:00Z' },
  { matchId: 4, homeScore: 2, awayScore: 1, submittedAt: '2026-06-10T16:00:00Z' },
  { matchId: 6, homeScore: 1, awayScore: 1, submittedAt: '2026-06-11T10:00:00Z' },
];

export const PUBLIC_LEAGUES: League[] = [
  {
    id: 10, name: 'Mundial Fanáticos', code: 'FAN2026', isPublic: true,
    memberCount: 312, adminName: 'admin', myPosition: 0, myPoints: 0,
    leader: { name: 'Rodri A.', points: 78 },
  },
  {
    id: 11, name: 'Prode Clásico', code: 'CLASICO', isPublic: true,
    memberCount: 189, adminName: 'admin', myPosition: 0, myPoints: 0,
    leader: { name: 'Sol M.', points: 71 },
  },
  {
    id: 12, name: 'Expertos del Fútbol', code: 'EXPERT8', isPublic: true,
    memberCount: 97, adminName: 'pepe', myPosition: 0, myPoints: 0,
    leader: { name: 'Pepe J.', points: 66 },
  },
];

export const MY_STATS = {
  totalPoints: 142, exactPredictions: 9, resultPredictions: 24,
  totalPredictions: 47, bestPosition: 1, currentStreak: 3, bestStreak: 6, accuracy: 70,
};

export const ACHIEVEMENTS = [
  { code: 'early_bird', name: 'Madrugador', emoji: '🐦', rarity: 'common', unlocked: true, unlockedAt: '2026-06-11' },
  { code: 'unstoppable', name: 'Sin errar', emoji: '🎯', rarity: 'rare', unlocked: true, unlockedAt: '2026-06-15' },
  { code: 'neighborhood_capo', name: 'Capo del barrio', emoji: '🧢', rarity: 'rare', unlocked: false },
  { code: 'prophet', name: 'Tarotista', emoji: '🔮', rarity: 'epic', unlocked: false },
  { code: 'loyal_fan', name: 'Hincha de fierro', emoji: '💪', rarity: 'epic', unlocked: false },
  { code: 'crystal_ball', name: 'Bola de cristal', emoji: '🪄', rarity: 'legendary', unlocked: false },
  { code: 'visionary', name: 'Visionario', emoji: '👁️', rarity: 'legendary', unlocked: false, secret: true },
];

export const RARITY_COLOR: Record<string, string> = {
  common: 'text-text',
  rare: 'text-blue-400',
  epic: 'text-violet-400',
  legendary: 'text-accent',
};

export const ROUND_LABELS: Record<string, string> = {
  group: 'Fase de Grupos', r32: 'Ronda de 32', r16: 'Octavos de Final',
  qf: 'Cuartos de Final', sf: 'Semifinal', '3rd': 'Tercer Puesto', final: 'Final',
};
