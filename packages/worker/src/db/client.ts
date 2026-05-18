import 'dotenv/config';
import { createClient, type Client, type InStatement } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const rawClient = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const PRAGMA_FK = 'PRAGMA foreign_keys = ON';

/**
 * Turso (libSQL HTTP) es stateless: cada request abre una conexión nueva
 * y los PRAGMAs no persisten entre requests. Para garantizar el enforcement
 * de foreign keys, envolvemos el cliente con un Proxy que antepone
 * `PRAGMA foreign_keys = ON` a cada `execute`/`batch`.
 */
export const libsqlClient: Client = new Proxy(rawClient, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);

    if (prop === 'execute') {
      return async function (stmt: InStatement) {
        const results = await target.batch([PRAGMA_FK, stmt], 'deferred');
        return results[results.length - 1];
      };
    }

    if (prop === 'batch') {
      return async function (stmts: InStatement[], mode?: unknown) {
        const newStmts = [PRAGMA_FK, ...stmts];
        const results = await (target.batch as (s: InStatement[], m?: unknown) => Promise<unknown[]>)(newStmts, mode);
        return results.slice(1);
      };
    }

    if (prop === 'transaction') {
      return async function (mode?: unknown) {
        const tx = await (orig as (m?: unknown) => Promise<{ execute: (s: InStatement) => Promise<unknown> }>).call(target, mode);
        await tx.execute(PRAGMA_FK);
        return tx;
      };
    }

    return typeof orig === 'function' ? orig.bind(target) : orig;
  },
});

export const db = drizzle(libsqlClient);
