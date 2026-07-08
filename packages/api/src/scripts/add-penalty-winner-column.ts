/**
 * Schema migration — adds `matches.penalty_winner` (TEXT, nullable).
 *
 * Guarda el ganador de la tanda de penales como LADO del partido ('home' |
 * 'away'). Es la señal explícita que usa el CUADRO para propagar al ganador
 * cuando el KO quedó EMPATE en el marcador (sin el +1 del modelo de bump). A
 * diferencia del bump, no toca home_score/away_score, así que el scoring de
 * predicciones queda intacto.
 *
 * Caso que lo motivó (jul-2026): SUI–COL cerró 0-0 finished; Suiza ganó por
 * penales pero el feed no reportó la tanda, así que el cuadro no podía avanzar
 * a nadie (un 0-0 finished es empate). Idempotente.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

async function alterIfMissing(sqlText: string, description: string) {
  try {
    await client.execute(sqlText);
    console.log(`  ✓ ${description}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate column')) {
      console.log(`  · ${description} — column already exists`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log(`[add-penalty-winner] target: ${url}\n`);
  await alterIfMissing(
    `ALTER TABLE matches ADD COLUMN penalty_winner TEXT`,
    'matches.penalty_winner',
  );
  console.log('\n[add-penalty-winner] done.');
  await client.close();
}

main().catch((err) => {
  console.error('[add-penalty-winner] failed:', err);
  process.exit(1);
});
