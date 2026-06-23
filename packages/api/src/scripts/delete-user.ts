/**
 * delete-user.ts
 *
 * Borra COMPLETAMENTE un usuario y todos sus datos. Sirve para limpiar
 * cuentas que quedaron en estado inconsistente (huérfanas) por el bug del
 * borrado de cuenta — donde el `ON DELETE CASCADE` no se disparaba porque
 * `PRAGMA foreign_keys = ON` es no-op dentro de una transacción ya abierta.
 *
 * A diferencia del handler, este script corre los DELETE en autocommit
 * (sin transacción interactiva), así que el PRAGMA SÍ surte efecto; igual
 * borramos cada tabla hija explícitamente para no depender de eso.
 *
 * Ligas que el usuario administra:
 *   - personal (auto-creada) → se borra la liga.
 *   - compartida con otros miembros → se transfiere admin al miembro más
 *     antiguo (joinedAt más viejo).
 *   - compartida pero es el único miembro → se borra la liga.
 *
 * Run: cd packages/api && npx tsx src/scripts/delete-user.ts <userId>
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const userId = Number(process.argv[2]);
if (!Number.isInteger(userId) || userId <= 0) {
  console.error('Uso: npx tsx src/scripts/delete-user.ts <userId>');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  await client.execute('PRAGMA foreign_keys = ON');

  const me = await client.execute({
    sql: 'SELECT id, username FROM users WHERE id = ?',
    args: [userId],
  });
  if (me.rows.length === 0) {
    console.log(`\n⚠️  No existe el user id=${userId} en la tabla users.`);
    console.log('   (Puede que la fila ya se haya borrado y solo queden datos huérfanos.)');
    console.log('   El script igual va a limpiar cualquier dato residual con ese user_id.\n');
  } else {
    console.log(`\nBorrando user id=${userId} (username: ${me.rows[0][1]})\n`);
  }

  // 1) Ligas administradas por el usuario.
  const admined = await client.execute({
    sql: 'SELECT id, is_personal FROM leagues WHERE admin_id = ?',
    args: [userId],
  });
  for (const row of admined.rows) {
    const leagueId = Number(row[0]);
    const isPersonal = Boolean(row[1]);
    if (isPersonal) {
      await client.execute({ sql: 'DELETE FROM leagues WHERE id = ?', args: [leagueId] });
      console.log(`  liga ${leagueId} (personal) borrada`);
      continue;
    }
    const successor = await client.execute({
      sql: `SELECT user_id FROM league_members
            WHERE league_id = ? AND user_id <> ?
            ORDER BY joined_at ASC LIMIT 1`,
      args: [leagueId, userId],
    });
    if (successor.rows.length > 0) {
      const newAdmin = Number(successor.rows[0][0]);
      await client.execute({
        sql: 'UPDATE leagues SET admin_id = ? WHERE id = ?',
        args: [newAdmin, leagueId],
      });
      console.log(`  liga ${leagueId}: admin transferido a user ${newAdmin}`);
    } else {
      await client.execute({ sql: 'DELETE FROM leagues WHERE id = ?', args: [leagueId] });
      console.log(`  liga ${leagueId} (sin otros miembros) borrada`);
    }
  }

  // 2) Filas hijas, nietos primero.
  const stmts: Array<{ sql: string; args: (string | number)[] }> = [
    { sql: 'DELETE FROM prediction_scorers WHERE prediction_id IN (SELECT id FROM predictions WHERE user_id = ?)', args: [userId] },
    { sql: 'DELETE FROM predictions WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM fantasy_squad_players WHERE fantasy_team_id IN (SELECT id FROM fantasy_teams WHERE user_id = ?)', args: [userId] },
    { sql: 'DELETE FROM fantasy_teams WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM fantasy_lineups WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM fantasy_round_scores WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM tournament_predictions WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM user_achievements WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM user_login_days WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM league_position_history WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM league_members WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM push_subscriptions WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
  ];

  for (const s of stmts) {
    try {
      const { rowsAffected } = await client.execute(s);
      const table = s.sql.split(' ')[2];
      console.log(`  ${String(table).padEnd(24)} ${rowsAffected} filas`);
    } catch (e) {
      console.error(`  ERROR en: ${s.sql}\n    ${(e as Error).message}`);
      throw e;
    }
  }

  console.log('\nDone ✅\n');
  await client.close();
}

run().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
