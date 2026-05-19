/**
 * One-shot runner for Render Cron Jobs.
 * Runs all worker jobs once and exits.
 * Render calls this every 2 minutes via the Cron Job config.
 */
import 'dotenv/config';
import { pollLiveMatches } from './jobs/poll-live.js';
import { sendDeadlineReminders } from './jobs/send-deadline-reminders.js';

async function main() {
  console.log('[run-once] starting at', new Date().toISOString());

  try {
    await pollLiveMatches();
  } catch (err) {
    console.error('[run-once] poll-live error:', err);
  }

  try {
    await sendDeadlineReminders();
  } catch (err) {
    console.error('[run-once] deadline-reminders error:', err);
  }

  console.log('[run-once] done');
  process.exit(0);
}

main().catch(err => {
  console.error('[run-once] fatal:', err);
  process.exit(1);
});
