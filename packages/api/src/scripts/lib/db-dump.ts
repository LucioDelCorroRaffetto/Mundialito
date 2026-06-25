/**
 * db-dump.ts — núcleo del toolkit de migración lossless.
 *
 * Vuelca una base libSQL/SQLite COMPLETA (esquema + datos + índices + triggers)
 * leyendo directamente de `sqlite_master`, sin depender del schema de Drizzle.
 * Esto garantiza que no se escape ninguna tabla, columna, índice ni detalle,
 * aunque la base tenga objetos que el código no conoce.
 *
 * Formato del dump: JSON autocontenido. Los valores se codifican preservando el
 * tipo exacto (null, number, string, bigint, blob) para reinsertarlos sin
 * pérdida.
 */
import type { Client, InValue } from '@libsql/client';

// ─── Codec de valores (preserva tipos a través de JSON) ─────────────────────────

type EncodedValue =
  | null
  | number
  | string
  | boolean
  | { $bigint: string }
  | { $blob: string };

function encodeValue(v: unknown): EncodedValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  if (v instanceof Uint8Array) return { $blob: Buffer.from(v).toString('base64') };
  if (v instanceof ArrayBuffer) return { $blob: Buffer.from(new Uint8Array(v)).toString('base64') };
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  // Fallback defensivo: serializamos como string para no perder el dato.
  return String(v);
}

function decodeValue(v: EncodedValue): InValue {
  if (v === null) return null;
  if (typeof v === 'object') {
    if ('$bigint' in v) return BigInt(v.$bigint);
    if ('$blob' in v) return new Uint8Array(Buffer.from(v.$blob, 'base64'));
  }
  // number | string | boolean → libSQL los acepta directo.
  return v as InValue;
}

// ─── Tipos del dump ─────────────────────────────────────────────────────────────

export interface TableDump {
  name: string;
  ddl: string; // CREATE TABLE original (lossless, con constraints).
  columns: string[]; // Orden real de columnas (de SELECT *).
  references: string[]; // Tablas referenciadas por FK (para ordenar el import).
  rows: EncodedValue[][]; // Filas alineadas a `columns`.
}

export interface SqlObject {
  name: string;
  tbl: string;
  sql: string;
}

export interface Dump {
  meta: {
    exportedAt: string;
    source: string; // URL sin token.
    tableCount: number;
    rowCounts: Record<string, number>;
  };
  tables: TableDump[];
  indexes: SqlObject[];
  triggers: SqlObject[];
}

// Tablas internas de SQLite/libSQL/Litestream que NO se migran (se regeneran solas).
const SKIP_TABLE_SQL = `
  name NOT LIKE 'sqlite_%'
  AND name NOT LIKE 'libsql_%'
  AND name NOT LIKE '_litestream%'
`;

// ─── Export ─────────────────────────────────────────────────────────────────────

export async function exportDatabase(client: Client, sourceLabel: string): Promise<Dump> {
  const tablesRes = await client.execute(
    `SELECT name, sql FROM sqlite_master
     WHERE type='table' AND sql IS NOT NULL AND ${SKIP_TABLE_SQL}
     ORDER BY name`,
  );

  const tables: TableDump[] = [];
  const rowCounts: Record<string, number> = {};

  const tableNames = new Set(tablesRes.rows.map((t) => t.name as string));

  for (const t of tablesRes.rows) {
    const name = t.name as string;
    const ddl = t.sql as string;

    // FKs salientes → para ordenar la inserción en el import (padres primero).
    const fkRes = await client.execute(`PRAGMA foreign_key_list("${name}")`);
    const references = [
      ...new Set(
        fkRes.rows
          .map((r) => r.table as string)
          .filter((ref) => ref !== name && tableNames.has(ref)),
      ),
    ];

    const res = await client.execute(`SELECT * FROM "${name}"`);
    const columns = res.columns;
    const rows = res.rows.map((r) => columns.map((c) => encodeValue((r as Record<string, unknown>)[c])));
    tables.push({ name, ddl, columns, references, rows });
    rowCounts[name] = rows.length;
    console.log(`  · ${name}: ${rows.length} filas`);
  }

  const objRes = await client.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE type IN ('index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  );
  const indexes: SqlObject[] = [];
  const triggers: SqlObject[] = [];
  for (const o of objRes.rows) {
    const entry: SqlObject = { name: o.name as string, tbl: o.tbl_name as string, sql: o.sql as string };
    if (o.type === 'index') indexes.push(entry);
    else triggers.push(entry);
  }

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      source: sourceLabel,
      tableCount: tables.length,
      rowCounts,
    },
    tables,
    indexes,
    triggers,
  };
}

// ─── Import ─────────────────────────────────────────────────────────────────────

const INSERT_CHUNK = 100;

export interface ImportOptions {
  /** Si true, dropea cada tabla del dump antes de recrearla (target ya existente). */
  wipe?: boolean;
}

