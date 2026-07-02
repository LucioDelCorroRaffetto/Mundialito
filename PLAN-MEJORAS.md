# Plan de mejoras — Julio 2026 (spec de implementación)

Surge de la revisión integral del 2026-07-02. Este documento es una
**especificación ejecutable**: las decisiones de diseño ya están tomadas y cada
sesión tiene pasos, schemas y criterios verificables. El agente que implemente
**no debe re-decidir nada** — si un paso resulta imposible tal como está
escrito, frenar y reportar en vez de improvisar una alternativa.

Se ejecuta **una sesión por vez, en orden**. Cada sesión termina con deploy y
validación antes de pasar a la siguiente.

**Calendario:** la final del Mundial es el **19 de julio de 2026**. Las
sesiones 2–4 dan valor durante la eliminatoria; el Wrapped (5–6) debe estar en
prod **antes de la final**.

Estados: ⬜ pendiente · 🔄 en curso · ✅ hecha · ⏭️ salteada

---

## Convenciones del repo (leer antes de cualquier sesión)

- **Layout**: monorepo. Frontend Vite + React 18 + TanStack Query + Zustand +
  framer-motion + Tailwind en `src/`. API Express + Drizzle + Turso (libSQL)
  en `packages/api/`. Worker de notificaciones en `packages/worker/`.
- **Deploy**: la API corre en Render (auto-deploy de `main`,
  `mundialito-d2jk.onrender.com`); el frontend en Vercel
  (`mundialito-pi.vercel.app` — ojo: `mundialito.vercel.app` es OTRA app).
- **Git**: hay otro agente automático que commitea en este repo y puede dejar
  archivos sin commitear en el working tree. **Nunca `git add -A/-u`** —
  stagear siempre por path explícito, solo los archivos propios. Verificar
  `origin/main` después de pushear. Ramas: `feat/sesion-N-<slug>`, merge a
  main al validar (sesiones chicas de docs pueden ir directo a main).
- **Tablas nuevas (Drizzle)**: NO hay archivos SQL de migración. Crear
  `packages/api/src/db/schema/<tabla>.ts`, exportarla en `schema/index.ts`,
  y aplicar con `npx drizzle-kit push` desde `packages/api/` (config en
  `drizzle.config.ts`, dialecto turso). Sintaxis de referencia: ver
  `schema/predictions.ts` (`sqliteTable`, `integer/text`,
  `.default(sql`(datetime('now'))`)`, `uniqueIndex/index` en el callback).
- **Errores API**: lanzar `AppError(code, message, statusCode)` o subclases
  (`NotFoundError`, `UnauthorizedError`, `ConflictError`) de `lib/errors.ts`.
  El error-handler responde `{ error: { code, message } }`.
- **Validación**: middleware `validate(zodSchema)` de `middleware/validate.ts`
  en el router, schema exportado desde el handler.
- **Shape de respuestas**: éxito → `{ data: ... }` (listas a veces con
  `meta`). Mantenerlo.
- **Auth**: `tokenParse` global setea `req.user = {id, username}`;
  `authGuard` exige user; `requireAdmin` (admin router) chequea
  `ADMIN_USER_IDS` env.
- **Tests API**: vitest, archivos `*.test.ts` junto al código (patrón:
  `lib/scoring.test.ts`). Correr con `npm run test` dentro de `packages/api`.
  Extraer lógica pura a `lib/` para testear sin DB.
- **Motion frontend**: usar SIEMPRE los helpers de `src/shared/lib/motion.ts`
  (`fadeVariants`, `slideUpVariants`, `scaleVariants`, `sheetVariants`,
  `staggerContainer/Item`, `springSnappy`, `tapScale`) y degradar con
  `const { reduced } = useMotionPrefs()`. Solo animar transform/opacity.
- **Datos frontend**: hooks de TanStack Query en `src/shared/hooks/`,
  cliente axios `apiClient` de `src/shared/lib/api-client.ts` (ya adjunta el
  Bearer y maneja el refresh en 401). Tipos en `src/shared/types/api.ts`.
- **Rutas frontend**: páginas lazy en `src/app/router.tsx` vía
  `lazyWithReload` (copiar el patrón existente).
