/**
 * Marca el ganador de una tanda de PENALES en un KO que el feed cerró empatado,
 * SIN tocar el marcador ni re-puntuar predicciones.
 *
 * A diferencia de fix-match-penalty-result.ts (modelo de bump: +1 al ganador y
 * re-scoring), esto solo escribe la señal que necesita el CUADRO:
 *   - penalty_winner = 'home' | 'away'  (lado que ganó la tanda),
 *   - decided_by_penalties = 1          (para el "(pen.)" en cuadro/lista),
 *   - score_locked = 1                  (que el feed no vuelva a bumpear/tocar).
 * El marcador guardado queda en el empate real, así que el scoring de las ligas
 * NO se toca (las predicciones ya puntuaron contra ese empate).
 *
 * Parámetros por env:
 *   MATCH_NUMBER (requerido)   nº de partido (91–104 son octavos→final)
 *   WINNER       (requerido)   'home' | 'away' — lado que ganó por penales
 *
 *   MATCH_NUMBER=99 WINNER=home node dist/scripts/set-penalty-winner.js
 *
 * Para saber qué lado es cada equipo, mirá el partido antes de correrlo: el
 * script imprime home/away con sus códigos.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { teams } from '../db/schema/teams.js';

const MATCH_NUMBER = Number(process.env.MATCH_NUMBER);
const WINNER = process.env.WINNER;

async function main() {
  if (!Number.isInteger(MATCH_NUMBER)) {
    throw new Error('Falta MATCH_NUMBER (entero).');
  }
  if (WINNER !== 'home' && WINNER !== 'away') {
    throw new Error(`WINNER inválido: ${WINNER}. Usá 'home' o 'away'.`);
  }

  const match = await db.select().from(matches).where(eq(matches.matchNumber, MATCH_NUMBER)).get();
  if (!match) throw new Error(`No existe el partido M${MATCH_NUMBER}`);

  const home = match.homeTeamId
    ? await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).get()
    : undefined;
  const away = match.awayTeamId
    ? await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).get()
    : undefined;

  console.log(
    `Antes: M${MATCH_NUMBER} [${match.status}] ` +
      `${home?.code ?? 'home'} ${match.homeScore}-${match.awayScore} ${away?.code ?? 'away'} ` +
      `pen=${match.decidedByPenalties} penWinner=${match.penaltyWinner ?? '∅'} locked=${match.scoreLocked}`,
  );

  const [updated] = await db
    .update(matches)
    .set({
      penaltyWinner: WINNER,
      decidedByPenalties: 1,
      scoreLocked: 1,
    })
    .where(eq(matches.id, match.id))
    .returning();

  console.log(
    `Después: M${MATCH_NUMBER} [${updated.status}] ` +
      `${updated.homeScore}-${updated.awayScore} ` +
      `pen=${updated.decidedByPenalties} penWinner=${updated.penaltyWinner ?? '∅'} locked=${updated.scoreLocked}`,
  );
  console.log('Marcador y predicciones intactos — solo se marcó el ganador de la tanda para el cuadro.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
