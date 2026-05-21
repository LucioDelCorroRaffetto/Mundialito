/**
 * update-wc2026-fixture.ts
 *
 * One-time migration script to replace placeholder fixture data with the
 * real FIFA World Cup 2026 groups and schedule (draw: December 5, 2025).
 *
 * Run with:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx src/scripts/update-wc2026-fixture.ts
 *
 * What it does:
 *  1. Updates team group/confederation/name/code/flag for all 48 real WC2026 teams.
 *     Teams not in the real WC (Italy, Denmark, etc.) are replaced in-place
 *     so their DB IDs stay the same (preserves any FK references).
 *  2. Updates all 72 group-stage matches (matchNumber 1-72) with correct
 *     teams, dates, venues and groups.
 *  3. Leaves knockout matches (73-104) untouched.
 *
 * NOTE: Existing predictions linked to group-stage matchIds remain valid
 * (same matchId, now pointing to the real fixture).
 */

import 'dotenv/config';
import { db } from '../db/index.js';
import { initDb } from '../db/client.js';
import { teams, matches } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { calcPredictionLock } from '../lib/match-helpers.js';

// ---------------------------------------------------------------------------
// Real WC 2026 Groups (from official FIFA draw, December 5, 2025)
// ---------------------------------------------------------------------------
// Group A: Mexico, South Africa, South Korea, Czechia
// Group B: Canada, Bosnia-Herzegovina, Qatar, Switzerland
// Group C: Brazil, Morocco, Haiti, Scotland
// Group D: United States, Paraguay, Australia, Turkey
// Group E: Germany, Curacao, Ivory Coast, Ecuador
// Group F: Netherlands, Japan, Sweden, Tunisia
// Group G: Belgium, Egypt, Iran, New Zealand
// Group H: Spain, Cape Verde, Saudi Arabia, Uruguay
// Group I: France, Senegal, Iraq, Norway
// Group J: Argentina, Algeria, Austria, Jordan
// Group K: Portugal, Congo DR, Uzbekistan, Colombia
// Group L: England, Croatia, Ghana, Panama

