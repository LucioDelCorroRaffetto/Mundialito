/**
 * db-import.ts — carga un dump JSON en la base DESTINO (la cuenta/DB nueva).
 *
 * Credenciales (en .env o en el entorno):
 *   DST_TURSO_DATABASE_URL / DST_TURSO_AUTH_TOKEN   (preferido)
 *   o, como fallback, TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 *
 * Uso:
 *   cd packages/api && npx tsx src/scripts/db-import.ts [entrada.json] [--wipe]
 *
 *   --wipe : dropea cada tabla del dump en el destino antes de recrearla.
 *            Útil para reintentar una importación sin arrastrar estado previo.
 *
 * Seguridad: se niega a importar si el destino apunta a la MISMA URL que el
 * origen, para no pisar la base original por accidente.
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDatabase, type Dump } from './lib/db-dump.js';

dotenv.config();

const args = process.argv.slice(2);
const wipe = args.includes('--wipe');
const inPath = resolve(args.find((a) => !a.startsWith('--')) ?? 'db-dump/dump-latest.json');

const url = process.env.DST_TURSO_DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const authToken = process.env.DST_TURSO_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
const srcUrl = process.env.SRC_TURSO_DATABASE_URL;

if (!url) {
  console.error('❌  Falta DST_TURSO_DATABASE_URL (o TURSO_DATABASE_URL).');
  process.exit(1);
}
if (srcUrl && srcUrl === url) {
  console.error('❌  DST_TURSO_DATABASE_URL es igual a SRC_TURSO_DATABASE_URL. Abortando para no pisar el origen.');
  process.exit(1);
}

async function main() {
  console.log(`📥  Importando dump:  ${inPath}`);
  console.log(`    → destino:        ${url}`);
  if (wipe) console.log('    → modo --wipe (dropea tablas existentes)');

  const dump = JSON.parse(readFileSync(inPath, 'utf8')) as Dump;
  console.log(`    dump: ${dump.meta.tableCount} tablas, exportado ${dump.meta.exportedAt}`);
  console.log('');

  const client = createClient({ url: url!, authToken });
  await importDatabase(client, dump, { wipe });

  const totalRows = Object.values(dump.meta.rowCounts).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(`✅  Import completo: ${dump.meta.tableCount} tablas, ${totalRows} filas.`);
  console.log('    Corré db-verify.ts para confirmar que no falte nada.');
}

main().catch((err) => {
  console.error('');
  console.error('❌  Import falló:', err?.message ?? err);
  process.exit(1);
});
