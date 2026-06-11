import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql, and, asc, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions, leagueMembers, matches, teams, players } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';

const FIELDS = [
  'championTeamId',
  'runnerUpTeamId',
  'thirdPlaceTeamId',
  'topScorerPlayerId',
  'revelationTeamId',
  'surpriseEliminatedTeamId',
  'bestDefenseTeamId',
] as const;
type Field = (typeof FIELDS)[number];

export const upsertTournamentPredictionSchema = z.object({
  // When omitted, the prediction is applied across every league the user
  // belongs to. When provided, only that league is touched — EXCEPT for
  // fields that were previously null in other leagues, which still
  // propagate (first-time-per-field rule).
  leagueId: z.number().int().positive().optional(),
  championTeamId: z.number().int().positive().nullable().optional(),
  runnerUpTeamId: z.number().int().positive().nullable().optional(),
  thirdPlaceTeamId: z.number().int().positive().nullable().optional(),
  topScorerPlayerId: z.number().int().positive().nullable().optional(),
  revelationTeamId: z.number().int().positive().nullable().optional(),
  surpriseEliminatedTeamId: z.number().int().positive().nullable().optional(),
  bestDefenseTeamId: z.number().int().positive().nullable().optional(),
});

export async function upsertTournamentPredictionHandler(req: Request, res: Response) {
  const body = req.body as z.infer<typeof upsertTournamentPredictionSchema>;
  const { leagueId, ...payloadFields } = body;
  const userId = req.user!.id;

  // ── Tournament lock ───────────────────────────────────────────────────────
  // Originalmente este lock cerraba 5 min antes del partido inaugural. Lo
  // extendimos 24h porque mucha gente terminó de pronosticar el día del
  // arranque y la pestaña /tournament quedaba bloqueada antes de que
  // pudieran completar campeón/top scorer/etc. Esta ventana se cierra
  // el 2026-06-12 18:55 UTC (24h después del kickoff inaugural).
  const TOURNAMENT_LOCK_UTC = '2026-06-12T18:55:00Z';
  if (new Date(TOURNAMENT_LOCK_UTC) <= new Date()) {
    throw new AppError(
      'TOURNAMENT_LOCKED',
      'Los pronósticos del torneo están cerrados',
      409,
    );
  }

  // Resolve the user's leagues.
  const memberships = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  const userLeagueIds = memberships.map((m) => m.leagueId);
  if (userLeagueIds.length === 0) {
    throw new AppError('NO_LEAGUE', 'You must belong to at least one league to predict', 400);
  }
  if (leagueId != null && !userLeagueIds.includes(leagueId)) {
    throw new AppError('FORBIDDEN', 'Not a member of this league', 403);
  }

  // Validate that every team / player ID referenced by the payload exists in
  // the DB — otherwise the underlying INSERT throws a FK constraint error
  // and the client gets a generic 500 instead of a friendly 400.
  const teamIdFields = [
    'championTeamId', 'runnerUpTeamId', 'thirdPlaceTeamId',
    'revelationTeamId', 'surpriseEliminatedTeamId', 'bestDefenseTeamId',
  ] as const;
  const teamIdsToCheck = teamIdFields
    .map((f) => payloadFields[f])
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (teamIdsToCheck.length > 0) {
    const existingTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(inArray(teams.id, teamIdsToCheck));
    const existingIds = new Set(existingTeams.map((t) => t.id));
    for (const id of teamIdsToCheck) {
      if (!existingIds.has(id)) {
        throw new AppError('INVALID_REFERENCE', `Team ${id} no existe`, 400);
      }
    }
  }
  if (typeof payloadFields.topScorerPlayerId === 'number' && payloadFields.topScorerPlayerId > 0) {
    const existing = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, payloadFields.topScorerPlayerId))
      .get();
    if (!existing) {
      throw new AppError('INVALID_REFERENCE', `Player ${payloadFields.topScorerPlayerId} no existe`, 400);
    }
  }

  // Fetch any existing rows so we can decide field-by-field whether to
  // propagate. The rule: for each non-null field in the request, if NO
  // other league of the user has a non-null value yet, this is a first-time
  // pick and propagates across every league. If at least one league has a
  // value already, the field is per-league (only the targeted league is
  // touched, or every league if leagueId was omitted).
  const existingRows = await db
    .select()
    .from(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId));
  const existingByLeague = new Map<number, typeof existingRows[number]>();
  for (const row of existingRows) existingByLeague.set(row.leagueId, row);

  /**
   * For each league we may write to, compute the merged value of each
   * predictable field: keep whatever already exists, overlay the new value
   * when this league is targeted.
   */
  function mergedRowFor(lid: number) {
    const existing = existingByLeague.get(lid);
    const merged: Record<Field, number | null | undefined> = {
      championTeamId: existing?.championTeamId ?? null,
      runnerUpTeamId: existing?.runnerUpTeamId ?? null,
      thirdPlaceTeamId: existing?.thirdPlaceTeamId ?? null,
      topScorerPlayerId: existing?.topScorerPlayerId ?? null,
      revelationTeamId: existing?.revelationTeamId ?? null,
      surpriseEliminatedTeamId: existing?.surpriseEliminatedTeamId ?? null,
      bestDefenseTeamId: existing?.bestDefenseTeamId ?? null,
    };
    for (const field of FIELDS) {
      // Skip fields the client didn't send at all (undefined ≠ null).
      if (!(field in payloadFields)) continue;
      const value = payloadFields[field] ?? null;

      // First-time-per-field detection: was this field ever filled in ANY
      // of the user's leagues? If not, treat this save as a brand-new
      // global pick and propagate.
      const isNewField = existingRows.every((r) => (r as any)[field] == null);

      const shouldWriteThisLeague =
        leagueId == null /* omitted leagueId → propagate everywhere */ ||
        leagueId === lid /* targeted league */ ||
        isNewField /* propagate to other leagues until set per-league */;

      if (shouldWriteThisLeague) merged[field] = value;
    }
    return merged;
  }

  // Wrap the multi-league upsert in a transaction so a mid-loop failure
  // doesn't leave the user with champion=Brazil in league A and
  // champion=null in league B. Once the tournament starts the lock fires
  // and the user can't re-save to fix the inconsistency — so atomicity
  // here is critical, not nice-to-have.
  const results = await db.transaction(async (tx) => {
    const out: Array<typeof tournamentPredictions.$inferSelect> = [];
    for (const lid of userLeagueIds) {
      const merged = mergedRowFor(lid);
      const existing = existingByLeague.get(lid);
      const same =
        existing &&
        FIELDS.every((f) => (existing as Record<string, unknown>)[f] === merged[f]);
      if (same) continue; // nothing changed for this league — skip the write

      const [row] = await tx
        .insert(tournamentPredictions)
        .values({ userId, leagueId: lid, ...merged })
        .onConflictDoUpdate({
          target: [tournamentPredictions.userId, tournamentPredictions.leagueId],
          set: { ...merged, updatedAt: sql`(datetime('now'))` },
        })
        .returning();
      out.push(row);
    }
    return out;
  });

  // Backwards-compat shape.
  if (results.length === 1) return res.status(200).json(results[0]);
  return res.status(200).json({ data: results });
}

// Silence unused-var on the helper.
void and;
