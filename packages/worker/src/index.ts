import cron from 'node-cron';
import { pollLiveMatches } from './jobs/poll-live.js';

// Every 2 minutes: poll live scores
cron.schedule('*/2 * * * *', pollLiveMatches);

console.log('Mundialito worker started');
