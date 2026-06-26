/**
 * Resuelve y puntúa las predicciones de Copa (campeón, finalista, goleador,
 * ceniciento, decepción, valla menos vencida) contra el resultado real, y
 * escribe `tournament_predictions.points`. Esos puntos se suman a la tabla de
 * cada liga en standings.ts.
 *
 * En producción esto corre solo cuando se cierra la final (finalize-match /
 * sync-scores). Este script es para correrlo a mano o ver un dry-run:
 *
 *   # dry-run: imprime el resultado resuelto sin escribir nada
 *   pnpm --filter @mundialito/api exec tsx src/scripts/resolve-tournament-predictions.ts
 *
 *   # aplica: escribe los puntos en la DB
 *   FIX=1 pnpm --filter @mundialito/api exec tsx src/scripts/resolve-tournament-predictions.ts
 *
 * Devuelve null (no-op) si la final todavía no terminó.
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { teams, players } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import {
  resolveTournamentOutcome,
  resolveTournamentPredictions,
} from '../services/tournament-resolver.js';

const FIX = process.env.FIX === '1';

async function teamLabel(teamId: number | null): Promise<string> {
  if (teamId == null) return '—';
  const t = await db.select({ code: teams.code, name: teams.name }).from(teams).where(eq(teams.id, teamId)).get();
  return t ? `${t.code} (${t.name})` : `#${teamId}`;
}

async function playerLabel(playerId: number): Promise<string> {
  const p = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).get();
  return p ? p.name : `#${playerId}`;
}

async function main() {
  const outcome = await resolveTournamentOutcome();
  if (!outcome) {
    console.log('La final todavía no terminó — no hay nada que resolver.');
    return;
  }

  console.log('Resultado resuelto del torneo:');
  console.log(`  Campeón:            ${await teamLabel(outcome.championTeamId)}`);
  console.log(`  Finalista:          ${await teamLabel(outcome.runnerUpTeamId)}`);
  console.log(`  Tercer puesto:      ${await teamLabel(outcome.thirdPlaceTeamId)}`);
  console.log(`  Ceniciento:         ${await teamLabel(outcome.revelationTeamId)}`);
  console.log(`  Decepción:          ${await teamLabel(outcome.surpriseEliminatedTeamId)}`);
  console.log(
    `  Valla menos vencida: ${(await Promise.all(outcome.bestDefenseTeamIds.map(teamLabel))).join(', ') || '—'}`,
  );
  console.log(
    `  Goleador:           ${(await Promise.all(outcome.topScorerPlayerIds.map(playerLabel))).join(', ') || '—'}`,
  );

  if (!FIX) {
    console.log('\n(dry-run) Para escribir los puntos: FIX=1 ...');
    return;
  }

  const { updated } = await resolveTournamentPredictions();
  console.log(`\nFilas de predicciones puntuadas/actualizadas: ${updated}`);
}

main().catch((err) => {
  console.error('[resolve-tournament-predictions] failed', err);
  process.exit(1);
});
