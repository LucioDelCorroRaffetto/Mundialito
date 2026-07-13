/**
 * GET /tournament-predictions/outcome
 *
 * Resultado resuelto del torneo con la EXPLICACIÓN de cada decisión de
 * sorpresa/decepción: no solo quiénes entraron, sino también las candidatas
 * rechazadas y el porqué de cada sí y cada no (pedido del PO: cuando se
 * liberan los puntos tiene que quedar claro por qué Alemania es decepción y
 * Portugal no, por qué Cabo Verde es sorpresa y Bosnia no).
 *
 * Devuelve { resolved: false } hasta que la final esté finished — mismo
 * criterio que el resolver de puntos.
 */
import type { Request, Response } from 'express';
import { inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams, players } from '../../../db/schema/index.js';
import { resolveTournamentOutcomeDetailed } from '../../../services/tournament-resolver.js';
import type { CategoryCandidate } from '../../../lib/tournament-scoring.js';

const DEPTH_LABEL = [
  'fase de grupos',
  'dieciseisavos',
  'octavos',
  'cuartos',
  'semifinales',
  'la final',
  'campeón',
] as const;

interface TeamRef {
  id: number;
  code: string;
  name: string;
}

function explainSurprise(c: CategoryCandidate, rivalName: string | null): string {
  const expected = DEPTH_LABEL[c.expected];
  const reached = DEPTH_LABEL[c.depthReached];
  if (c.via === 'gap') {
    return `Se esperaba que no pase de ${expected} y llegó a ${reached}: superó su expectativa por ${c.gap} rondas.`;
  }
  if (c.via === 'gap_plus_merit') {
    const rival = rivalName ?? 'un rival muy superior';
    return `Se esperaba que no pase de ${expected} y llegó a ${reached} (+1 ronda), y además le sacó puntos a ${rival} (${c.meritEloDiff} pts de Elo arriba). Pasó de ronda dando pelea de verdad.`;
  }
  return `Superó su expectativa por 1 ronda (${expected} → ${reached}) pero sin ganarle ni empatarle a ningún rival grande: cumplió con avanzar, no sorprendió.`;
}

function explainDisappointment(c: CategoryCandidate, rivalName: string | null): string {
  const expected = DEPTH_LABEL[c.expected];
  const reached = DEPTH_LABEL[c.depthReached];
  if (c.via === 'gap') {
    return `Por historia y ranking se la esperaba al menos en ${expected} y quedó en ${reached}: ${-c.gap} rondas por debajo de su expectativa.`;
  }
  if (c.via === 'gap_plus_upset_loss') {
    const rival = rivalName ?? 'un rival muy inferior';
    return `Quedó 1 ronda por debajo de lo esperado (${expected} → ${reached}) y encima la eliminó ${rival} (${c.upsetLossEloDiff} pts de Elo abajo): un batacazo en contra que la historia no perdona.`;
  }
  return `Quedó 1 ronda por debajo de lo esperado (${expected} → ${reached}), pero perdió contra un rival de su nivel o superior: caer ajustado ante un grande no es decepcionar.`;
}

export async function getTournamentOutcomeHandler(_req: Request, res: Response): Promise<void> {
  const detailed = await resolveTournamentOutcomeDetailed();
  if (!detailed) {
    res.json({ resolved: false });
    return;
  }
  const { outcome, surprises, disappointments } = detailed;

  const teamIds = new Set<number>();
  for (const id of [outcome.championTeamId, outcome.runnerUpTeamId, outcome.thirdPlaceTeamId])
    if (id != null) teamIds.add(id);
  for (const id of outcome.bestDefenseTeamIds) teamIds.add(id);
  for (const c of [...surprises, ...disappointments]) {
    teamIds.add(c.teamId);
    if (c.meritRivalId != null) teamIds.add(c.meritRivalId);
    if (c.upsetLossRivalId != null) teamIds.add(c.upsetLossRivalId);
  }
  const teamRows = teamIds.size
    ? await db
        .select({ id: teams.id, code: teams.code, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, [...teamIds]))
    : [];
  const teamById = new Map<number, TeamRef>(teamRows.map((t) => [t.id, t]));
  const ref = (id: number | null): TeamRef | null => (id == null ? null : teamById.get(id) ?? null);

  const playerRows = outcome.topScorerPlayerIds.length
    ? await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(inArray(players.id, outcome.topScorerPlayerIds))
    : [];

  res.json({
    resolved: true,
    champion: ref(outcome.championTeamId),
    runnerUp: ref(outcome.runnerUpTeamId),
    thirdPlace: ref(outcome.thirdPlaceTeamId),
    topScorers: playerRows,
    bestDefense: outcome.bestDefenseTeamIds.map((id) => ref(id)).filter(Boolean),
    surprises: surprises.map((c) => ({
      team: ref(c.teamId),
      included: c.included,
      gap: c.gap,
      reason: explainSurprise(c, c.meritRivalId != null ? teamById.get(c.meritRivalId)?.name ?? null : null),
    })),
    disappointments: disappointments.map((c) => ({
      team: ref(c.teamId),
      included: c.included,
      gap: c.gap,
      reason: explainDisappointment(
        c,
        c.upsetLossRivalId != null ? teamById.get(c.upsetLossRivalId)?.name ?? null : null,
      ),
    })),
  });
}
