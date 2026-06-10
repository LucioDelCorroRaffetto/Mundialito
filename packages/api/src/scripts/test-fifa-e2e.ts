/**
 * Pre-tournament readiness check.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/test-fifa-e2e.ts
 *
 * Verifies, against PROD data + the live FIFA API:
 *   ✓ The matches table has the expected ~64 WC2026 matches mapped to FIFA
 *     IdMatch / IdStage (the backfill ran and persisted).
 *   ✓ The FIFA /timelines endpoint is reachable for one of those matches
 *     (returns empty events pre-kickoff, that's fine).
 *   ✓ The parser logic still produces correct goal/assist/card counts
 *     against a known reference WC2022 fixture (catches regex / event-type
 *     regressions before the tournament starts).
 *
 * Exits 0 when everything is green, non-zero otherwise. Wire into a Render
 * cron / GitHub Action if you want passive monitoring before kickoff.
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { isNotNull } from 'drizzle-orm';
import { diagnoseFifaFlow } from '../services/diagnose-fifa-flow.js';

interface Check {
  name: string;
  ok: boolean;
  details: string;
}

const checks: Check[] = [];

async function checkBackfillState() {
  const mapped = await db
    .select({ id: matches.id, fifaIdMatch: matches.fifaIdMatch, fifaIdStage: matches.fifaIdStage })
    .from(matches)
    .where(isNotNull(matches.fifaIdMatch));
  checks.push({
    name: 'backfill-applied',
    ok: mapped.length >= 48, // 48 group-stage matches is the minimum pre-tournament
    details: `${mapped.length} matches mapped (expected ≥48 before grouping is done)`,
  });
  const sample = mapped[0];
  if (sample?.fifaIdMatch && sample?.fifaIdStage) {
    const url = `https://api.fifa.com/api/v3/timelines/17/285023/${sample.fifaIdStage}/${sample.fifaIdMatch}?language=en`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      checks.push({
        name: 'fifa-timeline-reachable',
        ok: res.ok,
        details: `HTTP ${res.status} for matchId=${sample.id} (IdMatch=${sample.fifaIdMatch})`,
      });
    } catch (err) {
      checks.push({
        name: 'fifa-timeline-reachable',
        ok: false,
        details: `fetch failed: ${err instanceof Error ? err.message : err}`,
      });
    }
  } else {
    checks.push({
      name: 'fifa-timeline-reachable',
      ok: false,
      details: 'no mapped match to probe with — backfill missing',
    });
  }
}

async function checkParser() {
  const result = await diagnoseFifaFlow();
  // Lift each sub-check into our top-level list so the report stays flat.
  for (const c of result.checks) {
    checks.push({
      name: `parser/${c.name}`,
      ok: c.ok,
      details: c.details,
    });
  }
}

async function main() {
  console.log('[test-fifa-e2e] pre-tournament readiness check\n');
  await checkBackfillState();
  await checkParser();

  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name.padEnd(32)} ${c.details}`);
  }
  const allOk = checks.every((c) => c.ok);
  console.log(`\n${allOk ? '✅ READY for kickoff. The auto-sync will handle every finished match.' : '❌ NOT READY — see ✗ above.'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('[test-fifa-e2e] fatal:', err);
  process.exit(2);
});
