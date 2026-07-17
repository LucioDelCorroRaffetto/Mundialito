/**
 * GET /tournament-predictions/outcome
 *
 * Resultado resuelto del torneo con la EXPLICACIÓN de cada decisión de
 * sorpresa/decepción: no solo quiénes entraron, sino también las candidatas
 * rechazadas y el porqué de cada sí y cada no (pedido del PO: cuando se
 * liberan los puntos tiene que quedar claro por qué Alemania es decepción y
 * Portugal no, por qué Cabo Verde es sorpresa y Bosnia no).
 *
 * Hasta que la final esté finished devuelve `resolved:false` PERO con un
 * bloque `provisional`: sorpresas/decepciones al día de hoy (firmes para los
 * eliminados — su profundidad ya no cambia), la tabla de la valla menos
 * vencida (PJ / goles en contra / promedio) y el goleador parcial. Para que
 * la definición de cada categoría sea transparente antes de liberar puntos.
 */
import type { Request, Response } from 'express';
import { inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams, players } from '../../../db/schema/index.js';
import {
  resolveTournamentOutcomeDetailed,
  resolveProvisionalOutcome,
  type DefenseRow,
} from '../../../services/tournament-resolver.js';
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

/** Junta todos los teamIds referenciados para resolverlos en una sola query. */
function collectTeamIds(
  candidates: CategoryCandidate[],
  defenseTable: DefenseRow[],
  extra: Array<number | null | undefined>,
): Set<number> {
  const ids = new Set<number>();
  for (const id of extra) if (id != null) ids.add(id);
  for (const c of candidates) {
    ids.add(c.teamId);
    if (c.meritRivalId != null) ids.add(c.meritRivalId);
    if (c.upsetLossRivalId != null) ids.add(c.upsetLossRivalId);
  }
  for (const d of defenseTable) ids.add(d.teamId);
  return ids;
}

async function teamMapFor(ids: Set<number>): Promise<Map<number, TeamRef>> {
  const rows = ids.size
    ? await db
        .select({ id: teams.id, code: teams.code, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, [...ids]))
    : [];
  return new Map(rows.map((t) => [t.id, t]));
}

function serializeCandidates(
  candidates: CategoryCandidate[],
  teamById: Map<number, TeamRef>,
  explain: (c: CategoryCandidate, rivalName: string | null) => string,
  rivalIdOf: (c: CategoryCandidate) => number | null | undefined,
) {
  return candidates.map((c) => ({
    team: teamById.get(c.teamId) ?? null,
    included: c.included,
    gap: c.gap,
    reason: explain(c, rivalIdOf(c) != null ? teamById.get(rivalIdOf(c)!)?.name ?? null : null),
  }));
}

/** Tabla de valla lista para mostrar: solo los que califican (≥ octavos). */
function serializeDefense(defenseTable: DefenseRow[], teamById: Map<number, TeamRef>) {
  return defenseTable
    .filter((d) => d.qualifies)
    .map((d) => ({
      team: teamById.get(d.teamId) ?? null,
      played: d.played,
      goalsAgainst: d.ga,
      avg: Number(d.avg.toFixed(3)),
    }));
}

export async function getTournamentOutcomeHandler(_req: Request, res: Response): Promise<void> {
  const detailed = await resolveTournamentOutcomeDetailed();

  if (!detailed) {
    // Torneo en curso: estado provisional para transparencia de categorías.
    const prov = await resolveProvisionalOutcome();
    const teamById = await teamMapFor(
      collectTeamIds([...prov.surprises, ...prov.disappointments], prov.defenseTable, []),
    );
    const playerRows = prov.topScorerPlayerIds.length
      ? await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, prov.topScorerPlayerIds))
      : [];
    res.json({
      resolved: false,
      provisional: {
        surprises: serializeCandidates(prov.surprises, teamById, explainSurprise, (c) => c.meritRivalId),
        disappointments: serializeCandidates(
          prov.disappointments,
          teamById,
          explainDisappointment,
          (c) => c.upsetLossRivalId,
        ),
        defenseTable: serializeDefense(prov.defenseTable, teamById),
        topScorers: playerRows.map((p) => ({ ...p, goals: prov.maxGoals })),
      },
    });
    return;
  }

  const { outcome, surprises, disappointments, defenseTable } = detailed;

  const teamById = await teamMapFor(
    collectTeamIds([...surprises, ...disappointments], defenseTable, [
      outcome.championTeamId,
      outcome.runnerUpTeamId,
      outcome.thirdPlaceTeamId,
      ...outcome.bestDefenseTeamIds,
    ]),
  );
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
    defenseTable: serializeDefense(defenseTable, teamById),
    surprises: serializeCandidates(surprises, teamById, explainSurprise, (c) => c.meritRivalId),
    disappointments: serializeCandidates(
      disappointments,
      teamById,
      explainDisappointment,
      (c) => c.upsetLossRivalId,
    ),
  });
}
