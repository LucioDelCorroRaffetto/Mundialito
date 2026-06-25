/**
 * Audita logros basados en "resultado exacto" que pudieron quedar otorgados
 * sin sustento después de corregir `predictions.points` (el recompute de
 * achievements es ADITIVO: nunca revoca). Solo detecta —y opcionalmente
 * revoca— los dos únicos logros que una corrección de marcador puede dejar
 * sin respaldo:
 *
 *   - exact_score:  el usuario lo tiene pero ya no posee NINGÚN pronóstico
 *                   con points = 5.
 *   - triple_exact: lo tiene pero ya no posee 3 exactos en un mismo día UTC.
 *
 * Los demás logros de scoring (hot_streak, goalfest, bullseye_zero,
 * perfect_group, weekend_perfect, marathon, survivor) no pueden caerse por una
 * corrección que conserva el signo del resultado, así que no se auditan acá.
 *
 *   npx tsx src/scripts/audit-stale-achievements.ts            # dry-run
 *   FIX=1 npx tsx src/scripts/audit-stale-achievements.ts      # revoca
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const FIX = process.env.FIX === '1';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface Holder {
  user_id: number;
  username: string;
}

async function holdersOf(slug: string): Promise<Holder[]> {
  const r = await db.execute({
    sql: `SELECT ua.user_id, u.username
          FROM user_achievements ua
          JOIN users u ON u.id = ua.user_id
          WHERE ua.achievement_slug = ?`,
    args: [slug],
  });
  return r.rows as unknown as Holder[];
}

async function revoke(userId: number, slug: string) {
  if (!FIX) return;
  await db.execute({
    sql: `DELETE FROM user_achievements WHERE user_id = ? AND achievement_slug = ?`,
    args: [userId, slug],
  });
}

// Exacts (points = 5) por usuario, deduplicados por match (un mismo pronóstico
// vive en N ligas). Devuelve, por usuario, la lista de días UTC con su conteo.
async function exactsByUserDay(): Promise<Map<number, Map<string, Set<number>>>> {
  const r = await db.execute(`
    SELECT p.user_id, p.match_id, substr(m.kickoff_utc, 1, 10) AS day
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.points = 5 AND m.status = 'finished'
  `);
  const byUser = new Map<number, Map<string, Set<number>>>();
  for (const row of r.rows as unknown as Array<{ user_id: number; match_id: number; day: string }>) {
    let days = byUser.get(row.user_id);
    if (!days) { days = new Map(); byUser.set(row.user_id, days); }
    let set = days.get(row.day);
    if (!set) { set = new Set(); days.set(row.day, set); }
    set.add(row.match_id);
  }
  return byUser;
}

const exacts = await exactsByUserDay();

// ── exact_score ──────────────────────────────────────────────────────────────
const exactHolders = await holdersOf('exact_score');
let revokedExact = 0;
console.log(`exact_score: ${exactHolders.length} holders`);
for (const h of exactHolders) {
  const hasAnyExact = (exacts.get(h.user_id)?.size ?? 0) > 0;
  if (!hasAnyExact) {
    console.log(`  ✗ ${h.username} (#${h.user_id}) ya no tiene ningún exacto → revocar`);
    await revoke(h.user_id, 'exact_score');
    revokedExact++;
  }
}

// ── triple_exact ─────────────────────────────────────────────────────────────
const tripleHolders = await holdersOf('triple_exact');
let revokedTriple = 0;
console.log(`triple_exact: ${tripleHolders.length} holders`);
for (const h of tripleHolders) {
  const days = exacts.get(h.user_id);
  const hasTriple = days ? [...days.values()].some((s) => s.size >= 3) : false;
  if (!hasTriple) {
    console.log(`  ✗ ${h.username} (#${h.user_id}) ya no tiene 3 exactos en un día → revocar`);
    await revoke(h.user_id, 'triple_exact');
    revokedTriple++;
  }
}

console.log(`\nSin sustento — exact_score: ${revokedExact}, triple_exact: ${revokedTriple}`);
console.log(FIX ? 'Revocados.' : '(dry-run) Para revocar: FIX=1 npx tsx src/scripts/audit-stale-achievements.ts');

db.close();
