import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, sql, and, asc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { tournamentPredictions, leagueMembers, matches } from '../../../db/schema/index.js';
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
  // Tournament-wide predictions (champion, top scorer, etc.) are locked once
  // the first match of the tournament kicks off. We read the earliest
  // predictionLockUtc from the matches table so the threshold is exactly 5
  // minutes before the opening whistle — consistent with per-match locking.
  const firstMatch = await db
    .select({ predictionLockUtc: matches.predictionLockUtc })
    .from(matches)
    .orderBy(asc(matches.kickoffUtc))
    .limit(1)
    .get();
  if (firstMatch && new Date(firstMatch.predictionLockUtc) <= new Date()) {
    throw new AppError(
      'TOURNAMENT_LOCKED',
      'Los pronósticos del torneo están cerrados — el Mundial ya comenzó',
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

  const results = [] as any[];
  for (const lid of userLeagueIds) {
    const merged = mergedRowFor(lid);
    const existing = existingByLeague.get(lid);
    const same =
      existing &&
      FIELDS.every((f) => (existing as any)[f] === merged[f]);
    if (same) continue; // nothing changed for this league — skip the write

    const [row] = await db
      .insert(tournamentPredictions)
      .values({ userId, leagueId: lid, ...merged })
      .onConflictDoUpdate({
        target: [tournamentPredictions.userId, tournamentPredictions.leagueId],
        set: { ...merged, updatedAt: sql`(datetime('now'))` },
      })
      .returning();
    results.push(row);
  }

  // Backwards-compat shape.
  if (results.length === 1) return res.status(200).json(results[0]);
  return res.status(200).json({ data: results });
}

// Silence unused-var on the helper.
void and;
