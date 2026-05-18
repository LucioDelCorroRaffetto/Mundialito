import { createClient, type Client, type InStatement } from '@libsql/client';
import { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from '../constants.js';

const rawClient = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const PRAGMA_FK = 'PRAGMA foreign_keys = ON';

/**
 * Turso (libSQL HTTP) es stateless: cada request abre una conexión nueva
 * y los PRAGMAs no persisten entre requests. Para garantizar el enforcement
 * de foreign keys en producción, envolvemos el cliente con un Proxy que
 * antepone `PRAGMA foreign_keys = ON` a cada `execute`/`batch` y lo ejecuta
 * al iniciar una `transaction`.
 *
 * Nota: ejecutar el PRAGMA en cada llamada agrega un round-trip adicional
 * por statement individual (se usa `batch` para hacerlo atomic). Para cargas
 * pesadas conviene agrupar operaciones en `batch` o `transaction` para
 * amortizar el costo.
 */
export const libsqlClient: Client = new Proxy(rawClient, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);

    if (prop === 'execute') {
      return async function (stmt: InStatement) {
        // Atomic batch: PRAGMA + statement; devolvemos el resultado del statement real.
        const results = await target.batch([PRAGMA_FK, stmt], 'deferred');
        return results[results.length - 1];
      };
    }

    if (prop === 'batch') {
      return async function (stmts: InStatement[], mode?: any) {
        const newStmts = [PRAGMA_FK, ...stmts];
        const results = await (target.batch as any)(newStmts, mode);
        // Quitamos el resultado del PRAGMA para mantener el shape esperado.
        return results.slice(1);
      };
    }

    if (prop === 'transaction') {
      return async function (mode?: any) {
        const tx = await (orig as any).call(target, mode);
        await tx.execute(PRAGMA_FK);
        return tx;
      };
    }

    return typeof orig === 'function' ? orig.bind(target) : orig;
  },
});

/**
 * Se mantiene por compatibilidad con código existente que lo invoca en
 * `server.ts`. El enforcement real lo da el Proxy de `libsqlClient` arriba;
 * este `initDb` simplemente confirma que la conexión funciona.
 */
export async function initDb(): Promise<void> {
  await libsqlClient.execute(PRAGMA_FK);
}
