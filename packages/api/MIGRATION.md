# Migración de la base Turso (lossless)

Toolkit para migrar **toda** la base a una cuenta/DB Turso nueva sin perder
ningún detalle (esquema, datos, índices y triggers). Pensado para el caso en que
la cuenta free quedó bloqueada por quota y querés moverte a una cuenta nueva con
quota fresca.

> ⚠️ El **export requiere que el origen sea legible**. Si la cuenta está
> bloqueada por quota, primero hay que desbloquearla (pedir un *grace* a soporte
> de Turso o esperar el reset mensual). Una vez legible, el export corre en un
> solo paso.

## Qué hace

- **`db:export`** — vuelca el origen completo a `db-dump/dump-latest.json`
  (+ una copia con timestamp). Lee de `sqlite_master`, así que captura **todas**
  las tablas, no solo las que conoce Drizzle.
- **`db:import`** — recrea el esquema y carga todas las filas en el destino,
  insertando en orden de dependencias (padres antes que hijos por FK).
- **`db:verify`** — re-exporta el destino y lo compara fila por fila contra el
  dump. Sale con error si falta o sobra cualquier cosa.

El dump contiene datos sensibles (emails, hashes) → `db-dump/` está en
`.gitignore`. **Nunca se commitea.**

## Pasos

### 1. Desbloquear el origen (si está bloqueado)

Pedí grace a soporte de Turso o esperá el reset del ciclo. Confirmá que lee:

```bash
cd packages/api
# Con las credenciales del ORIGEN en .env (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)
npx tsx -e "import('@libsql/client').then(async ({createClient})=>{const c=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});console.log(await c.execute('SELECT 1'))})"
```

### 2. Exportar el origen

Con las credenciales del origen en `.env` (o seteá `SRC_TURSO_*`):

```bash
cd packages/api
yarn db:export
```

Queda `db-dump/dump-latest.json`. Verificá el resumen (tablas + filas).

### 3. Crear la base destino

1. Creá una **cuenta Turso nueva** (otro email = quota free fresca), o un grupo/DB
   nuevo si vas a quedarte en la misma cuenta tras el reset.
2. Creá la database y generá un **auth token** con permisos de escritura.
3. Anotá la URL (`libsql://...`) y el token del **destino**.

### 4. Importar al destino

Seteá las credenciales del destino y corré el import. La forma más segura es
pasarlas como variables del proceso para no confundir origen/destino:

```bash
cd packages/api
DST_TURSO_DATABASE_URL="libsql://NUEVA.turso.io" \
DST_TURSO_AUTH_TOKEN="TOKEN_NUEVO" \
SRC_TURSO_DATABASE_URL="libsql://VIEJA.turso.io" \
yarn db:import
```

> El import aborta si `DST_*` == `SRC_*` (protección anti-pisar el origen).
> Para reintentar sobre un destino ya tocado: agregá `--wipe`.

### 5. Verificar

```bash
cd packages/api
DST_TURSO_DATABASE_URL="libsql://NUEVA.turso.io" \
DST_TURSO_AUTH_TOKEN="TOKEN_NUEVO" \
yarn db:verify
```

Tiene que decir **`✅ VERIFICADO: el destino coincide exactamente con el dump.`**

### 6. Apuntar la app al destino

En **Render** (servicio API *y* worker cron), actualizá las env vars:

- `TURSO_DATABASE_URL` → URL del destino
- `TURSO_AUTH_TOKEN`  → token del destino

Redeploy. Verificá `https://<api>/health` → `{"status":"ok","db":"up"}`.

Actualizá también tu `.env` local.

## Variables de entorno

| Variable | Usada por | Fallback |
|---|---|---|
| `SRC_TURSO_DATABASE_URL` / `SRC_TURSO_AUTH_TOKEN` | export | `TURSO_*` |
| `DST_TURSO_DATABASE_URL` / `DST_TURSO_AUTH_TOKEN` | import, verify | `TURSO_*` |

## Notas

- **No pierde detalle:** el DDL se toma tal cual de `sqlite_master` (constraints,
  defaults, AUTOINCREMENT incluidos). Los valores se codifican preservando tipo
  (null / number / string / bigint / blob).
- **AUTOINCREMENT:** al insertar los `id` explícitos, SQLite actualiza
  `sqlite_sequence` solo, así que los nuevos inserts post-migración siguen la
  secuencia correcta.
- **Triggers:** se crean *después* de cargar los datos, así que no se disparan
  durante la importación (no duplican filas).
- **Tablas internas** (`sqlite_*`, `libsql_*`, `_litestream*`) se omiten: las
  regenera el motor.
