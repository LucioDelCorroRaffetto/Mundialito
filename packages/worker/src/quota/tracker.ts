import { db } from '../db/client.js';

const DAILY_LIMIT = Number(process.env.API_FOOTBALL_DAILY_LIMIT ?? '95'); // leave 5 buffer

/**
 * Simple quota tracker using a local SQLite counter.
 * Resets automatically each calendar day.
 */
export async function canMakeRequest(): Promise<boolean> {
  // Ensure quota table exists
  await db.$client.execute(
    'CREATE TABLE IF NOT EXISTS api_quota (date TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)'
  );

  const today = new Date().toISOString().split('T')[0];

  // Upsert today's row
  await db.$client.execute({
    sql: 'INSERT INTO api_quota (date, count) VALUES (?, 0) ON CONFLICT(date) DO NOTHING',
    args: [today],
  });

  const result = await db.$client.execute({
    sql: 'SELECT count FROM api_quota WHERE date = ?',
    args: [today],
  });
  const currentCount = (result.rows[0] as unknown as { count: number })?.count ?? 0;

  return currentCount < DAILY_LIMIT;
}

export async function incrementQuota(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await db.$client.execute({
    sql: 'UPDATE api_quota SET count = count + 1 WHERE date = ?',
    args: [today],
  });
}

export async function getTodayCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const result = await db.$client.execute({
    sql: 'SELECT count FROM api_quota WHERE date = ?',
    args: [today],
  });
  return (result.rows[0] as unknown as { count: number })?.count ?? 0;
}
