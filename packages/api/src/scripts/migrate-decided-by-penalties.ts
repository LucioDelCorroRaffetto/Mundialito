/**
 * Migración idempotente: agrega la columna `decided_by_penalties` a `matches`.
 *
 * El deploy de la API (Render, autoDeploy on commit) NO corre migraciones, y
 * drizzle hace `SELECT` con columnas explícitas — así que esta columna DEBE
 * existir en Turso ANTES de deployar el código que la referencia, o el endpoint
 * de partidos falla con "no such column". Correr esto primero, apuntando a la
 * DB de producción (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN del entorno):
 *
 *   yarn workspace api tsx src/scripts/migrate-decided-by-penalties.ts
 *
 * Idempotente: si la columna ya existe, no hace nada (atrapa el error de
 * "duplicate column name").
 */
import { libsqlClient } from '../db/client.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const res = await libsqlClient.execute(`PRAGMA table_info(${table})`);
  return res.rows.some((r) => (r as Record<string, unknown>).name === column);
}

async function main() {
  if (await columnExists('matches', 'decided_by_penalties')) {
    console.log('La columna matches.decided_by_penalties ya existe. Nada que hacer.');
    return;
  }
  await libsqlClient.execute(
    'ALTER TABLE matches ADD COLUMN decided_by_penalties INTEGER NOT NULL DEFAULT 0',
  );
  console.log('OK: columna matches.decided_by_penalties agregada (default 0).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
