import { Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { fantasyTeams, fantasySquadPlayers, fantasyLineups, players } from '../../../db/schema/index.js';
import { computeFantasyPointsByPlayer } from '../../../services/fantasy-scoring-service.js';
import { getCurrentFantasyRound } from '../../../lib/fantasy-rounds.js';

/**
 * Returns the user's fantasy team — the 15-player squad plus their
 * "titulares" flags for the round currently visible to the UI.
 *
 * Previously this handler read `isStarter / isCaptain / isViceCaptain`
 * straight from `fantasy_squad_players`. That table only carried the
 * INITIAL starter selection made when the squad was first built, and was
 * never kept in sync with the per-round lineups the user actually edits
 * in the Titulares tab. The result: the "Mi equipo" drawer (this
 * endpoint) showed one set of starters, the Titulares tab showed a
 * different per-round lineup, and the Plantel pitch view showed all 15
 * — three different "teams" for the same user.
 *
 * Fix: the per-round `fantasy_lineups` table is the source of truth. We
 * left-join it for the currently-active round and overlay its flags onto
 * the squad. If the user has not saved a lineup yet for that round, the
 * starter flags stay false (matches the "Faltan 2 titulares" empty state
 * the Titulares tab shows).
 */
export async function getMyTeamHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  const team = await db
    .select()
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .get();

  if (!team) {
    return res.json({ team: null, squad: [], round: null });
  }

  // Determine which round's lineup to overlay. Falls back to the first
  // round once the tournament is over so the drawer keeps showing
  // something meaningful instead of all-bench.
  const activeRound = getCurrentFantasyRound();
  let roundSlug = activeRound?.slug ?? 'final';

  let lineupRows = await db
    .select({
      playerId: fantasyLineups.playerId,
      isStarter: fantasyLineups.isStarter,
      isCaptain: fantasyLineups.isCaptain,
      isViceCaptain: fantasyLineups.isViceCaptain,
    })
    .from(fantasyLineups)
    .where(and(eq(fantasyLineups.userId, userId), eq(fantasyLineups.round, roundSlug)));

  // Fallback: si el usuario todavía no armó lineup para el round activo
  // (caso típico: ya cerró el round anterior y todavía no editó el siguiente),
  // mostramos su último lineup guardado en lugar de un drawer vacío con
  // todos en el banco. Sin esto la UX engaña: parece que se "perdieron"
  // titulares y capitán que en realidad siguen guardados en la ronda previa.
  if (lineupRows.length === 0) {
    const lastRow = await db
      .select({ round: fantasyLineups.round })
      .from(fantasyLineups)
      .where(eq(fantasyLineups.userId, userId))
      .orderBy(desc(fantasyLineups.createdAt))
      .limit(1)
      .get();
    if (lastRow) {
      roundSlug = lastRow.round;
      lineupRows = await db
        .select({
          playerId: fantasyLineups.playerId,
          isStarter: fantasyLineups.isStarter,
          isCaptain: fantasyLineups.isCaptain,
          isViceCaptain: fantasyLineups.isViceCaptain,
        })
        .from(fantasyLineups)
        .where(and(eq(fantasyLineups.userId, userId), eq(fantasyLineups.round, roundSlug)));
    }
  }
  const lineupByPlayer = new Map(lineupRows.map((r) => [r.playerId, r]));

  const squadRows = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      name: players.name,
      position: players.position,
      shirtNumber: players.shirtNumber,
      photoUrl: players.photoUrl,
    })
    .from(fantasySquadPlayers)
    .innerJoin(players, eq(fantasySquadPlayers.playerId, players.id))
    .where(eq(fantasySquadPlayers.fantasyTeamId, team.id));

  const pointsByPlayer = await computeFantasyPointsByPlayer();

  const squad = squadRows.map((p) => {
    const lineup = lineupByPlayer.get(p.id);
    const isStarter = lineup?.isStarter ?? false;
    const isCaptain = lineup?.isCaptain ?? false;
    const isViceCaptain = lineup?.isViceCaptain ?? false;
    const basePts = pointsByPlayer.get(p.id) ?? 0;
    // Per-player fantasyPoints — captain shown doubled, bench scores 0,
    // mirroring how totalPoints is computed.
    let fantasyPoints = 0;
    if (isStarter) {
      fantasyPoints = isCaptain ? basePts * 2 : basePts;
    }
    return { ...p, isStarter, isCaptain, isViceCaptain, fantasyPoints };
  });

  return res.json({ team, squad, round: roundSlug });
}
