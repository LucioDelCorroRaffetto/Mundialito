import { db } from '../db/client.js';
import { fetchLiveFixtures } from '../providers/api-football.js';
import { canMakeRequest, incrementQuota, getTodayCount } from '../quota/tracker.js';
import { finalizeMatch } from './finalize-match.js';

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'INT']);

export async function pollLiveMatches(): Promise<void> {
  // Check if there are any matches in the DB that should be live right now
  const now = new Date().toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const pendingResult = await db.$client.execute({
    sql: `SELECT COUNT(*) as cnt FROM matches
          WHERE status IN ('scheduled', 'live')
          AND kickoff_utc <= ?
          AND kickoff_utc >= ?`,
    args: [now, threeHoursAgo],
  });

  const pendingCount = (pendingResult.rows[0] as unknown as { cnt: number })?.cnt ?? 0;

  if (pendingCount === 0) {
    // No active or recently-started matches — skip API call
    return;
  }

  // Check quota
  if (!(await canMakeRequest())) {
    const used = await getTodayCount();
    console.warn(`[poll-live] Quota exhausted (${used} requests today) — skipping`);
    return;
  }

  console.log(`[poll-live] Fetching live fixtures (${pendingCount} pending matches)...`);

  let fixtures;
  try {
    fixtures = await fetchLiveFixtures();
    await incrementQuota();
  } catch (err) {
    console.error('[poll-live] Error fetching live fixtures:', err);
    return;
  }

  if (fixtures.length === 0) {
    console.log('[poll-live] No live fixtures from API');
    return;
  }

  console.log(`[poll-live] ${fixtures.length} live fixture(s) returned`);

  for (const fixture of fixtures) {
    const homeScore = fixture.goals.home ?? 0;
    const awayScore = fixture.goals.away ?? 0;
    const status = fixture.fixture.status.short;
    const elapsed = fixture.fixture.status.elapsed;
    const apiFixtureId = fixture.fixture.id;

    // Map API-Football fixture ID to our match via api_fixture_id column
    const matchResult = await db.$client.execute({
      sql: `SELECT id, status, home_score, away_score FROM matches
            WHERE api_fixture_id = ?
               OR (
                 status IN ('scheduled', 'live')
                 AND kickoff_utc <= ?
               )
            LIMIT 1`,
      args: [apiFixtureId, now],
    });

    if (matchResult.rows.length === 0) continue;

    const match = matchResult.rows[0] as unknown as {
      id: number;
      status: string;
      home_score: number | null;
      away_score: number | null;
    };

    if (FINISHED_STATUSES.has(status) && match.status !== 'finished') {
      // Match is done — finalize it
      console.log(`[poll-live] Finalizing match ${match.id} — ${homeScore}:${awayScore}`);
      await finalizeMatch(match.id, homeScore, awayScore);
    } else if (LIVE_STATUSES.has(status)) {
      // Update live score without finalizing
      await db.$client.execute({
        sql: `UPDATE matches SET status = 'live', home_score = ?, away_score = ? WHERE id = ?`,
        args: [homeScore, awayScore, match.id],
      });
      console.log(`[poll-live] Updated match ${match.id} live score: ${homeScore}:${awayScore} (${elapsed ?? '?'}')`);
    }
  }
}
