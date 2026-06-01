/**
 * Tops up every WC2026 squad to the FIFA-mandated 26 players.
 *
 * football-data.org keeps publishing incomplete lists for some teams
 * (Mexico had only 12 names today; several Asian/African teams are still
 * in the 18-24 range). Without a fill the fantasy squad picker shows
 * fewer than 11 options of some positions for those teams, which breaks
 * the lineup form.
 *
 * Strategy: for each team below 26, insert generic placeholder players
 * ('Jugador 23 (ARG)', etc) distributed across positions so the typical
 * 3/8/8/7 GK/DEF/MID/FWD layout is preserved. Real names take precedence
 * the next time sync-squads.ts replaces the roster.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/complete-squads.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams, players } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

const TARGET = 26;
const TARGET_PER_POSITION: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = {
  GK: 3,
  DEF: 8,
  MID: 8,
  FWD: 7,
};

async function main() {
  const allTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.confederation} IS NOT NULL AND ${teams.code} NOT IN ('PO1','PO2','TBD')`);

  let inserted = 0;
  let toppedUpTeams = 0;

  for (const team of allTeams) {
    const current = await db
      .select({ id: players.id, position: players.position })
      .from(players)
      .where(eq(players.teamId, team.id));

    const have: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of current) {
      const pos = p.position as keyof typeof have;
      if (pos in have) have[pos]++;
    }
    const haveTotal = current.length;
    if (haveTotal >= TARGET) continue;

    // Decide how many to insert per position so we get to TARGET while
    // staying close to the typical layout. If a position is already above
    // its target, we don't drop them — we just don't add more.
    const want = { ...TARGET_PER_POSITION };
    const need: Record<keyof typeof want, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    let needTotal = TARGET - haveTotal;

    // First pass: fill each position up to its target.
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const gap = Math.max(0, want[pos] - have[pos]);
      const add = Math.min(gap, needTotal);
      need[pos] = add;
      needTotal -= add;
    }
    // Spillover (if some positions were already over target) → bias to MID/FWD.
    for (const pos of ['MID', 'FWD', 'DEF', 'GK'] as const) {
      if (needTotal <= 0) break;
      need[pos]++;
      needTotal--;
    }

    const rows: { teamId: number; name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD'; shirtNumber: number | null; photoUrl: null }[] = [];
    let shirtCursor = haveTotal + 1;
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      for (let i = 0; i < need[pos]; i++) {
        rows.push({
          teamId: team.id,
          name: `Suplente ${shirtCursor} (${team.code})`,
          position: pos,
          shirtNumber: shirtCursor,
          photoUrl: null,
        });
        shirtCursor++;
      }
    }

    if (rows.length > 0) {
      await db.insert(players).values(rows);
      inserted += rows.length;
      toppedUpTeams++;
      console.log(
        `  ${team.code.padEnd(4)} ${team.name.padEnd(22)} ${haveTotal} → ${haveTotal + rows.length}  (+${rows.length})`,
      );
    }
  }

  console.log(`\n[complete-squads] topped up ${toppedUpTeams} teams, inserted ${inserted} placeholders.`);
}

main().catch((err) => {
  console.error('[complete-squads] failed:', err);
  process.exit(1);
});
