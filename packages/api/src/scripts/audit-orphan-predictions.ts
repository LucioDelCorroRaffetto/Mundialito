/**
 * Auditoría: para cada par (usuario, partido) donde el usuario tiene
 * AL MENOS UNA predicción, lista todas las ligas del usuario donde NO
 * existe esa predicción. Indicador del bug "Edu no aparece en Zle Store".
 *
 *   npx tsx src/scripts/audit-orphan-predictions.ts
 *   FIX=1 npx tsx src/scripts/audit-orphan-predictions.ts   # rellena
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const FIX = process.env.FIX === '1';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface MissRow {
  user_id: number;
  username: string;
  match_id: number;
  league_id: number;
  league_name: string;
  home_score: number;
  away_score: number;
}

// Para cada predicción del user, listar ligas suyas donde le falte una pred del MISMO match.
const res = await db.execute(`
  SELECT
    u.id AS user_id, u.username,
    p.match_id,
    l.id AS league_id, l.name AS league_name,
    p.home_score, p.away_score
  FROM predictions p
  JOIN users u ON u.id = p.user_id
  JOIN league_members lm ON lm.user_id = p.user_id
  JOIN leagues l ON l.id = lm.league_id
  WHERE NOT EXISTS (
    SELECT 1 FROM predictions p2
    WHERE p2.user_id = p.user_id
      AND p2.match_id = p.match_id
      AND p2.league_id = l.id
  )
  GROUP BY u.id, p.match_id, l.id
`);

const rows = res.rows as unknown as MissRow[];
console.log(`Predicciones faltantes detectadas: ${rows.length}`);

// Tabla resumen por usuario
const byUser = new Map<number, { username: string; count: number; ligas: Set<string> }>();
for (const r of rows) {
  const e = byUser.get(r.user_id) ?? { username: r.username, count: 0, ligas: new Set() };
  e.count++;
  e.ligas.add(r.league_name);
  byUser.set(r.user_id, e);
}
console.log('\nPor usuario:');
for (const [uid, e] of byUser) {
  console.log(`  ${uid} ${e.username}: ${e.count} preds faltantes en ligas: ${[...e.ligas].join(', ')}`);
}

if (!FIX) {
  console.log(`\n(dry-run) Para reparar: FIX=1 npx tsx src/scripts/audit-orphan-predictions.ts`);
} else {
  // Necesitamos un home/away por (user, match) — usamos la fila guía (cualquier league).
  // El SELECT ya nos da una versión por user+match+league_missing; los home/away vienen
  // de la fila "p" guía que ya tiene la pred del usuario.
  console.log('\nInsertando faltantes…');
  const { calculatePoints } = await import('../lib/scoring.js');

  // Pre-cargo resultados de partidos finished/live para calcular pts.
  const matchRes = await db.execute(`SELECT id, status, home_score, away_score FROM matches`);
  const matchMap = new Map<number, { status: string; hs: number | null; as: number | null }>();
  for (const m of matchRes.rows as any[]) {
    matchMap.set(Number(m.id), { status: String(m.status), hs: m.home_score, as: m.away_score });
  }

  let inserted = 0, scored = 0;
  for (const r of rows) {
    const m = matchMap.get(Number(r.match_id));
    let pts: number | null = null;
    if (m && m.status === 'finished' && m.hs != null && m.as != null) {
      pts = calculatePoints({ homeScore: r.home_score, awayScore: r.away_score }, { homeScore: m.hs, awayScore: m.as });
    }
    const ins = await db.execute({
      sql: `INSERT INTO predictions (user_id, match_id, league_id, home_score, away_score, points)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING`,
      args: [r.user_id, r.match_id, r.league_id, r.home_score, r.away_score, pts],
    });
    if (ins.rowsAffected) {
      inserted++;
      if (pts != null) scored++;
    }
  }
  console.log(`Insertadas: ${inserted} (con puntos calculados: ${scored})`);
}

db.close();
