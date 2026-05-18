import cron from 'node-cron';
import { pollLiveMatches } from './jobs/poll-live.js';
import { sendDeadlineReminders } from './jobs/send-deadline-reminders.js';

// Every 2 minutes during match hours, but the job self-guards via quota + no-pending-matches check
cron.schedule('*/2 * * * *', async () => {
  try {
    await pollLiveMatches();
  } catch (err) {
    console.error('[worker] poll-live error:', err);
  }
});

// Every 5 minutes: deadline reminders
cron.schedule('*/5 * * * *', async () => {
  try {
    await sendDeadlineReminders();
  } catch (err) {
    console.error('[worker] deadline-reminders error:', err);
  }
});

console.log('Mundialito worker started');
console.log('Jobs: poll-live (*/2min) | deadline-reminders (*/5min)');