- **Env vars API** (prod): `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  (boot-fail si faltan), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, `GOOGLE_CLIENT_ID`,
  `ADMIN_USER_IDS`, `ALLOWED_ORIGINS`, `SYNC_SECRET`.

---

## ⬜ Sesión 1 — Seguridad: refresh tokens con rotación + headers

**Objetivo:** que un refresh token robado deje de valer 30 días irrevocables.
Hoy `POST /auth/refresh` acepta cualquier JWT firmado (stateless): logout,
delete-account y cambio de dispositivo no revocan nada.

**Decisiones tomadas:**
- Registro server-side de refresh tokens (hash SHA-256, nunca el token plano).
- Rotación en cada refresh; **reuso de un token ya rotado = señal de robo ⇒
  se revoca toda la familia** (todas las filas con el mismo `familyId`).
- Compatibilidad legacy para no desloguear a los usuarios actuales.
- NO existe `/auth/logout` hoy (el logout es client-side) — se crea.
- NO se mueve el refresh a cookie httpOnly (descartado; la CSP mitiga XSS).

### Pasos

1. **Schema** — crear `packages/api/src/db/schema/refresh-tokens.ts`:

```typescript
import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),      // SHA-256 hex del JWT completo
  familyId: text('family_id').notNull(),        // uuid; se hereda al rotar
  expiresAt: text('expires_at').notNull(),      // ISO; espeja el exp del JWT
  revokedAt: text('revoked_at'),                // null = vigente
  replacedByHash: text('replaced_by_hash'),     // hash del sucesor al rotar
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqHash: uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
  byUser: index('refresh_tokens_user_idx').on(t.userId),
  byFamily: index('refresh_tokens_family_idx').on(t.familyId),
}));
```

   Exportar en `schema/index.ts`. Aplicar con `npx drizzle-kit push`.

2. **Store** — crear `packages/api/src/lib/refresh-store.ts` con lógica pura +
   acceso a DB:
   - `hashToken(token: string): string` — `crypto.createHash('sha256')...digest('hex')`.
   - `issueRefreshToken(payload: JwtPayload, familyId?: string): Promise<string>`
     — firma con `signRefresh(payload)` (de `lib/jwt.ts`), inserta fila con
     hash + familyId (nuevo `crypto.randomUUID()` si no viene) + expiresAt
     (now + 30 días), devuelve el token plano.
   - `rotateRefreshToken(token: string): Promise<{ token: string; payload: JwtPayload }>`:
     1. `verifyRefresh(token)` — si el JWT es inválido/expirado ⇒ `UnauthorizedError`.
     2. Buscar fila por hash. **Si no existe** ⇒ caso legacy (ver paso 3).
     3. Si `revokedAt != null` ⇒ **reuso detectado**: `UPDATE ... SET revoked_at = now`
        para toda la `familyId`, y `UnauthorizedError('Refresh token reuse detected')`.
     4. Si `expiresAt <= now` ⇒ `UnauthorizedError`.
     5. Emitir el sucesor con `issueRefreshToken(payload, familyId)`, marcar la
        fila vieja `revokedAt = now, replacedByHash = <hash nuevo>`.
   - `revokeToken(token: string): Promise<void>` — marca revokedAt por hash
     (silencioso si no existe).
   - `revokeAllForUser(userId: number): Promise<void>`.
   - `pruneExpired(): Promise<void>` — `DELETE` de filas con
     `expiresAt < now − 5 días`. Llamarla fire-and-forget al inicio de
     `rotateRefreshToken` con probabilidad 1/50 (`Math.random() < 0.02`) —
     limpieza perezosa, sin cron nuevo.

3. **Handler refresh** — `routes/auth/handlers/refresh.ts`: reemplazar la
   lógica por `rotateRefreshToken`. **Caso legacy** (token JWT válido pero sin
   fila en DB — usuarios logueados antes del deploy): emitir par nuevo con
   `issueRefreshToken` (familia nueva) y devolverlo. Dejar comentario
   `// TODO(sesión futura): eliminar el fallback legacy pasado agosto 2026`.
   Response shape NO cambia: `{ accessToken, refreshToken }`.

4. **Emisión en login/register/google** — en `login.ts`, `register.ts` y
   `google.ts` reemplazar `signRefresh(payload)` por
   `await issueRefreshToken(payload)`. Response shape no cambia.

5. **Logout** — nuevo `routes/auth/handlers/logout.ts` + ruta
   `POST /auth/logout` en `routes/auth/router.ts` (con `authGuard`):
   schema `z.object({ refreshToken: z.string().optional() })`; si viene el
   token ⇒ `revokeToken`, si no ⇒ `revokeAllForUser(req.user.id)`. 204.

6. **Delete account** — en `delete-account.ts`, agregar
   `revokeAllForUser(userId)` (la FK cascade ya borra las filas al borrar el
   user; el revoke explícito es por claridad — si la transacción ya borra el
   user, este paso es redundante y puede omitirse con un comentario).

7. **Frontend logout** — en `src/shared/hooks/use-auth.ts`: antes de limpiar
   store/localStorage, `apiClient.post('/auth/logout', { refreshToken:
   localStorage.getItem('mundialito_refresh') }).catch(() => {})`
   (fire-and-forget; el logout local nunca debe fallar por red).

