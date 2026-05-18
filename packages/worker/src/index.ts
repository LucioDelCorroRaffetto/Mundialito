import cron from 'node-cron';
import { pollLiveMatches } from './jobs/poll-live.js';
import { sendDeadlineReminders } from './jobs/send-deadline-reminders.js';

// Every 2 minutes: poll live scores
cron.schedule('*/2 * * * *', pollLiveMatches);

// Every 5 minutes: check for upcoming match deadlines
cron.schedule('*/5 * * * *', sendDeadlineReminders);

console.log('Mundialito worker started');
