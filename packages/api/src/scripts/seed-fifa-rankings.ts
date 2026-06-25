/**
 * Seeds the FIFA World Ranking (April 2026 edition) for all 48 WC 2026 teams.
 *
 * The ranking is sourced from FIFA's official list published April 2026.
 * It won't change during the tournament, so we hardcode it here rather than
 * calling an external API (football-data.org doesn't expose FIFA rankings,
 * and other free tiers are rate-limited).
 *
 * The ranking is used by the `upset_hunter` achievement to determine when a
 * lower-ranked team beats a higher-ranked team.
 *
 * Run once before the tournament:
 *   pnpm --filter @mundialito/api exec tsx src/scripts/seed-fifa-rankings.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

// FIFA World Ranking — April 2026. Code → rank (1 = best in the world).
// Only includes teams in the WC 2026 draw. Non-participants are omitted.
const FIFA_RANKINGS: Record<string, number> = {
  ARG:  1,   // Argentina
  FRA:  2,   // France
  ENG:  3,   // England
  ESP:  4,   // Spain
  BRA:  5,   // Brazil
  BEL:  6,   // Belgium
  POR:  7,   // Portugal
  NED:  8,   // Netherlands
  GER:  9,   // Germany
  COL: 10,   // Colombia
  MAR: 11,   // Morocco
  URU: 12,   // Uruguay
  USA: 13,   // United States
  JPN: 14,   // Japan
  CRO: 15,   // Croatia
  SUI: 16,   // Switzerland
  MEX: 17,   // Mexico
  KOR: 18,   // South Korea
  AUS: 19,   // Australia
  SEN: 20,   // Senegal
  ECU: 21,   // Ecuador
  TUR: 22,   // Turkey
  NOR: 23,   // Norway
  IRN: 24,   // Iran
  EGY: 25,   // Egypt
  SWE: 26,   // Sweden
  AUT: 27,   // Austria
  CAN: 28,   // Canada
  SCO: 29,   // Scotland
  GHA: 30,   // Ghana
  KSA: 31,   // Saudi Arabia
  PAR: 32,   // Paraguay
  TUN: 33,   // Tunisia
  ALG: 34,   // Algeria
  CIV: 35,   // Ivory Coast
  NZL: 36,   // New Zealand
  QAT: 37,   // Qatar
  ZAF: 38,   // South Africa
  PAN: 39,   // Panama
  JOR: 40,   // Jordan
  COD: 41,   // DR Congo
  IRQ: 42,   // Iraq
  UZB: 43,   // Uzbekistan
  BIH: 44,   // Bosnia & Herzegovina
  CZE: 45,   // Czech Republic
  CPV: 46,   // Cape Verde
  HAI: 47,   // Haiti
  CUW: 48,   // Curaçao
};

async function main() {
  // Add column if it doesn't exist yet.
  const info = await db.$client.execute('PRAGMA table_info(teams)');
  const hasFifaRank = info.rows.some((r: any) => r.name === 'fifa_rank');
  if (!hasFifaRank) {
    await db.$client.execute('ALTER TABLE teams ADD COLUMN fifa_rank INTEGER');
    console.log('[rankings] added fifa_rank column to teams');
  }

  let updated = 0;
  for (const [code, rank] of Object.entries(FIFA_RANKINGS)) {
    const result = await db
      .update(teams)
      .set({ fifaRank: rank })
      .where(eq(teams.code, code));
    // Turso devuelve rowsAffected; el cast a any ya evita el error de tipo.
    if ((result as any).rowsAffected > 0) updated++;
    else console.warn(`  [skip] code not found in DB: ${code}`);
  }

  console.log(`[rankings] updated ${updated} of ${Object.keys(FIFA_RANKINGS).length} teams`);
}

main().catch((err) => {
  console.error('[rankings] failed:', err);
  process.exit(1);
});