8. **Helmet** — en `packages/api/src/app.ts`, `npm i helmet` (workspace api) y
   `app.use(helmet({ contentSecurityPolicy: false }))` ANTES de `cors(...)`.
   (CSP no aplica a una API JSON; va en el frontend.)

9. **Headers frontend** — en `vercel.json` agregar bloque `headers` para
   `/(.*)`:
   - `Content-Security-Policy`:
     `default-src 'self'; script-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://mundialito-d2jk.onrender.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; manifest-src 'self'; worker-src 'self'`
     (⚠️ los dominios de Google Fonts se quitan recién en la Sesión 7).
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
     `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
10. **bcrypt** — `ROUNDS` 10 → 12 en `packages/api/src/lib/password.ts`.

**Qué NO hacer:** no tocar la duración del access token (1h está bien); no
cambiar el interceptor 401 del frontend (ya rota el refresh que le devuelven);
no agregar Redis ni estado distribuido (single instance).

**Tests** (`lib/refresh-store.test.ts`, DB `file:local-test.db` o mock):
rotación feliz devuelve token nuevo y revoca el viejo · reuso del viejo revoca
la familia entera · token expirado rechaza · legacy (JWT válido sin fila)
emite par registrado · revokeAllForUser deja todos revocados.

**DoD:**
- `npm run test` verde en packages/api.
- En prod: login → refresh (esperar 401 o forzarlo) funciona; logout → el
  refresh guardado deja de servir (401 en `/auth/refresh` con ese token).
- Usuarios ya logueados NO se deslogean tras el deploy (probar con una sesión
  vieja real).
- **Login con Google funciona en el preview de Vercel ANTES de mergear** — la
  CSP es el riesgo #1 de esta sesión; si algo se bloquea, mirar la consola
  del browser y ajustar la directiva exacta.
- `curl -sI https://mundialito-pi.vercel.app | grep -i content-security` y
  `curl -sI https://mundialito-d2jk.onrender.com/health` muestran los headers.

---

## ⬜ Sesión 2 — En vivo: celebración de acierto + leaderboard animado

**Objetivo:** que acertar en vivo se sienta. Hoy el badge cambia de color y
nada más.

**Decisiones tomadas:** confetti casero con framer-motion (SIN dependencia
nueva tipo canvas-confetti) · detección de transición client-side comparando
outcome entre renders (el polling de 15s ya trae el dato) · guard en
sessionStorage para no re-celebrar.

### Pasos

1. **ConfettiBurst** — `src/shared/components/confetti-burst.tsx`:
   componente que al montar renderiza ~24 `motion.span` absolutos (partículas
   4–8px, `borderRadius` mixto) desde el centro, con `animate` a posiciones
   radiales aleatorias (`x`, `y` hasta ±140px, `rotate`, `opacity` 1→0),
   `transition` 1.2s ease-out, y se desmonta solo (callback `onDone` via
   setTimeout 1400ms). Colores: `var(--accent)`, `var(--wc26-mex)`,
   `var(--wc26-usa)`, `var(--wc26-can)`. Solo transform/opacity.
   Props: `{ onDone: () => void }`.
2. **Hook** — `src/shared/hooks/use-prediction-celebration.ts`:
   `usePredictionCelebration(matchId, outcome)` donde `outcome` es el score
   type derivado que ya calcula match-detail (`getScoreType`). Lógica:
   `useRef` guarda el outcome anterior; si pasa de `pending`/undefined a
   `exact` ⇒ `celebration = 'exact'`; a `correct`-like ⇒ `'correct'`; solo si
   `sessionStorage.getItem('celebrated:' + matchId)` es null; al disparar,
   setear el flag. Devuelve `{ celebration, clear }`.
3. **Integración** — en `src/pages/match-detail.tsx`: montar
   `<ConfettiBurst>` sobre la card del pronóstico cuando
   `celebration === 'exact'` (y con `reduced` de `useMotionPrefs()` ⇒ NO
   montar confetti, solo el badge con `fadeVariants`). Para `'correct'`:
   pulso de glow verde en la card (`motion.div animate={{ boxShadow: [...] }}`
   una vez, o clase CSS one-shot). Toast opcional con `sonner` (ya es
   dependencia): "¡Exacto! +5" / "¡Acertaste! +N".
4. **Leaderboard animado** — en `src/pages/leaderboard.tsx` y
   `src/pages/league-detail.tsx`: envolver la lista de filas en
   `<LayoutGroup>` y darle a cada fila `motion.div layout={!reduced}` con
   `transition={springSnappy}` y `key={userId}` (la key ya existe — NO
   cambiarla). El polling de 60s/refetch hace el resto.
5. **Count-up** — agregar a `src/shared/lib/motion.ts`:

