/**
 * Finaliza un partido en vivo apenas una señal confiable confirma el cierre
 * — el evento "final whistle" (Type 26) de la timeline FIFA, que aparece al
 * pitazo. football-data.org y ESPN suelen tardar ~10 min en marcar FINISHED,
 * así que el partido quedaba "EN VIVO" un rato largo después de terminar.
 *
 * Usa el score que las fuentes ya mantuvieron actualizado durante el juego
 * (al pitazo final ya no hay más goles, así que el score en DB es el final).
 * Es idempotente y defensivo: no hace nada si el partido no está 'live' o si
 * todavía no hay score cargado. Si el score se corrigiera después, el sync de
 * scores lo re-evalúa con newStatus=finished y re-puntúa.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, predictions } from '../db/schema/index.js';
import { calculatePoints } from '../lib/scoring.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';
import { broadcastMatchUpdate } from '../ws/broadcast.js';
import { checkAchievements } from './achievement-service.js';
import { resolveTournamentPredictions } from './tournament-resolver.js';

export interface FinalizeResult {
  finalized: boolean;
  reason?: string;
  scored?: number;
}

export async function finalizeMatchFromFinalWhistle(matchId: number): Promise<FinalizeResult> {
  const m = await db
    .select({
      id: matches.id,
      status: matches.status,
      round: matches.round,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  if (!m) return { finalized: false, reason: 'not found' };
  // Solo finalizamos partidos en juego o suspendidos-pero-reanudados. Si una
  // fuente ya lo cerró (status finished) este tick, no hay nada que hacer.
  // Incluimos 'suspended' porque sync-scores puede mantener ese estado
  // mientras el partido se juega (para evitar el auto-cierre de reconcile),
  // y el final whistle FIFA debe poder cerrar el partido sin depender de que
  // la DB haya vuelto a 'live'.
  if (m.status !== 'live' && m.status !== 'suspended') return { finalized: false, reason: `status ${m.status}` };
  // Sin score no podemos puntuar. Dejamos que las fuentes lo cierren cuando
  // tengan el marcador (caso rarísimo: pitazo sin score sincronizado aún).
  if (m.homeScore == null || m.awayScore == null) return { finalized: false, reason: 'no score yet' };

  const [updated] = await db
    .update(matches)
    .set({ status: 'finished', liveStatus: 'full_time' })
    .where(eq(matches.id, matchId))
    .returning();

  // Puntuar pronósticos — misma lógica que los syncs de score. Trackeamos
  // un disparo de achievement por usuario (puede tener N filas, una por liga).
  const matchPredictions = await db.select().from(predictions).where(eq(predictions.matchId, matchId));
  const scoredUsers = new Map<number, number>();
  for (const pred of matchPredictions) {
    const pts = calculatePoints(
      { homeScore: pred.homeScore, awayScore: pred.awayScore },
      { homeScore: m.homeScore, awayScore: m.awayScore },
    );
    await db
      .update(predictions)
      .set({ points: pts, updatedAt: sql`(datetime('now'))` })
      .where(eq(predictions.id, pred.id));
    const prev = scoredUsers.get(pred.userId) ?? -1;
    if (pts > prev) scoredUsers.set(pred.userId, pts);
  }
  for (const [uid, pts] of scoredUsers) {
    checkAchievements(uid, { type: 'prediction_scored', matchId, points: pts }).catch(() => {});
  }

  // Recompute fantasy (el sync de stats FIFA del mismo tick ya pudo haberlo
  // hecho; es idempotente).
  try {
    await recomputeAllFantasyPoints();
  } catch (err) {
    console.error('[finalize-match] fantasy recompute failed:', err);
  }

  // Si lo que se cerró fue la final, puntuar las predicciones de Copa
  // (campeón, goleador, etc.). Idempotente; no-op si la final no está firme.
  if (m.round === 'final') {
    try {
      const { resolved, updated: tpUpdated } = await resolveTournamentPredictions();
      if (resolved && tpUpdated > 0) {
        console.log(`[finalize-match] predicciones de Copa puntuadas: ${tpUpdated} filas`);
      }
    } catch (err) {
      console.error('[finalize-match] tournament predictions resolve failed:', err);
    }
  }

  if (updated) broadcastMatchUpdate(updated);
  console.log(
    `[finalize-match] match ${matchId} cerrado por final whistle FIFA ` +
    `(${m.homeScore}-${m.awayScore}), ${matchPredictions.length} pronósticos puntuados`,
  );
  return { finalized: true, scored: matchPredictions.length };
}
