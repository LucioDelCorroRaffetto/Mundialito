/**
 * sync-squads.ts
 *
 * Fetches the official 26-man WC 2026 squads from football-data.org and
 * replaces the placeholder players in the DB with the real ones.
 *
 * Run AFTER June 2 when FIFA publishes all official lists:
 *   cd packages/api && npx tsx src/scripts/sync-squads.ts
 *
 * Requires: FOOTBALL_DATA_API_KEY, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { teams, players, tournamentPredictions } from '../db/schema/index.js';
import { inArray } from 'drizzle-orm';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

// football-data.org position → our DB enum.
//
// The API mixes generic terms (Defence/Midfield/Offence) with granular
// ones (Centre-Back, Left Winger, Attacking Midfield…). The original
// version only had the generics, so every centre-back ended up tagged
// as MID because the script silently fell back to it.
const POSITION_MAP: Record<string, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  // Goalkeepers
  Goalkeeper: 'GK',

  // Generic
  Defence: 'DEF',
  Midfield: 'MID',
  Offence: 'FWD',
  Forward: 'FWD',
  Attacker: 'FWD',

  // Defenders (granular)
  'Centre-Back': 'DEF',
  'Center-Back': 'DEF',
  'Left-Back': 'DEF',
  'Right-Back': 'DEF',
  'Left Wing-Back': 'DEF',
  'Right Wing-Back': 'DEF',

  // Midfielders (granular)
  'Central Midfield': 'MID',
  'Defensive Midfield': 'MID',
  'Attacking Midfield': 'MID',
  'Left Midfield': 'MID',
  'Right Midfield': 'MID',

  // Forwards (granular)
  'Centre-Forward': 'FWD',
  'Center-Forward': 'FWD',
  'Second Striker': 'FWD',
  'Left Winger': 'FWD',
  'Right Winger': 'FWD',
};

// TLA differences between football-data.org and our seed codes.
// Key = fd.org TLA, Value = our DB code.
const TLA_REMAP: Record<string, string> = {
  SVN: 'SLO', // Slovenia
  RSA: 'ZAF', // South Africa
  SAU: 'KSA', // Saudi Arabia
  TTO: 'TRI', // Trinidad & Tobago
  IRK: 'IRQ', // Iraq (sometimes)
  MAD: 'MLI', // Mali fallback
  URY: 'URU', // Uruguay — ISO uses URY, FIFA/our DB uses URU
  GRM: 'GER', // safety: some feeds use GRM
  NLD: 'NED', // Netherlands — football-data sometimes returns NLD
};

interface FdPlayer {
  id: number;
  name: string;
  position: string | null;
  shirtNumber: number | null;
}

interface FdTeam {
  id: number;
  name: string;
  tla: string;
  squad: FdPlayer[];
}

interface FdResponse {
  teams: FdTeam[];
  message?: string;
  errorCode?: number;
}

async function run() {
  if (!API_KEY) {
    console.error('❌  FOOTBALL_DATA_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('📡  Fetching WC 2026 squads from football-data.org...\n');

  const res = await fetch(`${BASE_URL}/competitions/WC/teams?season=2026`, {
    headers: { 'X-Auth-Token': API_KEY },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌  API returned ${res.status}:`, body);

    if (res.status === 403) {
      console.error('\n⚠️  Free-tier note: squad data (individual players) may require');
      console.error('    a higher plan on football-data.org. Check their pricing page.');
      console.error('    Alternatively, re-run after June 2 — squad data may be unlocked then.');
    }
    process.exit(1);
  }

  const json: FdResponse = await res.json();

  if (json.errorCode) {
    console.error(`❌  API error ${json.errorCode}: ${json.message}`);
    process.exit(1);
  }

  const fdTeams = json.teams ?? [];
  console.log(`✅  Got ${fdTeams.length} teams from football-data.org\n`);

  // Check if squad data is included at all
  const teamsWithSquad = fdTeams.filter(t => (t.squad ?? []).length > 0);
  if (teamsWithSquad.length === 0) {
    console.warn('⚠️  API returned teams but NO squad data.');
    console.warn('    This may mean squad data is not available on the free tier,');
    console.warn('    or squads haven\'t been published yet (run after June 2).');
    process.exit(0);
  }

  // Load our teams from DB
  const dbTeams = await db.select().from(teams);
  const teamByCode = new Map(dbTeams.map(t => [t.code, t]));

  let syncedTeams   = 0;
  let syncedPlayers = 0;
  let skippedTeams  = 0;

  for (const fdTeam of fdTeams) {
    const squad = fdTeam.squad ?? [];

    // Map fd.org TLA → our DB code
    const ourCode = TLA_REMAP[fdTeam.tla] ?? fdTeam.tla;
    const dbTeam  = teamByCode.get(ourCode);

    if (!dbTeam) {
      console.warn(`⚠️  No DB match for "${fdTeam.name}" (fd TLA: ${fdTeam.tla} → our code: ${ourCode})`);
      skippedTeams++;
      continue;
    }

    if (squad.length === 0) {
      console.warn(`⏳  ${dbTeam.name.padEnd(24)} — squad not yet published`);
      skippedTeams++;
      continue;
    }

    // Snapshot existing photo URLs keyed by normalised player name so we
    // can preserve them after the delete-and-reinsert. Without this we
    // wipe every photo every time we re-sync a roster — happened once
    // already and cost us ~825 Wikipedia thumbnails that had to be
    // re-fetched. The key strips accents + lowercases so 'Lionel Messi'
    // and 'lionel messi' from a slightly different feed still match.
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const existingByName = new Map<string, string>();
    const existingRows = await db
      .select({ id: players.id, name: players.name, photoUrl: players.photoUrl })
      .from(players)
      .where(eq(players.teamId, dbTeam.id));
    for (const row of existingRows) {
      if (row.photoUrl) existingByName.set(norm(row.name), row.photoUrl);
    }

    // Replace players for this team. Before we delete, null out any
    // tournament_predictions.top_scorer_player_id that points at one of
    // our players — that FK doesn't have ON DELETE CASCADE, so the
    // delete would otherwise abort with a constraint violation. Users
    // whose pick gets nulled can re-select once the roster lands.
    const oldPlayerIds = existingRows.map((p) => p.id);
    if (oldPlayerIds.length > 0) {
      await db
        .update(tournamentPredictions)
        .set({ topScorerPlayerId: null })
        .where(inArray(tournamentPredictions.topScorerPlayerId, oldPlayerIds));
    }
    await db.delete(players).where(eq(players.teamId, dbTeam.id));

    let preservedPhotos = 0;
    const newPlayers = squad
      .filter(p => p.name?.trim())
      .map(p => {
        const photo = existingByName.get(norm(p.name)) ?? null;
        if (photo) preservedPhotos++;
        return {
          teamId:      dbTeam.id,
          name:        p.name.trim(),
          position:    (p.position ? POSITION_MAP[p.position] : undefined) ?? 'MID',
          shirtNumber: p.shirtNumber ?? null,
          photoUrl:    photo,
        };
      });

    if (newPlayers.length > 0) {
      await db.insert(players).values(newPlayers);
    }
    if (preservedPhotos > 0) {
      console.log(`   ↳ preserved ${preservedPhotos} photo(s) by matching player names`);
    }

    console.log(`✅  ${dbTeam.name.padEnd(24)} ${newPlayers.length} jugadores`);
    syncedTeams++;
    syncedPlayers += newPlayers.length;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊  Equipos sincronizados : ${syncedTeams}`);
  console.log(`⚽  Jugadores insertados  : ${syncedPlayers}`);
  console.log(`⏭️   Equipos sin datos     : ${skippedTeams}`);

  if (syncedTeams > 0) {
    console.log('\n🎉  Planteles actualizados correctamente.');
    console.log('    Ya podés desbloquear el goleador picker en tournament-predictions.tsx');
    console.log('    cambiando SCORER_UNLOCK a una fecha pasada.\n');
  }

  await client.close();
}

run().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