```typescript
/** Anima un número de 0 (o prev) a value. reduced ⇒ devuelve value directo. */
export function useCountUp(value: number, opts?: { duration?: number }): number
```

   Implementar con `animate(from, to, { duration, onUpdate })` de
   framer-motion + `useState`, animando desde el valor anterior (ref).
   Aplicar en: puntos de PodiumCard y LeaderboardRow (leaderboard.tsx),
   puntos de standings (league-detail.tsx), XP del perfil (profile.tsx).

**Qué NO hacer:** no agregar websockets ni bajar el intervalo de polling; no
celebrar en la lista de partidos (solo match-detail); no usar librerías de
confetti.

**DoD:**
- Simulación local: mockear transición de outcome (o editar el estado en dev)
  y ver confetti una sola vez; recargar ⇒ no repite.
- Validar en un partido en vivo real (hay casi todos los días hasta el 14/7).
- Con reduce-motion activo: sin confetti, sin layout animation, números sin
  count-up.
- Sin jank: el confetti no anima layout/width/height (verificar en DevTools
  performance si hay dudas).

---

## ⬜ Sesión 3 — Social: evolución de posiciones + head-to-head

**Objetivo:** tema de conversación para las ligas durante la eliminatoria.

**Decisiones tomadas:** endpoint nuevo para la serie temporal (el frontend no
puede derivarla sin N requests) · gráfico SVG propio, sin charting lib · H2H
sin endpoint nuevo (reusa `GET /predictions/user/:userId/history` ×2) ·
componente de fila H2H propio, NO tocar `HistoryRow`.

### Pasos — evolución

1. **Endpoint** — `GET /leagues/:id/standings/history` en
   `routes/leagues/handlers/standings-history.ts` (+ ruta en el router de
   leagues, con el mismo membership-check que `standings.ts` — 403 si no es
   miembro). Query: todas las predictions de la liga con `points not null`,
   join a matches por fecha. Agrupar por **día AR del kickoff** (usar el
   helper de `lib/latam-time.ts` si existe conversión; si no, restar 3h del
   UTC y tomar la fecha). Respuesta:

```json
{ "data": {
    "days": ["2026-06-11", "2026-06-12", ...],
    "series": [
      { "userId": 1, "username": "lucho", "avatarUrl": null,
        "cumulativePoints": [3, 8, 8, 15, ...] }
    ]
} }
```

   `cumulativePoints[i]` = suma de points de días ≤ `days[i]`. Incluir a
   TODOS los miembros (los sin pronósticos van con ceros). Extraer el cálculo
   puro (rows → series) a `lib/standings-history.ts` y testearlo.
2. **Hook** — `useLeagueStandingsHistory(leagueId)` en `use-leagues.ts`
   (staleTime 5 min; sin polling).
3. **Chart** — `src/shared/components/league-history-chart.tsx`: SVG
   `viewBox="0 0 360 200"`, una `<polyline>` por miembro (puntos escalados
   min–max), eje X = días (labels solo primero/último/cada ~5), eje Y
   implícito. Paleta fija de 12 colores (definir array local con buen
   contraste sobre --bg-card); la línea del usuario actual usa
   `var(--accent)` y `strokeWidth 3` (resto 1.5, opacity 0.7). Si hay >12
   miembros: top 10 por puntos + usuario actual + label "+N más". Leyenda
   debajo (chips con color + username, wrap). Animación de entrada:
   `strokeDasharray/strokeDashoffset` con transición CSS 600ms (skip si
   reduced). Sin tooltip en v1.
4. **Integración** — sección "Evolución" en `league-detail.tsx`, debajo de la
   tabla de posiciones, colapsable (`<details>` o estado + slideUpVariants).
   Solo renderizar si hay ≥2 días con datos.

### Pasos — head-to-head

5. **Página** — `src/pages/head-to-head.tsx`, ruta lazy
   `/h2h/:userIdA/:userIdB` dentro del grupo RequireAuth en `router.tsx`.
   Datos: `useEnrichedUserPredictionHistory(userIdA)` y `(userIdB)` (hook
   existente en `use-user-profile.ts` / `use-enriched-history.ts` — ya aplica
   la visibilidad server-side y resuelve TBD). Merge por `matchId` (solo
   partidos donde AMBOS tienen entry visible).
6. **Header**: avatares + usernames enfrentados, total de puntos (en los
   partidos comunes) de cada uno y el diferencial, con `useCountUp`.
7. **Fila** — `src/shared/components/h2h-row.tsx`: layout de 3 columnas —
   pronóstico A | resultado real (chico, centro, flags) | pronóstico B — con
   el badge de outcome de cada lado (reusar las mismas clases de color que
   `HistoryRow`: exact ⇒ legendary-rainbow, correct ⇒ green, missed ⇒ red).
   Lista con staggerContainer/Item.
