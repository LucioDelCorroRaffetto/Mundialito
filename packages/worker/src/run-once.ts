/**
 * One-shot runner for Render Cron Jobs.
 * Runs all worker jobs once and exits.
 * Render calls this every 2 minutes via the Cron Job config.
 *
 * NOTE: poll-live / POST /sync is intentionally NOT called here.
 * The API process has its own auto-sync (services/auto-sync.ts) that runs
 * every 3 min (football-data/ESPN) + every 20s live tick (ESPN + FIFA).
 * Calling /sync from the worker too was doubling all external API calls and
 * burning ~50% of Render's 5 GB free bandwidth allowance.
 */
import 'dotenv/config';
import { sendDeadlineReminders } from './jobs/send-deadline-reminders.js';
import { sendFantasyDeadlineReminders } from './jobs/send-fantasy-deadline-reminders.js';

async function main() {
  console.log('[run-once] starting at', new Date().toISOString());

  try {
    await sendDeadlineReminders();
  } catch (err) {
    console.error('[run-once] deadline-reminders error:', err);
  }

  try {
    await sendFantasyDeadlineReminders();
  } catch (err) {
    console.error('[run-once] fantasy-deadline-reminders error:', err);
  }

  console.log('[run-once] done');
  process.exit(0);
}

main().catch(err => {
  console.error('[run-once] fatal:', err);
  process.exit(1);
});