/**
 * Ordena las tablas para que cada tabla se inserte DESPUÉS de las que referencia
 * por FK (Kahn / DFS). El driver local de libSQL enforcea foreign_keys, así que
 * los padres tienen que existir antes que los hijos. Las dependencias circulares
 * (no las hay en este schema) se rompen respetando el orden de aparición.
 */
function topoSortTables(tables: TableDump[]): TableDump[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const ordered: TableDump[] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();

  function visit(name: string) {
    if (visited.has(name) || onStack.has(name)) return;
    const t = byName.get(name);
    if (!t) return;
    onStack.add(name);
    for (const ref of t.references) visit(ref);
    onStack.delete(name);
    visited.add(name);
    ordered.push(t);
  }

  for (const t of tables) visit(t.name);
  return ordered;
}

export async function importDatabase(client: Client, dump: Dump, opts: ImportOptions = {}): Promise<void> {
  const sorted = topoSortTables(dump.tables);

  if (opts.wipe) {
    // Dropear en orden inverso al de dependencias (hijos antes que padres).
    for (const t of [...sorted].reverse()) {
      await client.execute(`DROP TABLE IF EXISTS "${t.name}"`);
    }
    console.log(`  · ${sorted.length} tablas dropeadas (--wipe)`);
  }

  // 1) Crear tablas desde el DDL original (lossless).
  for (const t of sorted) {
    await client.execute(t.ddl);
  }
  console.log(`  · ${sorted.length} tablas creadas`);

  // 2) Insertar filas en batches, padres antes que hijos (orden topológico).
  for (const t of sorted) {
    if (t.rows.length === 0) {
      console.log(`  · ${t.name}: 0 filas (vacía)`);
      continue;
    }
    const colList = t.columns.map((c) => `"${c}"`).join(',');
    const placeholders = `(${t.columns.map(() => '?').join(',')})`;
    const sql = `INSERT INTO "${t.name}" (${colList}) VALUES ${placeholders}`;

    const stmts = t.rows.map((row) => ({ sql, args: row.map(decodeValue) }));
    for (let i = 0; i < stmts.length; i += INSERT_CHUNK) {
      await client.batch(stmts.slice(i, i + INSERT_CHUNK), 'write');
    }
    console.log(`  · ${t.name}: ${t.rows.length} filas insertadas`);
  }

  // 3) Recrear índices y triggers explícitos (los auto-índices de UNIQUE/PK ya
  //    los crea el DDL de la tabla).
  for (const idx of dump.indexes) {
    await client.execute(idx.sql);
  }
  for (const tr of dump.triggers) {
    await client.execute(tr.sql);
  }
  console.log(`  · ${dump.indexes.length} índices + ${dump.triggers.length} triggers recreados`);
}

// ─── Verify ─────────────────────────────────────────────────────────────────────

export interface VerifyResult {
  ok: boolean;
  problems: string[];
}

/** Serializa una fila de forma determinística para comparar multisets. */
function rowKey(row: EncodedValue[]): string {
  return JSON.stringify(row);
}

/**
 * Compara el dump original contra el estado real del target (re-exportado).
 * Verifica: mismo set de tablas, mismas columnas (orden incluido) y mismo
 * multiset de filas por tabla. Es la garantía de "no se perdió ningún detalle".
 */
export function verifyDumps(expected: Dump, actual: Dump): VerifyResult {
  const problems: string[] = [];

  const expectedTables = new Map(expected.tables.map((t) => [t.name, t]));
  const actualTables = new Map(actual.tables.map((t) => [t.name, t]));

  for (const name of expectedTables.keys()) {
    if (!actualTables.has(name)) problems.push(`Falta la tabla "${name}" en el target`);
  }
  for (const name of actualTables.keys()) {
    if (!expectedTables.has(name)) problems.push(`Tabla extra "${name}" en el target (no estaba en el dump)`);
  }

  for (const [name, exp] of expectedTables) {
    const act = actualTables.get(name);
    if (!act) continue;

    if (exp.columns.join(',') !== act.columns.join(',')) {
      problems.push(
        `"${name}": columnas distintas\n    esperado: ${exp.columns.join(',')}\n    actual:   ${act.columns.join(',')}`,
      );
    }

    if (exp.rows.length !== act.rows.length) {
      problems.push(`"${name}": cantidad de filas distinta — esperado ${exp.rows.length}, actual ${act.rows.length}`);
      continue;
    }

    // Comparación de multiset (independiente del orden de filas).
    const expCounts = new Map<string, number>();
    for (const r of exp.rows) expCounts.set(rowKey(r), (expCounts.get(rowKey(r)) ?? 0) + 1);
    let mismatches = 0;
    for (const r of act.rows) {
      const k = rowKey(r);
      const c = expCounts.get(k);
      if (!c) {
        mismatches++;
      } else {
        expCounts.set(k, c - 1);
        if (c - 1 === 0) expCounts.delete(k);
      }
    }
    if (mismatches > 0 || expCounts.size > 0) {
      problems.push(`"${name}": ${mismatches + expCounts.size} fila(s) no coinciden entre dump y target`);
    }
  }

  return { ok: problems.length === 0, problems };
}