8. **Entradas**: botón "Comparar" (icono swords/vs) en `user-profile.tsx`
   (navega a `/h2h/${myId}/${theirId}`) y acción por fila en la tabla de
   standings de `league-detail.tsx` (long-press no: un icono chico al final
   de la fila, excepto la propia).

**Qué NO hacer:** no instalar recharts/chart.js/d3; no crear endpoint H2H; no
mostrar pronósticos de partidos no arrancados (el endpoint ya filtra — no
"completar" client-side).

**DoD:**
- Test de `lib/standings-history.ts` (fixtures: 3 users, 4 días, uno sin
  pronósticos) verde.
- Chart legible en 375px de ancho con 8 miembros (probar en la liga real).
- H2H: abrir `/h2h/A/B` con un amigo real muestra solo partidos arrancados,
  totales correctos; el link desde liga y perfil navega bien.
- Reduce-motion: sin animación de trazo ni stagger.

---

## ⬜ Sesión 4 — Social: reacciones por liga

**Objetivo:** banter sin construir un chat.

**Decisiones tomadas:** set fijo de 6 emojis, whitelist server-side · toggle
idempotente · solo sobre pronósticos revelados de compañeros de liga · push
con throttle in-memory.

### Pasos

1. **Schema** — `packages/api/src/db/schema/prediction-reactions.ts`:

```typescript
export const predictionReactions = sqliteTable('prediction_reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull()
    .references(() => predictions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('prediction_reactions_uniq').on(t.predictionId, t.userId, t.emoji),
  byPrediction: index('prediction_reactions_prediction_idx').on(t.predictionId),
}));
```

   Export en `schema/index.ts` + `npx drizzle-kit push`.
2. **Constantes** — `ALLOWED_REACTIONS = ['😂','🔥','💀','🎯','🤡','⚽'] as const`
   en un módulo compartible del API (p. ej. `lib/reactions.ts`).
3. **POST** — `POST /predictions/:id/reactions` (authGuard, validate
   `z.object({ emoji: z.enum(ALLOWED_REACTIONS) })`) en
   `routes/predictions/handlers/toggle-reaction.ts`:
   - Cargar prediction + su match + liga. 404 si no existe.
   - 403 si `prediction.userId === req.user.id` (no auto-reacción).
   - 403 si el reactor no es miembro de la liga del pronóstico (query a
     league_members igual que en `match-predictions.ts`).
   - 403 `NOT_REVEALED` si el match no está revelado — REUSAR la misma
     condición de visibilidad de `match-predictions.ts` (live/finished o
     kickoff pasado según `predictionsVisibility`); si esa lógica está
     inline, extraerla a `lib/match-helpers.ts` como `isPredictionRevealed()`.
   - Toggle: si existe fila (predictionId,userId,emoji) ⇒ DELETE y responder
     `{ data: { reacted: false } }`; si no ⇒ INSERT y `{ data: { reacted: true } }`.
   - Push al dueño (fire-and-forget) con throttle: `Map<string, number>`
     clave `${ownerId}:${matchId}`, ventana 10 min. Payload:
     `{ title: '${emoji} ${req.user.username} reaccionó a tu pronóstico', body: '${home} vs ${away}', url: '/matches/${matchId}' }`
     — buscar las subs del dueño como hace `send-deadline-reminders.ts`.
4. **GET** — `GET /predictions/match/:matchId/reactions?leagueId=N`
   (authGuard + membership): agregado por predictionId:
   `{ data: [{ predictionId, emoji, count, reactedByMe }] }`.
5. **Frontend hook** — `src/shared/hooks/use-reactions.ts`:
   `useMatchReactions(matchId, leagueId)` (query, staleTime 30s, refetch al
   togglear) y `useToggleReaction()` (mutation con update optimista del
   cache de la query anterior; rollback en error).
6. **UI** — en la sección de match-detail que lista los pronósticos de los
   miembros de la liga (revelados): debajo de cada pronóstico ajeno, fila de
   chips: los emojis con count>0 + botón "+" que abre un mini-popover con los
   6 (usar `scaleVariants`). Chip propio activo con borde `--accent-border`.
   Pop `springSnappy` + `useHaptic()` al togglear. En pronósticos propios:
   solo lectura (ver counts, sin togglear).

**Qué NO hacer:** no texto libre; no reacciones en leaderboard ni historial
(solo match-detail v1); no tabla de preferencias de push (el throttle
alcanza); no websockets.

**DoD:**
- Server-side probado con curl: reaccionar a pronóstico no revelado ⇒ 403;
  a uno propio ⇒ 403; de otra liga ⇒ 403; toggle dos veces ⇒ estado original.
