// TODO (Sprint 6): Integrate with API-Football (or equivalent) to fetch live
// scores and trigger finalizeMatch() when a match transitions to 'finished'.
// For now this is a stub that just logs.

export async function pollLiveMatches(): Promise<void> {
  console.log('[poll-live] Polling live matches...');
  // TODO: query API-Football for in-progress matches
  // TODO: compare remote score with local DB
  // TODO: call finalizeMatch(matchId, homeScore, awayScore) when status === 'finished'
}
