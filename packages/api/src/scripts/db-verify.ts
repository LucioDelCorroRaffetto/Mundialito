/**
 * db-verify.ts — confirma que el DESTINO contiene EXACTAMENTE lo del dump.
 *
 * Re-exporta el destino y lo compara contra el dump original: mismo set de
 * tablas, mismas columnas y mismo multiset de filas por tabla. Sale con código
 * !=0 si encuentra cualquier diferencia.
 *
 * Credenciales del destino (en .env o entorno):
 *   DST_TURSO_DATABASE_URL / DST_TURSO_AUTH_TOKEN
 *   o, como fallback, TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 *
 * Uso:
 *   cd packages/api && npx tsx src/scripts/db-verify.ts [dump.json]
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportDatabase, verifyDumps, type Dump } from './lib/db-dump.js';

dotenv.config();

const inPath = resolve(process.argv[2] ?? 'db-dump/dump-latest.json');

const url = process.env.DST_TURSO_DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const authToken = process.env.DST_TURSO_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('❌  Falta DST_TURSO_DATABASE_URL (o TURSO_DATABASE_URL).');
  process.exit(1);
}

async function main() {
  console.log(`🔎  Verificando destino: ${url}`);
  console.log(`    contra dump:        ${inPath}`);
  console.log('');

  const expected = JSON.parse(readFileSync(inPath, 'utf8')) as Dump;
  const client = createClient({ url: url!, authToken });
  const actual = await exportDatabase(client, url!);

  const result = verifyDumps(expected, actual);

  console.log('');
  if (result.ok) {
    const totalRows = Object.values(expected.meta.rowCounts).reduce((a, b) => a + b, 0);
    console.log(`✅  VERIFICADO: el destino coincide exactamente con el dump.`);
    console.log(`    ${expected.meta.tableCount} tablas, ${totalRows} filas, sin diferencias.`);
  } else {
    console.error(`❌  DIFERENCIAS ENCONTRADAS (${result.problems.length}):`);
    for (const p of result.problems) console.error(`    - ${p}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('');
  console.error('❌  Verify falló:', err?.message ?? err);
  process.exit(1);
});
