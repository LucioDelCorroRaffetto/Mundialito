/**
 * Standalone CLI runner for the FIFA pipeline self-test.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/diagnose-fifa.ts
 *
 * Exits 0 if every check passes, non-zero otherwise — so it can be wired
 * into a Render cron / GitHub Action without parsing the JSON output.
 */
import 'dotenv/config';
import { diagnoseFifaFlow } from '../services/diagnose-fifa-flow.js';

async function main() {
  console.log('[diagnose-fifa] running self-test…');
  const result = await diagnoseFifaFlow();

  console.log(`\nReference: ${result.reference}`);
  console.log(`Duration:  ${result.durationMs}ms`);
  console.log(`Totals:    goals=${result.totals.goals} assists=${result.totals.assists} ` +
              `yellow=${result.totals.yellow} red=${result.totals.red}\n`);

  for (const c of result.checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name.padEnd(22)} ${c.details}`);
  }

  console.log(`\n${result.ok ? '✅ ALL CHECKS PASSED' : '❌ SELF-TEST FAILED'}`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[diagnose-fifa] fatal:', err);
  process.exit(2);
});