- Optimista: el chip responde al toque instantáneo con red lenta (throttling
  en DevTools).
- Push llega al dueño y no se repite dentro de los 10 min.

---

## ⬜ Sesión 5 — Wrapped backend ⏰ antes del 19/7

**Objetivo:** datos del "Mundialito Wrapped" por usuario.

**Decisiones tomadas:** cálculo on-the-fly + cache in-memory (Map por userId,
TTL 1h) — NO tabla materializada · gate por torneo terminado con bypass de
admin para probar · métricas puras extraídas a `lib/wrapped.ts` con tests.

### Pasos

1. **Lib pura** — `packages/api/src/lib/wrapped.ts`: funciones puras que
   reciben rows y devuelven métricas:
   - `longestStreak(entries: {kickoffUtc, outcome}[])` — racha máxima de
     outcomes `exact|correct` consecutivos ordenando por kickoff asc.
   - `bestHit(exactEntries, aggregates)` — el exacto con menor % de gente que
     lo pronosticó (usar `lib/prediction-aggregates.ts` si expone eso); si no
     hay dato de forecast para el match, fallback: el exacto con mayor
     `homeScore+awayScore`. Devuelve `{ matchId, score, rarity? }`.
   - `nearestRival(myPoints, standingRows)` — miembro (≠yo) con menor
     `|points − myPoints|`; empate ⇒ el de mejor posición.
   - `mostPredictedTeam(predictions, matches)` — teamId que más veces
     aparece como ganador en mis pronósticos (empates no cuentan).
2. **Handler** — `routes/users/handlers/wrapped.ts`, ruta
   `GET /users/me/wrapped` (authGuard) en el router de users:
   - **Gate**: torneo terminado = el match con round `final` está `finished`
     (query directa a matches). Si no ⇒ `AppError('TOURNAMENT_NOT_FINISHED',
     'El Wrapped se abre cuando termine el Mundial', 409)`. Bypass:
     `?preview=1` Y user admin (misma lógica de `require-admin.ts`).
   - **Cache**: `Map<number, { data, at }>`, TTL 1h.
   - **Payload** `{ data: { ... } }`:
     - `totalPoints`, `exactCount`, `correctCount`, `totalPredictions`,
       `accuracy` — reusar la lógica de `users/handlers/my-stats.ts`
       (extraer/reusar, no copiar).
     - `globalRank` — posición en la query de `GET /users/leaderboard`.
     - `perLeague: [{ leagueId, name, position, points }]` — por cada liga
       del user, reusar el cálculo de `standings.ts`.
     - `longestStreak`, `bestHit` (enriquecido con teams del match),
       `nearestRival` (de la liga principal = la de más miembros),
       `mostPredictedTeam` (con name/flag de teams).
     - `championPick: { teamId, name, flag, correct: boolean, points }` de
       tournament_predictions (null si no jugó).
     - `fantasy: { points, rank } | null` de fantasy_teams + su standings.
     - `topAchievements`: 3 con mayor xpReward de los earned.
     - `xp`, `level` (mismo shape que `/auth/me`).
3. **Tests** — `lib/wrapped.test.ts`: fixtures por función (racha con hueco
   de pending en el medio, bestHit con y sin forecast, rival con empate,
   equipo más pronosticado con empates descartados).

**Qué NO hacer:** no persistir snapshots en DB; no endpoint público de
wrapped ajeno (solo `me`); no tocar el forecast cache existente.

**DoD:** tests verdes; `GET /users/me/wrapped?preview=1` como admin en prod
devuelve el payload completo con datos reales coherentes (validar a mano 3
métricas contra la UI); sin preview y torneo en curso ⇒ 409.

---

## ⬜ Sesión 6 — Wrapped frontend + share ⏰ en prod antes del 19/7

**Decisiones tomadas:** formato stories (tap/swipe, barra de progreso) ·
imagen compartible generada client-side en canvas 1080×1920 · NO og-image
dinámica server-side · push post-final desde run-daily con flag en DB.

### Pasos

1. **Hook** — `useWrapped()` en `src/shared/hooks/use-wrapped.ts`
   (`GET /users/me/wrapped`, retry false, sin polling; exponer el 409 como
   estado `notReady`).
2. **Página** — `src/pages/wrapped.tsx`, ruta lazy `/wrapped` (RequireAuth),
   fondo full-bleed `--bg-deep` sin AppShell si el layout lo permite (si
   AppShell es obligatorio en el grupo, ocultar tab-bar con estado local o
   montar la ruta fuera del grupo con su propio RequireAuth — elegir lo que
   menos toque el router).
   - Slides (array estático, skip de las que no tengan dato): intro → puntos
     totales + rank global → exactos/accuracy → racha → bestHit → rival →
     equipo más pronosticado → championPick → fantasy → logros → cierre con
     CTA compartir.
   - Navegación: tap mitad derecha avanza / izquierda retrocede; swipe con
     `drag="x"` de framer; barra de progreso segmentada arriba (`motion.div`
     scaleX). `AnimatePresence` + `slideUpVariants`/`scaleVariants`;
     `reduced` ⇒ `fadeVariants`. Números con `useCountUp`.
