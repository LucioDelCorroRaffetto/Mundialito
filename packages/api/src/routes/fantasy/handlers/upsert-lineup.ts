import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { fantasyLineups, fantasySquadPlayers, fantasyTeams } from '../../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../../lib/errors.js';
import { isRoundOpen, ROUND_BY_SLUG } from '../../../lib/fantasy-rounds.js';

export const upsertLineupSchema = z.object({
  round: z.string().min(1),
  players: z.array(z.object({
    playerId: z.number().int().positive(),
    isStarter: z.boolean(),
    isCaptain: z.boolean().default(false),
    isViceCaptain: z.boolean().default(false),
  })).min(1).max(15),
});

export async function upsertLineupHandler(req: Request, res: Response) {
  const { round, players } = req.body as z.infer<typeof upsertLineupSchema>;
  const userId = req.user!.id;

  if (!ROUND_BY_SLUG.has(round)) {
    throw new AppError('VALIDATION', `Unknown fantasy round: ${round}`, 400);
  }
  if (!isRoundOpen(round)) {
    throw new AppError('LOCKED', 'El deadline de esta fecha ya pasó', 409);
  }

  // Validate constraints.
  const starters = players.filter((p) => p.isStarter);
  const captains = players.filter((p) => p.isCaptain);
  const vices = players.filter((p) => p.isViceCaptain);
  if (starters.length !== 11) {
    throw new AppError('VALIDATION', 'Debe haber exactamente 11 titulares', 400);
  }
  if (captains.length !== 1) {
    throw new AppError('VALIDATION', 'Debe haber exactamente 1 capitán', 400);
  }
  if (vices.length !== 1) {
    throw new AppError('VALIDATION', 'Debe haber exactamente 1 vicecapitán', 400);
  }
  const captainIsStarter = starters.find((p) => p.isCaptain);
  const viceIsStarter = starters.find((p) => p.isViceCaptain);
  if (!captainIsStarter) throw new AppError('VALIDATION', 'El capitán debe ser titular', 400);
  if (!viceIsStarter) throw new AppError('VALIDATION', 'El vicecapitán debe ser titular', 400);
  // Without this check, a client could send the same playerId with both
  // isCaptain and isViceCaptain true. The recompute then multiplies the
  // player's points by 2 (captain wins the ternary) but the lineup state
  // is inconsistent and the user thinks they have a vice too.
  if (captainIsStarter.playerId === viceIsStarter.playerId) {
    throw new AppError('VALIDATION', 'El capitán y el vicecapitán deben ser jugadores distintos', 400);
  }
  // Also reject duplicated playerIds across the whole payload (would otherwise
  // crash the insert with a UNIQUE violation halfway through).
  const seenIds = new Set<number>();
  for (const p of players) {
    if (seenIds.has(p.playerId)) {
      throw new AppError('VALIDATION', 'No podés repetir jugadores en el lineup', 400);
    }
    seenIds.add(p.playerId);
  }

  // Verify all players are in the user's squad.
  const team = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .get();
  if (!team) throw new AppError('NOT_FOUND', 'No tenés equipo de fantasy armado', 404);

  const squadPlayerIds = new Set(
    (await db
      .select({ playerId: fantasySquadPlayers.playerId })
      .from(fantasySquadPlayers)
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id)))
      .map((r) => r.playerId),
  );
  for (const p of players) {
    if (!squadPlayerIds.has(p.playerId)) {
      throw new AppError(
        'VALIDATION',
        `El jugador ${p.playerId} no está en tu plantilla de 15`,
        400,
      );
    }
  }

  // Full replace for this round: delete existing rows then insert new ones.
  const result = await db.transaction(async (tx) => {
    await tx
      .delete(fantasyLineups)
      .where(and(eq(fantasyLineups.userId, userId), eq(fantasyLineups.round, round)));

    const rows = await tx
      .insert(fantasyLineups)
      .values(
        players.map((p) => ({
          userId,
          round,
          playerId: p.playerId,
          isStarter: p.isStarter,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        })),
      )
      .returning();

    return rows;
  });

  return res.status(200).json({ data: result });
}
