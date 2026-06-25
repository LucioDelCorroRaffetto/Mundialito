/**
 * Recalcula `predictions.points` para partidos finished contra el marcador
 * actual de la tabla `matches`. Repara datos viejos que quedaron con puntos
 * obsoletos — ej. el bug donde un partido cerrado por el pitazo final FIFA a
 * 2-0 puntuaba un pronóstico 2-0 como 5 pts (exacto) y luego el feed corregía
 * el marcador a 3-0 SIN re-puntuar (la corrección llegaba con el feed todavía
 * en 'live', y el re-score se gateaba por el status crudo del feed en vez del
 * status efectivo). El fix en sync-scores/sync-espn evita que vuelva a pasar;
 * este script arregla las filas ya escritas mal.
 *
 *   npx tsx src/scripts/recompute-prediction-points.ts            # dry-run, todos los finished
 *   MATCH_ID=49 npx tsx src/scripts/recompute-prediction-points.ts  # dry-run, solo match 49
 *   FIX=1 MATCH_ID=49 npx tsx src/scripts/recompute-prediction-points.ts  # aplica
 *
 * NO toca partidos score_locked (marcador corregido a mano por el admin: sus
 * puntos ya están bien y el feed no los debe tocar).
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { calculatePoints } from '../lib/scoring.js';

const FIX = process.env.FIX === '1';
const MATCH_ID = process.env.MATCH_ID ? Number(process.env.MATCH_ID) : null;

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface PredRow {
  id: number;
  match_id: number;
  user_id: number;
  pred_home: number;
  pred_away: number;
  points: number | null;
  match_home: number | null;
  match_away: number | null;
}

const whereMatch = MATCH_ID != null ? `AND m.id = ${MATCH_ID}` : '';
const res = await db.execute(`
  SELECT
    p.id, p.match_id, p.user_id,
    p.home_score AS pred_home, p.away_score AS pred_away, p.points,
    m.home_score AS match_home, m.away_score AS match_away
  FROM predictions p
  JOIN matches m ON m.id = p.match_id
  WHERE m.status = 'finished'
    AND m.score_locked = 0
    AND m.home_score IS NOT NULL
    AND m.away_score IS NOT NULL
    ${whereMatch}
`);

const rows = res.rows as unknown as PredRow[];
console.log(`Pronósticos a evaluar: ${rows.length}${MATCH_ID != null ? ` (match ${MATCH_ID})` : ''}`);

let mismatches = 0;
for (const r of rows) {
  const correct = calculatePoints(
    { homeScore: r.pred_home, awayScore: r.pred_away },
    { homeScore: r.match_home as number, awayScore: r.match_away as number },
  );
  if (r.points === correct) continue;
  mismatches++;
  console.log(
    `  match ${r.match_id} | pred ${r.pred_home}-${r.pred_away} vs ` +
    `${r.match_home}-${r.match_away} | puntos ${r.points} → ${correct}`,
  );
  if (FIX) {
    await db.execute({
      sql: `UPDATE predictions SET points = ?, updated_at = (datetime('now')) WHERE id = ?`,
      args: [correct, r.id],
    });
  }
}

console.log(`\nDesfasados: ${mismatches}`);
if (!FIX && mismatches > 0) {
  console.log(`(dry-run) Para reparar: FIX=1 ${MATCH_ID != null ? `MATCH_ID=${MATCH_ID} ` : ''}npx tsx src/scripts/recompute-prediction-points.ts`);
} else if (FIX) {
  console.log(`Reparados: ${mismatches}`);
}

db.close();