// Teams that ARE in the real WC — update their group/confederation in-place.
const EXISTING_TEAM_UPDATES: Array<{
  code: string;
  name: string;
  flag: string;
  group: string;
  confederation: string;
}> = [
  // CONMEBOL
  { code: 'ARG', name: 'Argentina',       flag: '🇦🇷', group: 'J', confederation: 'CONMEBOL' },
  { code: 'BRA', name: 'Brasil',           flag: '🇧🇷', group: 'C', confederation: 'CONMEBOL' },
  { code: 'URU', name: 'Uruguay',          flag: '🇺🇾', group: 'H', confederation: 'CONMEBOL' },
  { code: 'COL', name: 'Colombia',         flag: '🇨🇴', group: 'K', confederation: 'CONMEBOL' },
  { code: 'ECU', name: 'Ecuador',          flag: '🇪🇨', group: 'E', confederation: 'CONMEBOL' },
  { code: 'PAR', name: 'Paraguay',         flag: '🇵🇾', group: 'D', confederation: 'CONMEBOL' },
  // CONCACAF
  { code: 'MEX', name: 'México',           flag: '🇲🇽', group: 'A', confederation: 'CONCACAF' },
  { code: 'USA', name: 'Estados Unidos',   flag: '🇺🇸', group: 'D', confederation: 'CONCACAF' },
  { code: 'CAN', name: 'Canadá',           flag: '🇨🇦', group: 'B', confederation: 'CONCACAF' },
  { code: 'PAN', name: 'Panamá',           flag: '🇵🇦', group: 'L', confederation: 'CONCACAF' },
  // UEFA
  { code: 'ESP', name: 'España',           flag: '🇪🇸', group: 'H', confederation: 'UEFA' },
  { code: 'ENG', name: 'Inglaterra',       flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'L', confederation: 'UEFA' },
  { code: 'FRA', name: 'Francia',          flag: '🇫🇷', group: 'I', confederation: 'UEFA' },
  { code: 'GER', name: 'Alemania',         flag: '🇩🇪', group: 'E', confederation: 'UEFA' },
  { code: 'POR', name: 'Portugal',         flag: '🇵🇹', group: 'K', confederation: 'UEFA' },
  { code: 'NED', name: 'Países Bajos',     flag: '🇳🇱', group: 'F', confederation: 'UEFA' },
  { code: 'BEL', name: 'Bélgica',          flag: '🇧🇪', group: 'G', confederation: 'UEFA' },
  { code: 'CRO', name: 'Croacia',          flag: '🇭🇷', group: 'L', confederation: 'UEFA' },
  { code: 'SUI', name: 'Suiza',            flag: '🇨🇭', group: 'B', confederation: 'UEFA' },
  { code: 'AUT', name: 'Austria',          flag: '🇦🇹', group: 'J', confederation: 'UEFA' },
  { code: 'TUR', name: 'Turquía',          flag: '🇹🇷', group: 'D', confederation: 'UEFA' },
  { code: 'NOR', name: 'Noruega',          flag: '🇳🇴', group: 'I', confederation: 'UEFA' },
  // AFC
  { code: 'JPN', name: 'Japón',            flag: '🇯🇵', group: 'F', confederation: 'AFC' },
  { code: 'KOR', name: 'Corea del Sur',    flag: '🇰🇷', group: 'A', confederation: 'AFC' },
  { code: 'AUS', name: 'Australia',        flag: '🇦🇺', group: 'D', confederation: 'AFC' },
  { code: 'IRN', name: 'Irán',             flag: '🇮🇷', group: 'G', confederation: 'AFC' },
  { code: 'KSA', name: 'Arabia Saudita',   flag: '🇸🇦', group: 'H', confederation: 'AFC' },
  { code: 'QAT', name: 'Qatar',            flag: '🇶🇦', group: 'B', confederation: 'AFC' },
  { code: 'UZB', name: 'Uzbekistán',       flag: '🇺🇿', group: 'K', confederation: 'AFC' },
  { code: 'JOR', name: 'Jordania',         flag: '🇯🇴', group: 'J', confederation: 'AFC' },
  // CAF
  { code: 'MAR', name: 'Marruecos',        flag: '🇲🇦', group: 'C', confederation: 'CAF' },
  { code: 'SEN', name: 'Senegal',          flag: '🇸🇳', group: 'I', confederation: 'CAF' },
  { code: 'EGY', name: 'Egipto',           flag: '🇪🇬', group: 'G', confederation: 'CAF' },
  { code: 'ALG', name: 'Argelia',          flag: '🇩🇿', group: 'J', confederation: 'CAF' },
  { code: 'TUN', name: 'Túnez',            flag: '🇹🇳', group: 'F', confederation: 'CAF' },
  { code: 'CIV', name: 'Costa de Marfil', flag: '🇨🇮', group: 'E', confederation: 'CAF' },
  { code: 'GHA', name: 'Ghana',            flag: '🇬🇭', group: 'L', confederation: 'CAF' },
  // OFC
  { code: 'NZL', name: 'Nueva Zelanda',    flag: '🇳🇿', group: 'G', confederation: 'OFC' },
];

