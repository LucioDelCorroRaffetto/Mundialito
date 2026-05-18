import 'dotenv/config';

const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY ?? '';

// World Cup 2026 competition ID in API-Football
// WC 2022 was id=1, WC 2026 should be id=1 as well (FIFA World Cup)
// But to be safe we also support an env override
const WC_LEAGUE_ID = Number(process.env.API_FOOTBALL_LEAGUE_ID ?? '1');
const WC_SEASON = Number(process.env.API_FOOTBALL_SEASON ?? '2026');

interface ApiFootballResponse<T> {
  response: T[];
  errors: Record<string, string>;
  results: number;
}

interface LiveFixture {
  fixture: {
    id: number;
    status: {
      short: string; // '1H', '2H', 'HT', 'FT', 'NS', 'ET', 'PEN', 'AET', 'BT', 'SUSP', 'INT', 'PST', 'CANC', 'ABD', 'WO'
      elapsed: number | null;
    };
    date: string;
  };
  teams: {
    home: { name: string; id: number };
    away: { name: string; id: number };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  league: {
    id: number;
    season: number;
  };
}

export async function fetchLiveFixtures(): Promise<LiveFixture[]> {
  if (!API_KEY) {
    console.warn('[api-football] API_FOOTBALL_KEY not set — skipping');
    return [];
  }

  const url = `${BASE_URL}/fixtures?live=all&league=${WC_LEAGUE_ID}&season=${WC_SEASON}`;

  const res = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  });

  if (!res.ok) {
    console.error(`[api-football] HTTP ${res.status} — ${await res.text()}`);
    return [];
  }

  const data = (await res.json()) as ApiFootballResponse<LiveFixture>;

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.error('[api-football] API errors:', data.errors);
    return [];
  }

  return data.response ?? [];
}

export async function fetchFinishedFixturesToday(): Promise<LiveFixture[]> {
  if (!API_KEY) return [];

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const url = `${BASE_URL}/fixtures?date=${today}&league=${WC_LEAGUE_ID}&season=${WC_SEASON}&status=FT`;

  const res = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as ApiFootballResponse<LiveFixture>;
  return data.response ?? [];
}

export type { LiveFixture };
