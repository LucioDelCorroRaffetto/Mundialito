import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, players, fantasyLineups } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/errors.js';
import { FANTASY_ROUNDS, getCurrentFantasyRound, isRoundOpen } from '../../../lib/fantasy-rounds.js';

// Standard WC fantasy squad composition.
const POSITION_QUOTAS: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const updateSquadSchema = z.object({
  // Squad must be exactly 15 players (2 GK + 5 DEF + 5 MID + 3 FWD). The
  // previous .min(11).max(15) let clients submit "11 forwards, no
  // goalkeeper" — server-side enforcement matters because the lineup
  // validator only checks 11 starters from the existing squad.
  playerIds: z.array(z.number().int().positive()).length(15),
  // starterIds and captainId are optional for backward-compat with old clients.
  // If omitted the handler picks sensible defaults.
  starterIds: z.array(z.number().int().positive()).length(11).optional(),
  captainId: z.number().int().positive().optional(),
});

export async function updateSquadHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { playerIds } = req.body as z.infer<typeof updateSquadSchema>;
  let { starterIds, captainId } = req.body as z.infer<typeof updateSquadSchema>;

  // Lock del plantel: el plantel se puede re-elegir hasta el deadline de
  // cada fecha. Mientras haya al menos una fecha abierta (es decir,
  // getCurrentFantasyRound devuelve un round) el usuario puede modificar
  // sus 15. Solo queda bloqueado cuando el torneo terminó (todas las
  // fechas cerraron). Las fechas ya jugadas conservan su alineación
  // congelada — ver el delete de lineups más abajo, restringido a rounds
  // abiertos.
  if (!getCurrentFantasyRound()) {
    throw new AppError(
      'SQUAD_LOCKED',
      'El plantel ya no se puede modificar — el torneo terminó',
      409,
    );
  }

  // Default starterIds: first 11 of playerIds if not supplied.
  if (!starterIds || starterIds.length === 0) {
    starterIds = playerIds.slice(0, 11);
  }
  // Default captainId: first starter if not supplied.
  if (!captainId) {
    captainId = starterIds[0];
  }

  // No duplicate player IDs.
  if (new Set(playerIds).size !== playerIds.length) {
    throw new AppError('VALIDATION_ERROR', 'playerIds contains duplicates', 400);
  }
  if (new Set(starterIds).size !== starterIds.length) {
    throw new AppError('VALIDATION_ERROR', 'starterIds contains duplicates', 400);
  }

  // Starters must be a subset of playerIds.
  const playerIdSet = new Set(playerIds);
  if (!starterIds.every((id) => playerIdSet.has(id))) {
    throw new AppError('VALIDATION_ERROR', 'starterIds must be a subset of playerIds', 400);
  }

  // Captain must be one of the starters.
  if (!starterIds.includes(captainId)) {
    throw new AppError('VALIDATION_ERROR', 'captainId must be one of the starters', 400);
  }

  // Validate players exist AND that the squad has the right shape
  // (2 GK / 5 DEF / 5 MID / 3 FWD). Without this check a client could send
  // "15 forwards", which would then break every fantasy position quota.
  const playerRows = await db
    .select({ id: players.id, position: players.position })
    .from(players)
    .where(inArray(players.id, playerIds));

  if (playerRows.length !== playerIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more player IDs are invalid', 400);
  }

  const positionCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of playerRows) positionCount[p.position] = (positionCount[p.position] ?? 0) + 1;
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    if (positionCount[pos] !== POSITION_QUOTAS[pos]) {
      throw new AppError(
        'VALIDATION_ERROR',
        `El plantel debe tener exactamente ${POSITION_QUOTAS[pos]} ${pos}, recibió ${positionCount[pos]}`,
        400,
      );
    }
  }

  // Upsert global fantasy team — one per user.
  await db
    .insert(fantasyTeams)
    .values({ userId, name: 'Mi equipo' })
    .onConflictDoNothing();

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .get();

  if (!team) {
    throw new AppError('INTERNAL_ERROR', 'Could not find or create fantasy team', 500);
  }

  const starterIdSet = new Set(starterIds);

  // Replace squad in a transaction.
  const updatedSquad = await db.transaction(async (tx) => {
    await tx
      .delete(fantasySquadPlayers)
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

    // Drop any per-round lineup rows referencing players no longer in the
    // squad. Without this, the next /fantasy/lineup/:round save fails
    // validation because the lineup still points at a dropped player.
    //
    // IMPORTANT: restringido a fechas ABIERTAS. Las fechas ya cerradas
    // tienen su alineación congelada (y sus puntos en fantasyRoundScores);
    // si borráramos esas filas, perderíamos el breakdown histórico de un
    // jugador que ya jugó. Ahora que el plantel es editable fecha a fecha,
    // este filtro es obligatorio.
    const openRoundSlugs = FANTASY_ROUNDS
      .filter((r) => isRoundOpen(r.slug))
      .map((r) => r.slug);
    if (openRoundSlugs.length > 0) {
      await tx
        .delete(fantasyLineups)
        .where(
          and(
            eq(fantasyLineups.userId, userId),
            notInArray(fantasyLineups.playerId, playerIds),
            inArray(fantasyLineups.round, openRoundSlugs),
          ),
        );
    }

    await tx.insert(fantasySquadPlayers).values(
      playerIds.map((playerId) => ({
        fantasyTeamId: team.id,
        playerId,
        isStarter: starterIdSet.has(playerId),
        isCaptain: playerId === captainId,
        isViceCaptain: false,
      })),
    );

    return tx
      .select({
        id: players.id,
        teamId: players.teamId,
        name: players.name,
        position: players.position,
        shirtNumber: players.shirtNumber,
        photoUrl: players.photoUrl,
        isStarter: fantasySquadPlayers.isStarter,
        isCaptain: fantasySquadPlayers.isCaptain,
        isViceCaptain: fantasySquadPlayers.isViceCaptain,
      })
      .from(fantasySquadPlayers)
      .innerJoin(players, eq(fantasySquadPlayers.playerId, players.id))
      .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));
  });

  return res.json({ team, squad: updatedSquad });
}
