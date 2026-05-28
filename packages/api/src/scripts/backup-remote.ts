/**
 * Dumps the remote Turso DB into a local SQLite file. Useful as a pre-migration
 * safety net when the Turso CLI isn't installed.
 *
 * Usage:
 *   pnpm --filter @mundialito/api exec tsx src/scripts/backup-remote.ts <output.db>
 *
 * The output file is a plain SQLite database — you can restore from it later by
 * pointing TURSO_DATABASE_URL at `file:<path>` and copying rows back, or by
 * importing it via the Turso CLI when available.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from '../constants.js';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const outputPath = resolve(process.argv[2] ?? `backup-${Date.now()}.db`);

  if (existsSync(outputPath)) {
    console.error(`[backup] refusing to overwrite ${outputPath} — delete it first`);
    process.exit(1);
  }

  console.log(`[backup] source: ${TURSO_DATABASE_URL.replace(/(libsql:\/\/[^.]*).*/, '$1...')}`);
  console.log(`[backup] target: ${outputPath}`);

  const source = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
  const target = createClient({ url: `file:${outputPath}` });

  // 1) Pull schema (tables + indexes) from sqlite_master, in dependency order.
  const schema = await source.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE type IN ('table','index')
         AND name NOT LIKE 'sqlite_%'
         AND sql IS NOT NULL
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
  );

  console.log(`[backup] copying ${schema.rows.length} schema objects`);
  await target.execute('PRAGMA foreign_keys = OFF');
  for (const row of schema.rows as any[]) {
    try {
      await target.execute(row.sql);
    } catch (err: any) {
      console.warn(`[backup] could not create ${row.type} ${row.name}: ${err.message}`);
    }
  }

  // 2) Copy rows table by table.
  const tables = (schema.rows as any[])
    .filter((r) => r.type === 'table')
    .map((r) => r.name as string);

  let totalRows = 0;
  for (const table of tables) {
    const result = await source.execute(`SELECT * FROM "${table}"`);
    if (result.rows.length === 0) {
      console.log(`[backup]   ${table}: 0 rows`);
      continue;
    }
    const cols = result.columns;
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.map((c) => `"${c}"`).join(', ');

    const CHUNK = 100;
    for (let i = 0; i < result.rows.length; i += CHUNK) {
      const slice = result.rows.slice(i, i + CHUNK);
      const valuesSql = slice.map(() => `(${placeholders})`).join(', ');
      const args: any[] = [];
      for (const row of slice) {
        for (const c of cols) args.push((row as any)[c]);
      }
      await target.execute({
        sql: `INSERT INTO "${table}" (${colList}) VALUES ${valuesSql}`,
        args,
      });
    }
    totalRows += result.rows.length;
    console.log(`[backup]   ${table}: ${result.rows.length} rows`);
  }

  await target.close();
  await source.close();

  console.log(`[backup] done — ${totalRows} rows across ${tables.length} tables`);
  console.log(`[backup] file: ${outputPath}`);
}

main().catch((err) => {
  console.error('[backup] failed', err);
  // best-effort cleanup
  const outputPath = resolve(process.argv[2] ?? '');
  if (outputPath && existsSync(outputPath)) {
    try { unlinkSync(outputPath); } catch {}
  }
  process.exit(1);
});
