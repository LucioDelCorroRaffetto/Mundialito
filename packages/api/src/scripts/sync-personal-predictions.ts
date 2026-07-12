/**
 * Re-sincroniza las predicciones de la LIGA PERSONAL con el último pronóstico
 * real del usuario. Repara la divergencia histórica del bug de edición:
 * upsert-prediction con `leagueId` explícito no tocaba la predicción ya
 * existente en la liga personal, así que el "espejo canónico" que lee el
 * historial del perfil quedaba congelado en el PRIMER pronóstico aunque el
 * usuario lo editara después (y se puntuaba contra ese marcador viejo).
 * El fix en upsert-prediction.ts evita que vuelva a pasar; este script
 * arregla las filas ya divergentes.
 *
 * Criterio: para cada (user, match), el pronóstico vigente es el de la liga
 * NO personal con updated_at más reciente (last-write-wins, igual que el fix).
 * Si difiere del de la liga personal, se copia el marcador y — si el partido
 * está finished con score cargado — se recalculan los puntos con la misma
 * lógica que finalize-match (scoringResult de-bumpea penales).
 *
 *   npx tsx src/scripts/sync-personal-predictions.ts        # dry-run
 *   FIX=1 npx tsx src/scripts/sync-personal-predictions.ts  # aplica
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { calculatePoints, scoringResult } from '../lib/scoring.js';

const FIX = process.env.FIX === '1';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface Row {
  personal_pred_id: number;
  user_id: number;
  match_id: number;
  p_home: number;
  p_away: number;
  p_points: number | null;
  l_home: number;
  l_away: number;
  status: string;
  m_home: number | null;
  m_away: number | null;
  decided_by_penalties: number | null;
}

// Última predicción no-personal por (user, match) vs. la de la liga personal.
// El desempate por id cubre propagaciones iniciales con updated_at idéntico
// (en ese caso los marcadores coinciden y la fila no aparece igual).
const res = await db.execute(`
  SELECT
    pp.id AS personal_pred_id,
    pp.user_id, pp.match_id,
    pp.home_score AS p_home, pp.away_score AS p_away, pp.points AS p_points,
    lp.home_score AS l_home, lp.away_score AS l_away,
    m.status, m.home_score AS m_home, m.away_score AS m_away,
    m.decided_by_penalties
  FROM predictions pp
  JOIN leagues pl ON pl.id = pp.league_id AND pl.is_personal = 1
  JOIN matches m ON m.id = pp.match_id
  JOIN (
    SELECT p.user_id, p.match_id, p.home_score, p.away_score,
           ROW_NUMBER() OVER (
             PARTITION BY p.user_id, p.match_id
             ORDER BY p.updated_at DESC, p.id DESC
           ) AS rn
    FROM predictions p
    JOIN leagues l ON l.id = p.league_id AND l.is_personal = 0
  ) lp ON lp.user_id = pp.user_id AND lp.match_id = pp.match_id AND lp.rn = 1
  WHERE (lp.home_score != pp.home_score OR lp.away_score != pp.away_score)
  ORDER BY pp.user_id, pp.match_id
`);

const rows = res.rows as unknown as Row[];
console.log(`Predicciones personales divergentes: ${rows.length}`);

let pointsChanged = 0;
for (const r of rows) {
  const finished = r.status === 'finished' && r.m_home != null && r.m_away != null;
  const newPoints = finished
    ? calculatePoints(
        { homeScore: r.l_home, awayScore: r.l_away },
        scoringResult({
          homeScore: r.m_home,
          awayScore: r.m_away,
          decidedByPenalties: r.decided_by_penalties,
        }),
      )
    : r.p_points;

  const ptsNote = finished && newPoints !== r.p_points
    ? ` | puntos ${r.p_points} → ${newPoints}`
    : '';
  if (ptsNote) pointsChanged++;
  console.log(
    `  user ${r.user_id} match ${r.match_id} | personal ${r.p_home}-${r.p_away}` +
    ` → vigente ${r.l_home}-${r.l_away}${ptsNote}`,
  );

  if (FIX) {
    await db.execute({
      sql: `UPDATE predictions
            SET home_score = ?, away_score = ?, points = ?,
                updated_at = (datetime('now'))
            WHERE id = ?`,
      args: [r.l_home, r.l_away, newPoints, r.personal_pred_id],
    });
  }
}

console.log(`\nDivergentes: ${rows.length} (con cambio de puntos: ${pointsChanged})`);
if (!FIX && rows.length > 0) {
  console.log('(dry-run) Para reparar: FIX=1 npx tsx src/scripts/sync-personal-predictions.ts');
} else if (FIX) {
  console.log(`Reparados: ${rows.length}`);
}

db.close();