// Teams NOT in real WC2026, replaced by new teams (same DB row = same ID).
// Old teams: ITA, DEN, POL, SRB, JAM, CRC, NGA, CMR, PO1, PO2
// New teams: CZE, BIH, SCO, SWE, ZAF, CPV, HAI, CUW, IRQ, COD
const TEAM_REPLACEMENTS: Array<{
  oldCode: string;
  code: string;
  name: string;
  flag: string;
  group: string;
  confederation: string;
}> = [
  { oldCode: 'ITA', code: 'CZE', name: 'Chequia',          flag: '🇨🇿', group: 'A', confederation: 'UEFA'    },
  { oldCode: 'DEN', code: 'BIH', name: 'Bosnia-Herzegovina',flag: '🇧🇦', group: 'B', confederation: 'UEFA'    },
  { oldCode: 'POL', code: 'HAI', name: 'Haití',             flag: '🇭🇹', group: 'C', confederation: 'CONCACAF'},
  { oldCode: 'SRB', code: 'SCO', name: 'Escocia',           flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'C', confederation: 'UEFA'    },
  { oldCode: 'JAM', code: 'CUW', name: 'Curazao',           flag: '🇨🇼', group: 'E', confederation: 'CONCACAF'},
  { oldCode: 'CRC', code: 'SWE', name: 'Suecia',            flag: '🇸🇪', group: 'F', confederation: 'UEFA'    },
  { oldCode: 'NGA', code: 'ZAF', name: 'Sudáfrica',         flag: '🇿🇦', group: 'A', confederation: 'CAF'     },
  { oldCode: 'CMR', code: 'CPV', name: 'Cabo Verde',        flag: '🇨🇻', group: 'H', confederation: 'CAF'     },
  { oldCode: 'PO1', code: 'IRQ', name: 'Iraq',              flag: '🇮🇶', group: 'I', confederation: 'AFC'     },
  { oldCode: 'PO2', code: 'COD', name: 'Congo RD',          flag: '🇨🇩', group: 'K', confederation: 'CAF'     },
];

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------
const VENUES: Record<string, { venue: string; city: string }> = {
  azteca:    { venue: 'Estadio Azteca',            city: 'Ciudad de México'  },
  akron:     { venue: 'Estadio Akron',             city: 'Guadalajara'       },
  bbva:      { venue: 'Estadio BBVA',              city: 'Monterrey'         },
  metlife:   { venue: 'MetLife Stadium',           city: 'Nueva York / NJ'   },
  sofi:      { venue: 'SoFi Stadium',              city: 'Los Ángeles'       },
  att:       { venue: 'AT&T Stadium',              city: 'Dallas'            },
  levis:     { venue: "Levi's Stadium",            city: 'San Francisco'     },
  hardrock:  { venue: 'Hard Rock Stadium',         city: 'Miami'             },
  lumen:     { venue: 'Lumen Field',               city: 'Seattle'           },
  arrowhead: { venue: 'Arrowhead Stadium',         city: 'Kansas City'       },
  gillette:  { venue: 'Gillette Stadium',          city: 'Boston'            },
  lincoln:   { venue: 'Lincoln Financial Field',   city: 'Filadelfia'        },
  nrg:       { venue: 'NRG Stadium',               city: 'Houston'           },
  mercedesbenz: { venue: 'Mercedes-Benz Stadium',  city: 'Atlanta'           },
  bcplace:   { venue: 'BC Place',                  city: 'Vancouver'         },
  bmo:       { venue: 'BMO Field',                 city: 'Toronto'           },
};

const V = VENUES;

// ---------------------------------------------------------------------------
// Real WC 2026 Group Stage Fixture (72 matches)
// Matchdays:
//   MD1: Jun 11-17 (matches 1-24)
//   MD2: Jun 18-24 (matches 25-48)
//   MD3: Jun 25-27 simultaneous last round (matches 49-72)
// ---------------------------------------------------------------------------
type MatchFixture = {
  matchNumber: number;
  homeCode: string;
  awayCode: string;
  kickoffUtc: string;
  venue: string;
  city: string;
  group: string;
};

