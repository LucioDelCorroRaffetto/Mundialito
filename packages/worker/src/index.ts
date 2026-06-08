import cron from 'node-cron';
// poll-live is intentionally disabled for the WC 2026 run. The API process
// has its own auto-sync (services/auto-sync.ts) that handles match status,
// scoring, achievements, fantasy recompute, and WS broadcast through a
// single well-tested code path. Letting the worker also write to the same
// DB doubles the surface area without any benefit, and the worker's path
// had three concrete bugs at audit time:
//   - inlined `calculatePoints` returned 1 pt for empate acertado (the
//     shared lib returns 3).
//   - the `api_fixture_id = ? OR (status, kickoff)` fallback SQL was
//     writing scores to arbitrary match rows because every match in the DB
//     has apiFixtureId = null.
//   - finalize-match never called checkAchievements / recomputeFantasy /
//     broadcastMatchUpdate, so the achievements and fantasy standings drifted.
// The scheduling line stays here, commented, so it's easy to bring back
// once apiFixtureId is backfilled and the three bugs are fully resolved.
// import { pollLiveMatches } from './jobs/poll-live.js';
import { sendDeadlineReminders } from './jobs/send-deadline-reminders.js';

// Every 5 minutes: deadline reminders
cron.schedule('*/5 * * * *', async () => {
  try {
    await sendDeadlineReminders();
  } catch (err) {
    console.error('[worker] deadline-reminders error:', err);
  }
});

console.log('Mundialito worker started');
console.log('Jobs: deadline-reminders (*/5min). poll-live is DISABLED — API auto-sync owns scoring.');
