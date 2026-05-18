// Sends push notifications to users who haven't predicted matches
// starting in the next 60 minutes.
// This is a stub — full implementation requires web-push + DB query of subscriptions.

export async function sendDeadlineReminders(): Promise<void> {
  console.log('[deadline-reminders] Checking upcoming matches...');
  // TODO Sprint 7:
  // 1. SELECT matches WHERE kickoff_utc BETWEEN now() AND now()+60min AND status='scheduled'
  // 2. For each match, find users in leagues who have no prediction for it
  // 3. SELECT their push_subscriptions
  // 4. Send push via sendPushNotification()
  // Rate limit: skip if user opened app 5+ times that day (no tracking yet)
}