3. **Share image** — `src/shared/lib/wrapped-share-image.ts`:
   `renderWrappedImage(data): Promise<Blob>` — canvas 1080×1920, fondo
   #0a0e1a, marco con `--accent`, wordmark MUNDIALITO (font de sistema bold
   si Russo One no está — aceptable), 4 métricas grandes (puntos, rank,
   exactos, racha) y footer "mundialito-pi.vercel.app". En la slide final:
   botón "Compartir" ⇒ `navigator.share({ files: [new File([blob], 'wrapped.png', {type:'image/png'})] })`
   con fallback (sin Web Share con files, p. ej. desktop) a descarga vía
   `<a download>`.
4. **Banner en home** — en `src/pages/home.tsx`, cuando
   `useTournamentPhase(...).kind === 'completed'`: banner estilo
   `knockout-phase-banner.tsx` (mismo layout, accent dorado) con CTA
   "🏆 Ver mi Wrapped" → `/wrapped`.
5. **Flag store** — tabla mínima `worker_flags` (`key` text PK, `value` text,
   `updatedAt`) en `packages/api/src/db/schema/worker-flags.ts` (export +
   push). El worker ya accede a la DB — usar el mismo patrón de acceso que
   sus otros jobs.
6. **Push post-final** — `packages/worker/src/jobs/send-wrapped-ready.ts`,
   invocado desde `run-daily.ts` después de los jobs existentes: si el match
   final está finished Y `worker_flags['wrapped_push_sent']` no existe ⇒
   enviar a TODAS las push subscriptions
   `{ title: '🏆 Tu Mundialito Wrapped está listo', body: 'Mirá tu resumen del Mundial y compartilo', url: '/wrapped' }`
   (batch como `send-daily-prediction-reminder.ts`), y setear el flag.

**Qué NO hacer:** no html2canvas ni librerías de screenshot; no og-image por
usuario; no editar el service worker.

**DoD:** flujo completo en un celular real con `?preview=1` (admin): banner →
stories fluidas → compartir imagen a WhatsApp y que se vea bien · reduced ⇒
fades · el job es idempotente (correrlo dos veces manda un solo push) ·
**merged y deployado antes del 19/7**.

---

## ⬜ Sesión 7 — Identidad: fuentes, logo, og:image

**Decisiones tomadas:** eliminar **Oswald** (solo se usa en el tagline del
splash → pasa a `font-display`/Space Grotesk) · self-host con @fontsource ·
logo 100% paths (sin `<text>`) · og-image estática generada con sharp.

### Pasos

1. **og:image** — script one-off `scripts/generate-og.mjs` (sharp ya es
   devDependency): render de un SVG 1200×630 (fondo #0a0e1a, escudo del logo
   centrado-izquierda, texto "Mundialito — El prode + fantasy del Mundial" y
   URL) a `public/og-image.png`. Meta en `index.html`: `og:title`,
   `og:description`, `og:image` = `https://mundialito-pi.vercel.app/og-image.png`
   (absoluta), `og:type=website`, `og:url`, `twitter:card=summary_large_image`,
   `twitter:image`.
2. **Fuentes** — `npm i @fontsource/inter @fontsource/space-grotesk
   @fontsource/russo-one`; en `src/main.tsx` importar los pesos usados
   (inter: 400/500/600/700/800; space-grotesk: 400/500/700; russo-one: 400).
   Borrar de `index.html` los dos `<link>` de Google Fonts y los preconnect a
   fonts.googleapis/gstatic. En `tailwind.config.ts`: eliminar la key
   `tagline` y reemplazar `font-tagline` por `font-display` en el código
   (grep; hoy solo `splash.tsx`). Actualizar la CSP de `vercel.json`: quitar
   fonts.googleapis de style-src y fonts.gstatic de font-src, agregar
   `font-src 'self'`.
3. **Logo a paths** — en `src/shared/components/logo.tsx`:
   - Reemplazar los 3 `<text>★</text>` por `<path>` de estrella de 5 puntas
     (un solo path d reutilizado con `transform="translate(...) scale(...)"`).
   - Convertir "MUNDIALITO" y "2026" a paths: script one-off
     `scripts/text-to-path.mjs` con `opentype.js` (devDependency) que carga el
     TTF de Russo One (de node_modules/@fontsource) y emite el `d` de cada
     texto (`font.getPath(text, x, y, size).toPathData()`). Pegar los paths
     en el componente conservando los fills por variante. Eliminar los
     `fontFamily` del SVG.
   - Regenerar `public/favicon.svg`, `apple-touch-icon.png` y
     `public/icons/*` desde el SVG nuevo (script con sharp; respetar tamaños
     y el padding del maskable).
