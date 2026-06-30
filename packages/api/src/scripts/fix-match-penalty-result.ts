/**
 * Corrección puntual de un KO que el feed cerró empatado sin reportar la tanda.
 * Caso real (jun-2026): GER–PAR (M74) quedó 0-0 finished aunque PAR ganó por
 * penales, así que el cuadro no podía propagar al ganador (un 0-0 finished es
 * empate). Replica EXACTAMENTE lo que hace el endpoint admin update-match:
 *   - fija el marcador con +1 al ganador (convención del sync),
 *   - marca decided_by_penalties = 1 (para el "(pen.)" en cuadro/lista),
 *   - bloquea el score (scoreLocked) para que el feed no lo revierta,
 *   - re-puntúa las predicciones del partido,
 *   - recomputa fantasy y dispara achievements.
 *
 * Parámetros por env para reutilizarlo en otros cruces:
 *   MATCH_NUMBER (default 74), HOME_SCORE (0), AWAY_SCORE (1), PEN (1)
 *
 *   node dist/scripts/fix-match-penalty-result.js   (tras `npx tsc`)
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from '../services/fantasy-scoring-service.js';
import { checkAchievements } from '../services/achievement-service.js';

const MATCH_NUMBER = Number(process.env.MATCH_NUMBER ?? 74);
const HOME_SCORE = Number(process.env.HOME_SCORE ?? 0);
const AWAY_SCORE = Number(process.env.AWAY_SCORE ?? 1);
const PEN = process.env.PEN === '0' ? 0 : 1;

async function main() {
  const match = await db.select().from(matches).where(eq(matches.matchNumber, MATCH_NUMBER)).get();
  if (!match) throw new Error(`No existe el partido M${MATCH_NUMBER}`);

  console.log(
    `Antes: M${MATCH_NUMBER} [${match.status}] ${match.homeScore}-${match.awayScore} ` +
      `pen=${match.decidedByPenalties} locked=${match.scoreLocked}`,
  );

  const [updated] = await db
    .update(matches)
    .set({
      homeScore: HOME_SCORE,
      awayScore: AWAY_SCORE,
      status: 'finished',
      decidedByPenalties: PEN,
      scoreLocked: 1,
    })
    .where(eq(matches.id, match.id))
    .returning();

  console.log(
    `Después: M${MATCH_NUMBER} [${updated.status}] ${updated.homeScore}-${updated.awayScore} ` +
      `pen=${updated.decidedByPenalties} locked=${updated.scoreLocked}`,
  );

  // Re-puntuar predicciones (idéntico a update-match).
  const matchPredictions = await db.select().from(predictions).where(eq(predictions.matchId, match.id));
  const scoredUsers = new Map<number, number>();
  for (const pred of matchPredictions) {
    const pts = calculatePoints(
      { homeScore: pred.homeScore, awayScore: pred.awayScore },
      { homeScore: HOME_SCORE, awayScore: AWAY_SCORE },
    );
    await db
      .update(predictions)
      .set({ points: pts, updatedAt: sql`(datetime('now'))` })
      .where(eq(predictions.id, pred.id));
    const prev = scoredUsers.get(pred.userId) ?? -1;
    if (pts > prev) scoredUsers.set(pred.userId, pts);
  }
  console.log(`Predicciones re-puntuadas: ${matchPredictions.length} (usuarios: ${scoredUsers.size})`);

  try {
    await recomputeAllFantasyPoints();
    console.log('Fantasy recomputado.');
  } catch (err) {
    console.error('Fantasy recompute falló (la corrección del partido YA se aplicó):', err);
  }

  for (const [uid, pts] of scoredUsers) {
    checkAchievements(uid, { type: 'prediction_scored', matchId: match.id, points: pts }).catch(() => {});
  }
  console.log('Achievements disparados (best-effort). Listo.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