const GROUP_STAGE_FIXTURES: MatchFixture[] = [
  // ── MATCHDAY 1 ────────────────────────────────────────────────────────────
  // Group A
  { matchNumber:  1, homeCode: 'MEX', awayCode: 'ZAF', kickoffUtc: '2026-06-11T19:00:00Z', ...V.azteca,    group: 'A' },
  { matchNumber:  2, homeCode: 'KOR', awayCode: 'CZE', kickoffUtc: '2026-06-12T02:00:00Z', ...V.akron,     group: 'A' },
  // Group B
  { matchNumber:  3, homeCode: 'CAN', awayCode: 'BIH', kickoffUtc: '2026-06-12T19:00:00Z', ...V.bmo,       group: 'B' },
  { matchNumber:  4, homeCode: 'QAT', awayCode: 'SUI', kickoffUtc: '2026-06-13T19:00:00Z', ...V.levis,     group: 'B' },
  // Group C
  { matchNumber:  5, homeCode: 'BRA', awayCode: 'MAR', kickoffUtc: '2026-06-13T22:00:00Z', ...V.metlife,   group: 'C' },
  { matchNumber:  6, homeCode: 'HAI', awayCode: 'SCO', kickoffUtc: '2026-06-14T01:00:00Z', ...V.gillette,  group: 'C' },
  // Group D
  { matchNumber:  7, homeCode: 'USA', awayCode: 'PAR', kickoffUtc: '2026-06-13T01:00:00Z', ...V.sofi,      group: 'D' },
  { matchNumber:  8, homeCode: 'AUS', awayCode: 'TUR', kickoffUtc: '2026-06-14T04:00:00Z', ...V.bcplace,   group: 'D' },
  // Group E
  { matchNumber:  9, homeCode: 'GER', awayCode: 'CUW', kickoffUtc: '2026-06-14T17:00:00Z', ...V.nrg,       group: 'E' },
  { matchNumber: 10, homeCode: 'CIV', awayCode: 'ECU', kickoffUtc: '2026-06-14T23:00:00Z', ...V.lincoln,   group: 'E' },
  // Group F
  { matchNumber: 11, homeCode: 'NED', awayCode: 'JPN', kickoffUtc: '2026-06-14T20:00:00Z', ...V.att,       group: 'F' },
  { matchNumber: 12, homeCode: 'SWE', awayCode: 'TUN', kickoffUtc: '2026-06-15T02:00:00Z', ...V.bbva,      group: 'F' },
  // Group G
  { matchNumber: 13, homeCode: 'BEL', awayCode: 'EGY', kickoffUtc: '2026-06-15T17:00:00Z', ...V.metlife,   group: 'G' },
  { matchNumber: 14, homeCode: 'IRN', awayCode: 'NZL', kickoffUtc: '2026-06-15T20:00:00Z', ...V.levis,     group: 'G' },
  // Group H
  { matchNumber: 15, homeCode: 'ESP', awayCode: 'CPV', kickoffUtc: '2026-06-15T23:00:00Z', ...V.sofi,      group: 'H' },
  { matchNumber: 16, homeCode: 'KSA', awayCode: 'URU', kickoffUtc: '2026-06-16T02:00:00Z', ...V.hardrock,  group: 'H' },
  // Group I
  { matchNumber: 17, homeCode: 'FRA', awayCode: 'SEN', kickoffUtc: '2026-06-16T17:00:00Z', ...V.att,       group: 'I' },
  { matchNumber: 18, homeCode: 'IRQ', awayCode: 'NOR', kickoffUtc: '2026-06-16T20:00:00Z', ...V.bcplace,   group: 'I' },
  // Group J
  { matchNumber: 19, homeCode: 'ARG', awayCode: 'ALG', kickoffUtc: '2026-06-17T17:00:00Z', ...V.metlife,   group: 'J' },
  { matchNumber: 20, homeCode: 'AUT', awayCode: 'JOR', kickoffUtc: '2026-06-17T20:00:00Z', ...V.levis,     group: 'J' },
  // Group K
  { matchNumber: 21, homeCode: 'POR', awayCode: 'COD', kickoffUtc: '2026-06-17T23:00:00Z', ...V.nrg,       group: 'K' },
  { matchNumber: 22, homeCode: 'UZB', awayCode: 'COL', kickoffUtc: '2026-06-18T02:00:00Z', ...V.azteca,    group: 'K' },
  // Group L
  { matchNumber: 23, homeCode: 'ENG', awayCode: 'CRO', kickoffUtc: '2026-06-18T05:00:00Z', ...V.att,       group: 'L' },
  { matchNumber: 24, homeCode: 'GHA', awayCode: 'PAN', kickoffUtc: '2026-06-18T08:00:00Z', ...V.bmo,       group: 'L' },

  // ── MATCHDAY 2 ────────────────────────────────────────────────────────────
  // Group A
  { matchNumber: 25, homeCode: 'MEX', awayCode: 'KOR', kickoffUtc: '2026-06-18T19:00:00Z', ...V.azteca,    group: 'A' },
  { matchNumber: 26, homeCode: 'ZAF', awayCode: 'CZE', kickoffUtc: '2026-06-18T22:00:00Z', ...V.arrowhead, group: 'A' },
  // Group B
  { matchNumber: 27, homeCode: 'CAN', awayCode: 'QAT', kickoffUtc: '2026-06-19T17:00:00Z', ...V.bcplace,   group: 'B' },
  { matchNumber: 28, homeCode: 'BIH', awayCode: 'SUI', kickoffUtc: '2026-06-19T20:00:00Z', ...V.mercedesbenz, group: 'B' },
  // Group C
  { matchNumber: 29, homeCode: 'BRA', awayCode: 'HAI', kickoffUtc: '2026-06-19T23:00:00Z', ...V.sofi,      group: 'C' },
  { matchNumber: 30, homeCode: 'MAR', awayCode: 'SCO', kickoffUtc: '2026-06-20T02:00:00Z', ...V.gillette,  group: 'C' },
  // Group D
  { matchNumber: 31, homeCode: 'USA', awayCode: 'AUS', kickoffUtc: '2026-06-20T17:00:00Z', ...V.nrg,       group: 'D' },
  { matchNumber: 32, homeCode: 'PAR', awayCode: 'TUR', kickoffUtc: '2026-06-20T20:00:00Z', ...V.hardrock,  group: 'D' },
  // Group E
  { matchNumber: 33, homeCode: 'GER', awayCode: 'CIV', kickoffUtc: '2026-06-20T23:00:00Z', ...V.metlife,   group: 'E' },
  { matchNumber: 34, homeCode: 'CUW', awayCode: 'ECU', kickoffUtc: '2026-06-21T02:00:00Z', ...V.lincoln,   group: 'E' },
  // Group F
  { matchNumber: 35, homeCode: 'NED', awayCode: 'SWE', kickoffUtc: '2026-06-21T17:00:00Z', ...V.att,       group: 'F' },
  { matchNumber: 36, homeCode: 'JPN', awayCode: 'TUN', kickoffUtc: '2026-06-21T20:00:00Z', ...V.lumen,     group: 'F' },
  // Group G
  { matchNumber: 37, homeCode: 'BEL', awayCode: 'IRN', kickoffUtc: '2026-06-21T23:00:00Z', ...V.levis,     group: 'G' },
  { matchNumber: 38, homeCode: 'EGY', awayCode: 'NZL', kickoffUtc: '2026-06-22T02:00:00Z', ...V.hardrock,  group: 'G' },
  // Group H
  { matchNumber: 39, homeCode: 'ESP', awayCode: 'KSA', kickoffUtc: '2026-06-22T17:00:00Z', ...V.gillette,  group: 'H' },
  { matchNumber: 40, homeCode: 'CPV', awayCode: 'URU', kickoffUtc: '2026-06-22T20:00:00Z', ...V.lincoln,   group: 'H' },
  // Group I
  { matchNumber: 41, homeCode: 'FRA', awayCode: 'IRQ', kickoffUtc: '2026-06-22T23:00:00Z', ...V.bcplace,   group: 'I' },
  { matchNumber: 42, homeCode: 'SEN', awayCode: 'NOR', kickoffUtc: '2026-06-23T02:00:00Z', ...V.lumen,     group: 'I' },
  // Group J
  { matchNumber: 43, homeCode: 'ARG', awayCode: 'AUT', kickoffUtc: '2026-06-23T17:00:00Z', ...V.att,       group: 'J' },
  { matchNumber: 44, homeCode: 'ALG', awayCode: 'JOR', kickoffUtc: '2026-06-23T20:00:00Z', ...V.arrowhead, group: 'J' },
  // Group K
  { matchNumber: 45, homeCode: 'POR', awayCode: 'UZB', kickoffUtc: '2026-06-23T23:00:00Z', ...V.mercedesbenz, group: 'K' },
  { matchNumber: 46, homeCode: 'COD', awayCode: 'COL', kickoffUtc: '2026-06-24T02:00:00Z', ...V.akron,     group: 'K' },
  // Group L
  { matchNumber: 47, homeCode: 'ENG', awayCode: 'GHA', kickoffUtc: '2026-06-24T17:00:00Z', ...V.metlife,   group: 'L' },
  { matchNumber: 48, homeCode: 'CRO', awayCode: 'PAN', kickoffUtc: '2026-06-24T20:00:00Z', ...V.nrg,       group: 'L' },

  // ── MATCHDAY 3 (simultaneous last round per group) ──────────────────────
  // Group A — simultaneous
  { matchNumber: 49, homeCode: 'MEX', awayCode: 'CZE', kickoffUtc: '2026-06-25T21:00:00Z', ...V.azteca,    group: 'A' },
  { matchNumber: 50, homeCode: 'ZAF', awayCode: 'KOR', kickoffUtc: '2026-06-25T21:00:00Z', ...V.akron,     group: 'A' },
  // Group B — simultaneous
  { matchNumber: 51, homeCode: 'CAN', awayCode: 'SUI', kickoffUtc: '2026-06-25T17:00:00Z', ...V.bmo,       group: 'B' },
  { matchNumber: 52, homeCode: 'BIH', awayCode: 'QAT', kickoffUtc: '2026-06-25T17:00:00Z', ...V.bcplace,   group: 'B' },
  // Group C — simultaneous
  { matchNumber: 53, homeCode: 'BRA', awayCode: 'SCO', kickoffUtc: '2026-06-26T17:00:00Z', ...V.metlife,   group: 'C' },
  { matchNumber: 54, homeCode: 'MAR', awayCode: 'HAI', kickoffUtc: '2026-06-26T17:00:00Z', ...V.sofi,      group: 'C' },
  // Group D — simultaneous
  { matchNumber: 55, homeCode: 'USA', awayCode: 'TUR', kickoffUtc: '2026-06-26T21:00:00Z', ...V.nrg,       group: 'D' },
  { matchNumber: 56, homeCode: 'PAR', awayCode: 'AUS', kickoffUtc: '2026-06-26T21:00:00Z', ...V.hardrock,  group: 'D' },
  // Group E — simultaneous
  { matchNumber: 57, homeCode: 'GER', awayCode: 'ECU', kickoffUtc: '2026-06-26T17:00:00Z', ...V.att,       group: 'E' },
  { matchNumber: 58, homeCode: 'CUW', awayCode: 'CIV', kickoffUtc: '2026-06-26T17:00:00Z', ...V.lincoln,   group: 'E' },
  // Group F — simultaneous
  { matchNumber: 59, homeCode: 'NED', awayCode: 'TUN', kickoffUtc: '2026-06-26T21:00:00Z', ...V.lumen,     group: 'F' },
  { matchNumber: 60, homeCode: 'JPN', awayCode: 'SWE', kickoffUtc: '2026-06-26T21:00:00Z', ...V.arrowhead, group: 'F' },
  // Group G — simultaneous
  { matchNumber: 61, homeCode: 'BEL', awayCode: 'NZL', kickoffUtc: '2026-06-27T17:00:00Z', ...V.levis,     group: 'G' },
  { matchNumber: 62, homeCode: 'EGY', awayCode: 'IRN', kickoffUtc: '2026-06-27T17:00:00Z', ...V.mercedesbenz, group: 'G' },
  // Group H — simultaneous
  { matchNumber: 63, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: '2026-06-27T21:00:00Z', ...V.gillette,  group: 'H' },
  { matchNumber: 64, homeCode: 'CPV', awayCode: 'KSA', kickoffUtc: '2026-06-27T21:00:00Z', ...V.bcplace,   group: 'H' },
  // Group I — simultaneous
  { matchNumber: 65, homeCode: 'FRA', awayCode: 'NOR', kickoffUtc: '2026-06-27T17:00:00Z', ...V.att,       group: 'I' },
  { matchNumber: 66, homeCode: 'SEN', awayCode: 'IRQ', kickoffUtc: '2026-06-27T17:00:00Z', ...V.azteca,    group: 'I' },
  // Group J — simultaneous
  { matchNumber: 67, homeCode: 'ARG', awayCode: 'JOR', kickoffUtc: '2026-06-27T21:00:00Z', ...V.lumen,     group: 'J' },
  { matchNumber: 68, homeCode: 'ALG', awayCode: 'AUT', kickoffUtc: '2026-06-27T21:00:00Z', ...V.metlife,   group: 'J' },
  // Group K — simultaneous
  { matchNumber: 69, homeCode: 'POR', awayCode: 'COL', kickoffUtc: '2026-06-27T21:00:00Z', ...V.sofi,      group: 'K' },
  { matchNumber: 70, homeCode: 'COD', awayCode: 'UZB', kickoffUtc: '2026-06-27T21:00:00Z', ...V.mercedesbenz, group: 'K' },
  // Group L — simultaneous
  { matchNumber: 71, homeCode: 'ENG', awayCode: 'PAN', kickoffUtc: '2026-06-28T01:00:00Z', ...V.nrg,       group: 'L' },
  { matchNumber: 72, homeCode: 'CRO', awayCode: 'GHA', kickoffUtc: '2026-06-28T01:00:00Z', ...V.arrowhead, group: 'L' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function updateFixture(): Promise<void> {
  console.log('🌍 Updating WC2026 fixture to real groups & schedule...');
  await initDb();

  // ── Step 1: Build current team code → id map ──────────────────────────────
  const allTeams = await db.select().from(teams);
  const teamByCode = new Map(allTeams.map((t) => [t.code, t.id]));
  console.log(`Found ${allTeams.length} teams in DB.`);

  // ── Step 2: Update existing teams (real WC teams, just fix group/conf) ─────
  console.log('Updating existing teams...');
  for (const t of EXISTING_TEAM_UPDATES) {
    if (teamByCode.has(t.code)) {
      await db
        .update(teams)
        .set({ name: t.name, flag: t.flag, group: t.group, confederation: t.confederation })
        .where(eq(teams.code, t.code));
    } else {
      console.warn(`  Team ${t.code} not found in DB — inserting.`);
      await db.insert(teams).values(t).onConflictDoNothing();
      const freshTeam = await db.select().from(teams).where(eq(teams.code, t.code)).get();
      if (freshTeam) teamByCode.set(t.code, freshTeam.id);
    }
  }
  console.log('✅ Existing teams updated.');

  // ── Step 3: Replace wrong teams with real teams (in-place UPDATE) ──────────
  console.log('Replacing wrong teams with real WC2026 teams...');
  for (const r of TEAM_REPLACEMENTS) {
    if (teamByCode.has(r.oldCode)) {
      const oldId = teamByCode.get(r.oldCode)!;
      await db
        .update(teams)
        .set({
          name: r.name,
          code: r.code,
          flag: r.flag,
          group: r.group,
          confederation: r.confederation,
        })
        .where(eq(teams.code, r.oldCode));
      // Remap in our local map
      teamByCode.delete(r.oldCode);
      teamByCode.set(r.code, oldId);
      console.log(`  Replaced ${r.oldCode} → ${r.code} (${r.name})`);
    } else if (teamByCode.has(r.code)) {
      // Already updated in a previous run — just ensure data is correct
      await db
        .update(teams)
        .set({ name: r.name, flag: r.flag, group: r.group, confederation: r.confederation })
        .where(eq(teams.code, r.code));
    } else {
      console.warn(`  Old team ${r.oldCode} not found — inserting ${r.code} directly.`);
      await db.insert(teams).values({
        name: r.name, code: r.code, flag: r.flag,
        group: r.group, confederation: r.confederation,
      }).onConflictDoNothing();
      const freshTeam = await db.select().from(teams).where(eq(teams.code, r.code)).get();
      if (freshTeam) teamByCode.set(r.code, freshTeam.id);
    }
  }
  console.log('✅ Team replacements done.');

  // ── Step 4: Refresh team map after all updates ─────────────────────────────
  const updatedTeams = await db.select().from(teams);
  const finalTeamMap = new Map(updatedTeams.map((t) => [t.code, t.id]));

  // ── Step 5: Update group-stage matches ────────────────────────────────────
  console.log('Updating group-stage matches (matchNumber 1-72)...');
  let updated = 0;
  let inserted = 0;

  for (const fix of GROUP_STAGE_FIXTURES) {
    const homeId = finalTeamMap.get(fix.homeCode);
    const awayId = finalTeamMap.get(fix.awayCode);
    if (!homeId || !awayId) {
      console.warn(`  Skipping match ${fix.matchNumber}: missing team ${fix.homeCode} or ${fix.awayCode}`);
      continue;
    }

    // Check if match exists
    const existing = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.matchNumber, fix.matchNumber))
      .get();

    const payload = {
      homeTeamId: homeId,
      awayTeamId: awayId,
      kickoffUtc: fix.kickoffUtc,
      predictionLockUtc: calcPredictionLock(fix.kickoffUtc),
      venue: fix.venue,
      city: fix.city,
      group: fix.group,
      round: 'group' as const,
      status: 'scheduled' as const,
      homeScore: null,
      awayScore: null,
    };

    if (existing) {
      await db.update(matches).set(payload).where(eq(matches.matchNumber, fix.matchNumber));
      updated++;
    } else {
      await db.insert(matches).values({ matchNumber: fix.matchNumber, ...payload }).onConflictDoNothing();
      inserted++;
    }
  }

  console.log(`✅ Group-stage matches: ${updated} updated, ${inserted} inserted.`);
  console.log('');
  console.log('🏆 WC2026 fixture update complete!');
  console.log('   Groups: A (MEX/ZAF/KOR/CZE) through L (ENG/CRO/GHA/PAN)');
  console.log('   Matches: June 11 – June 28, 2026');
  process.exit(0);
}

updateFixture().catch((err) => {
  console.error('❌ Update failed:', err);
  process.exit(1);
});