4. **Verificación de peso** — `npm run build` y comparar el peso total de
   fuentes vs el baseline (las tres familias self-hosted deberían pesar menos
   que las cuatro remotas); Lighthouse mobile antes/después (LCP y
   render-blocking).

**Qué NO hacer:** no cambiar la escala tipográfica ni los usos de
font-display/font-logo existentes; no rediseñar el escudo (misma composición,
solo paths); no tocar el manifest salvo que un ícono cambie de path.

**DoD:** logo idéntico a simple vista con las fuentes web deshabilitadas
(DevTools → bloquear requests de fuentes → el SVG no cambia) · preview de
link correcto al pegar la URL en WhatsApp · cero requests a
fonts.googleapis/gstatic en la pestaña Network · Lighthouse sin regresión.

---

## ⬜ Sesión 8 — Backlog técnico menor

Barrido corto; ítems independientes, commitear de a uno.

1. **Lock `/sync`** — en `app.ts`: `let syncInProgress = false;` a nivel
   módulo; al entrar, si true ⇒ `429 { error: 'sync already running' }`;
   `syncInProgress = true` + `try/finally` para resetear.
2. **Rate limit genérico** — `app.use('/api/v1', rateLimit({ windowMs: 60_000,
   max: 300, routeKey: 'api-general' }))` antes de `apiRouter` (reusa
   `middleware/rate-limit.ts`; 300/min por IP no molesta a usuarios reales).
3. **`--bg-elevated` light** — en `src/theme/palettes.ts` (modeVars.light):
   `rgba(0,0,0,0.02)` → `rgba(0,0,0,0.04)`.
4. **Tinte de acento en fondo** *(único ítem a criterio)* — probar
   `--bg-deep` con `color-mix(in srgb, #0a0e1a 96%, var(--accent))` en modo
   oscuro; si ensucia los contrastes auditados (ver tabla en palettes.ts),
   descartar y anotarlo aquí como ⏭️.
5. **`is_admin` en DB** — columna `isAdmin integer default 0` en users
   (drizzle push); `require-admin.ts` acepta `adminIds.includes(id) ||
   user.isAdmin` (leer de DB); endpoint admin
   `PATCH /admin/users/:id { isAdmin }` en el router admin existente.
   `ADMIN_USER_IDS` queda como fallback/bootstrap.
6. **Descartado documentado** — cookie httpOnly para refresh: NO se hace
   (decidido en Sesión 1; CSP + rotación cubren el riesgo a esta escala).

**DoD:** dos curls concurrentes a `/sync` ⇒ uno 200 y otro 429 · burst de
>300 req/min a la API ⇒ 429 con Retry-After · modo claro se ve con las cards
distinguibles · toggle de admin funciona sin redeploy.

---

## Registro de sesiones

| Fecha | Sesión | Rama/commit | Resultado |
|-------|--------|-------------|-----------|
| 2026-07-02 | Sesión 1 — Refresh tokens + headers | `feat/sesion-1-refresh-tokens` (3559c18), mergeada a main y deployada | ✅ DoD cumplido. Verificado en prod: rotación, reuso revoca familia, logout single/all, fallback legacy, headers CSP/helmet. Nota: justo tras el deploy se vieron dos 500 puntuales en `/auth/refresh` cuando se llamaba a milisegundos de `/auth/register` — antes de esta sesión `/auth/refresh` no tocaba la DB, así que fue el primer request de ese path contra Turso en el container recién levantado (cold warm-up de la conexión). No reprodujo más en los minutos siguientes (3/3 ok) ni en local contra la misma DB; el `/sync` cron cada 3 min mantiene el instance caliente en operación normal, así que no debería repetirse. No se tocó código. |
| 2026-07-02 | Sesión 2 — Celebración + leaderboard animado | `feat/sesion-2-celebracion-leaderboard` (8d948bd), mergeada a main y deployada | 🔄 Deploy en prod confirmado (Vercel status `success`). No se pudo hacer la simulación local del DoD en este entorno (sandbox del browser bloquea `localhost`) — verificado por código: `tsc`/`vitest`/`build` verdes + trace manual de la lógica de transición contra un partido finalizado real. Falta validar a mano en prod: confetti dispara una sola vez en exacto (no repite al recargar), glow en acierto, reduce-motion sin animaciones, reorder animado del leaderboard/standings entre polls. |
