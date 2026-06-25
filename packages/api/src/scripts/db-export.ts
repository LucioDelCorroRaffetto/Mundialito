/**
 * db-export.ts — vuelca la base ORIGEN completa a un archivo JSON local.
 *
 * Credenciales (en .env o en el entorno):
 *   SRC_TURSO_DATABASE_URL / SRC_TURSO_AUTH_TOKEN   (preferido)
 *   o, como fallback, TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 *
 * Uso:
 *   cd packages/api && npx tsx src/scripts/db-export.ts [salida.json]
 *
 * Si la cuenta Turso está bloqueada por quota, este script va a fallar con
 * "BLOCKED ... reads are blocked": hay que desbloquear primero (grace de soporte
 * o reset mensual) y volver a correrlo.
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exportDatabase } from './lib/db-dump.js';

dotenv.config();

const url = process.env.SRC_TURSO_DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const authToken = process.env.SRC_TURSO_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('❌  Falta SRC_TURSO_DATABASE_URL (o TURSO_DATABASE_URL).');
  process.exit(1);
}

const outPath = resolve(process.argv[2] ?? 'db-dump/dump-latest.json');

async function main() {
  console.log(`📤  Exportando desde: ${url}`);
  const client = createClient({ url: url!, authToken });

  const dump = await exportDatabase(client, url!);

  mkdirSync(dirname(outPath), { recursive: true });
  const json = JSON.stringify(dump);
  writeFileSync(outPath, json);

  // Copia con timestamp para no pisar dumps previos.
  const stamp = dump.meta.exportedAt.replace(/[:.]/g, '-');
  const stampedPath = resolve('db-dump', `dump-${stamp}.json`);
  writeFileSync(stampedPath, json);

  const totalRows = Object.values(dump.meta.rowCounts).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(`✅  Export completo: ${dump.meta.tableCount} tablas, ${totalRows} filas en total.`);
  console.log(`    ${dump.indexes.length} índices, ${dump.triggers.length} triggers.`);
  console.log(`    → ${outPath}`);
  console.log(`    → ${stampedPath} (backup con timestamp)`);
}

main().catch((err) => {
  console.error('');
  console.error('❌  Export falló:', err?.message ?? err);
  if (String(err?.message ?? err).includes('BLOCKED')) {
    console.error('');
    console.error('    La cuenta Turso está bloqueada por quota. Desbloqueá primero');
    console.error('    (grace de soporte o reset mensual) y reintentá.');
  }
  process.exit(1);
});
