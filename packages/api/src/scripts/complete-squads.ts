/**
 * Reports which WC2026 squads are still short of 26 players.
 *
 * Earlier versions of this script inserted 'Suplente N (CODE)' placeholder
 * rows to top each team up to 26. That polluted the goleador picker and
 * the fantasy team browser with fake names ('Algeria Suplente #26'), so
 * the script now just *reports* the gaps. The real fix is for
 * football-data.org to publish the final 26-man rosters; until then the
 * picker shows the partial list, which is honest about what's confirmed.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/complete-squads.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams, players } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

const TARGET = 26;

async function main() {
  const allTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);

  const gaps: { code: string; name: string; have: number }[] = [];
  for (const team of allTeams) {
    const current = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.teamId, team.id));
    if (current.length < TARGET) {
      gaps.push({ code: team.code, name: team.name, have: current.length });
    }
  }

  if (gaps.length === 0) {
    console.log('[complete-squads] every team has at least 26 players.');
    return;
  }

  console.log(`[complete-squads] ${gaps.length} team(s) still below 26:\n`);
  for (const g of gaps.sort((a, b) => a.have - b.have)) {
    console.log(`  ${g.code.padEnd(4)} ${g.name.padEnd(22)} ${g.have}/26  (missing ${26 - g.have})`);
  }
  console.log(
    `\nNo placeholders were inserted. Re-run sync:squads once football-data.org\n` +
      `publishes the missing names (typically after FIFA's official confirmation).`,
  );
}

main().catch((err) => {
  console.error('[complete-squads] failed:', err);
  process.exit(1);
});
