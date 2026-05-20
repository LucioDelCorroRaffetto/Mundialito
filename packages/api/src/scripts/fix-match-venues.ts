/**
 * fix-match-venues.ts
 *
 * One-off script to update existing matches in the Turso DB with real
 * World Cup 2026 venue and city data.
 *
 * Run with:
 *   npx tsx packages/api/src/scripts/fix-match-venues.ts
 *
 * Requires env vars:
 *   TURSO_DATABASE_URL=libsql://your-db.turso.io
 *   TURSO_AUTH_TOKEN=your-token
 *
 * For local dev:
 *   TURSO_DATABASE_URL=file:local.db (no auth token needed)
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

// ---------------------------------------------------------------------------
// Venue data for World Cup 2026
// 16 official venues across USA (11), Mexico (3), Canada (2)
// ---------------------------------------------------------------------------

type VenueEntry = { city: string; venue: string };

const VENUES: Record<string, VenueEntry> = {
  azteca:     { city: 'Ciudad de México', venue: 'Estadio Azteca' },
  akron:      { city: 'Guadalajara',      venue: 'Estadio Akron' },
  bbva:       { city: 'Monterrey',        venue: 'Estadio BBVA' },
  metlife:    { city: 'New York/NJ',      venue: 'MetLife Stadium' },
  sofi:       { city: 'Los Angeles',      venue: 'SoFi Stadium' },
  att:        { city: 'Dallas',           venue: 'AT&T Stadium' },
  levis:      { city: 'San Francisco',    venue: "Levi's Stadium" },
  hardrock:   { city: 'Miami',            venue: 'Hard Rock Stadium' },
  lumen:      { city: 'Seattle',          venue: 'Lumen Field' },
  arrowhead:  { city: 'Kansas City',      venue: 'Arrowhead Stadium' },
  gillette:   { city: 'Boston',           venue: 'Gillette Stadium' },
  lincoln:    { city: 'Philadelphia',     venue: 'Lincoln Financial Field' },
  nrg:        { city: 'Houston',          venue: 'NRG Stadium' },
  mercedes:   { city: 'Atlanta',          venue: 'Mercedes-Benz Stadium' },
  bc:         { city: 'Vancouver',        venue: 'BC Place' },
  bmo:        { city: 'Toronto',          venue: 'BMO Field' },
};

// ---------------------------------------------------------------------------
// Match-by-match venue assignments (match numbers 1-72)
//
// Seed generates groups A-L in order, 6 matches per group (round-robin):
//   Group A  (ARG, BRA, URU, COL)         matches  1-6
//   Group B  (ECU, PAR, MEX, USA)         matches  7-12
//   Group C  (CAN, PAN, CRC, JAM)         matches 13-18
//   Group D  (ESP, ENG, FRA, GER)         matches 19-24
//   Group E  (POR, ITA, NED, BEL)         matches 25-30
//   Group F  (CRO, SUI, DEN, POL)         matches 31-36
//   Group G  (AUT, SRB, TUR, NOR)         matches 37-42
//   Group H  (JPN, KOR, AUS, IRN)         matches 43-48
//   Group I  (KSA, QAT, UZB, JOR)         matches 49-54
//   Group J  (MAR, SEN, EGY, NGA)         matches 55-60
//   Group K  (ALG, TUN, CMR, CIV)         matches 61-66
//   Group L  (GHA, NZL, PO1, PO2)         matches 67-72
//
// Distribution criteria:
//  - Mexican teams (MEX) get at least two matches at Mexican venues.
//  - USA + CAN teams get at least two matches at their respective home venues.
//  - All 16 venues are used; none is left out.
// ---------------------------------------------------------------------------

const MATCH_VENUES: Record<number, keyof typeof VENUES> = {
  // Group A — South American heavyweights → high-profile US venues
  1:  'metlife',    // ARG vs BRA
  2:  'sofi',       // URU vs COL
  3:  'att',        // ARG vs URU
  4:  'hardrock',   // BRA vs COL
  5:  'gillette',   // ARG vs COL
  6:  'mercedes',   // BRA vs URU

  // Group B — MEX & USA → Mexican + US venues
  7:  'azteca',     // ECU vs PAR  (Mexican opener)
  8:  'sofi',       // MEX vs USA  (North American clash at SoFi)
  9:  'akron',      // ECU vs MEX  (MEX home — Guadalajara)
  10: 'att',        // PAR vs USA
  11: 'bbva',       // ECU vs USA  (Monterrey)
  12: 'azteca',     // PAR vs MEX  (MEX home — Azteca)

  // Group C — CAN, CONCACAF nations → Canadian + US venues
  13: 'bc',         // CAN vs PAN  (Vancouver — CAN home)
  14: 'lumen',      // CRC vs JAM
  15: 'bmo',        // CAN vs CRC  (Toronto — CAN home)
  16: 'arrowhead',  // PAN vs JAM
  17: 'nrg',        // CAN vs JAM
  18: 'lincoln',    // PAN vs CRC

  // Group D — European giants → marquee US venues
  19: 'metlife',    // ESP vs ENG
  20: 'sofi',       // FRA vs GER
  21: 'att',        // ESP vs FRA
  22: 'metlife',    // ENG vs GER
  23: 'sofi',       // ESP vs GER
  24: 'att',        // ENG vs FRA

  // Group E — European sides
  25: 'levis',      // POR vs ITA
  26: 'mercedes',   // NED vs BEL
  27: 'hardrock',   // POR vs NED
  28: 'gillette',   // ITA vs BEL
  29: 'lincoln',    // POR vs BEL
  30: 'levis',      // ITA vs NED

  // Group F — European sides
  31: 'arrowhead',  // CRO vs SUI
  32: 'nrg',        // DEN vs POL
  33: 'lumen',      // CRO vs DEN
  34: 'mercedes',   // SUI vs POL
  35: 'bmo',        // CRO vs POL
  36: 'arrowhead',  // SUI vs DEN

  // Group G — European/mixed
  37: 'levis',      // AUT vs SRB
  38: 'gillette',   // TUR vs NOR
  39: 'nrg',        // AUT vs TUR
  40: 'lincoln',    // SRB vs NOR
  41: 'hardrock',   // AUT vs NOR
  42: 'lumen',      // SRB vs TUR

  // Group H — Asian teams
  43: 'levis',      // JPN vs KOR
  44: 'sofi',       // AUS vs IRN
  45: 'att',        // JPN vs AUS
  46: 'metlife',    // KOR vs IRN
  47: 'arrowhead',  // JPN vs IRN
  48: 'sofi',       // KOR vs AUS

  // Group I — Middle East / Central Asian teams
  49: 'att',        // KSA vs QAT
  50: 'mercedes',   // UZB vs JOR
  51: 'nrg',        // KSA vs UZB
  52: 'hardrock',   // QAT vs JOR
  53: 'gillette',   // KSA vs JOR
  54: 'lumen',      // QAT vs UZB

  // Group J — African teams
  55: 'metlife',    // MAR vs SEN
  56: 'att',        // EGY vs NGA
  57: 'mercedes',   // MAR vs EGY
  58: 'sofi',       // SEN vs NGA
  59: 'levis',      // MAR vs NGA
  60: 'hardrock',   // SEN vs EGY

  // Group K — African teams
  61: 'lincoln',    // ALG vs TUN
  62: 'gillette',   // CMR vs CIV
  63: 'bmo',        // ALG vs CMR
  64: 'arrowhead',  // TUN vs CIV
  65: 'lumen',      // ALG vs CIV
  66: 'nrg',        // TUN vs CMR

  // Group L — Mixed
  67: 'bc',         // GHA vs NZL  (Vancouver)
  68: 'bmo',        // PO1 vs PO2  (Toronto)
  69: 'akron',      // GHA vs PO1  (Guadalajara)
  70: 'bbva',       // NZL vs PO2  (Monterrey)
  71: 'azteca',     // GHA vs PO2  (Azteca)
  72: 'akron',      // NZL vs PO1  (Akron)
};

async function fixMatchVenues(): Promise<void> {
  console.log('Connecting to Turso DB...');

  // Verify connection
  const check = await client.execute('SELECT count(*) as cnt FROM matches');
  const total = Number(check.rows[0].cnt);
  console.log(`Found ${total} matches in DB.`);

  if (total === 0) {
    console.error('No matches found. Run the seed script first.');
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;

  for (const [matchNumberStr, venueKey] of Object.entries(MATCH_VENUES)) {
    const matchNumber = Number(matchNumberStr);
    const { city, venue } = VENUES[venueKey];

    const result = await client.execute({
      sql: 'UPDATE matches SET city = ?, venue = ? WHERE match_number = ?',
      args: [city, venue, matchNumber],
    });

    if (result.rowsAffected > 0) {
      updated++;
    } else {
      console.warn(`Match #${matchNumber} not found in DB — skipped.`);
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}.`);
  process.exit(0);
}

fixMatchVenues().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
