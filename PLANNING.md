# Mundialito — Planning & Roadmap

> Generado automáticamente el 18/05/2026 a partir de 4 agentes paralelos de análisis.
> Este archivo resume bugs encontrados, gaps de frontend, fundación de backend y roadmap de features.

---

## 1. BUGS CRÍTICOS (prioridad alta antes de beta)

### B-01 · Botón "Unirse" sin handler en Explorar
**Archivo:** `src/pages/leagues.tsx` — tab "Explorar"
**Problema:** El botón "Unirse" en la lista de ligas públicas no tiene `onClick`. Presionarlo no hace nada.
**Fix:** Conectar al handler `handleJoin(league.id)` que navega a `/leagues/:id` (o ejecuta la lógica de join cuando exista el backend).

### B-02 · Sin auth guard — todas las rutas son accesibles
**Archivo:** `src/app/router.tsx`
**Problema:** No existe ningún guard. Un usuario no autenticado puede acceder a `/home`, `/leagues`, etc. directamente.
**Fix:** Crear componente `<RequireAuth>` que lea `authStore.isAuthenticated`; wrappear las rutas del `AppShell` con él.

### B-03 · Fallback silencioso a ítem `[0]` en rutas de detalle
**Archivos:**
- `src/pages/match-detail.tsx:32` — `MATCHES.find(...) ?? MATCHES[0]`
- `src/pages/league-detail.tsx:50` — `MY_LEAGUES.find(...) ?? MY_LEAGUES[0]`
**Problema:** Un ID inválido muestra el primer elemento en vez de redirigir a 404. Confunde al usuario y puede causar mutaciones en el objeto incorrecto.
**Fix:** Cambiar fallback por `navigate('/matches', { replace: true })` / `navigate('/leagues', { replace: true })` si no se encuentra el ítem.

### B-04 · `isMe` hardcodeado en tabla de standings
**Archivo:** `src/pages/league-detail.tsx`
**Problema:** `isMe={row.userId === 99}` usa un ID fijo. En la app real nunca va a matchear el usuario logueado.
**Fix:** Leer `authStore.user.id` y comparar contra `row.userId`.

### B-05 · Inconsistencias en `group` de los equipos en mock
**Archivo:** `src/shared/data/mock.ts`
**Problema:** Algunos equipos tienen `group: undefined` o tienen asignaciones incorrectas respecto al fixture real del Mundial 2026.
**Fix:** Actualizar el mock con los 8 grupos reales (A–H) confirmados por la FIFA para el Mundial 2026, o suprimir el campo `group` del equipo y derivarlo del partido cuando aplique.

---

## 2. GAPS DE FRONTEND (90+ horas estimadas)

### Tier 1 — Bloqueantes para conectar con el backend real

| Gap | Descripción | Estimado |
|-----|-------------|----------|
| **Auth Zustand store** | `useAuthStore` con `user`, `token`, `isAuthenticated`, `login`, `logout`, `register` | 2h |
| **React-Query + API client** | Instancia de `axios`/`ky`, `QueryClient`, hooks `useMatches`, `useLeague`, `usePredictions` | 4h |
| **Tipos compartidos TS** | `User`, `Match`, `League`, `Prediction`, `Standing` alineados con el schema de DB | 2h |
| **RequireAuth guard** | Componente wrapper + redirect a `/login` con `returnTo` en querystring | 1h |
| **Persistencia de token** | `localStorage` con interceptor de axios para header `Authorization` | 1h |

### Tier 2 — Features de producto incompletas

| Gap | Descripción | Estimado |
|-----|-------------|----------|
| `share-sheet.tsx` | Bottom sheet con copiar código, QR, compartir por WhatsApp | 3h |
| `match-status` en lista | Badge EN VIVO / FINALIZADO en `/matches` | 1h |
| Scroll infinito en partidos | Paginación de fechas en `/matches` | 2h |
| Búsqueda real de ligas | Input con debounce + llamada al API en "Explorar" | 2h |
| Formulario de editar liga | Pantalla `/leagues/:id/edit` para el admin | 3h |
| Invitar miembros | Generar/mostrar código, copiar, compartir | 2h |
| Notificaciones in-app | Toast system (ya hay `Sonner`, conectarlo) | 1h |

### Tier 3 — Pulido y accesibilidad

| Gap | Descripción | Estimado |
|-----|-------------|----------|
| Skeleton loaders | Reemplazar `loading=true` por skeletons en listas | 4h |
| Error boundaries | Por ruta para evitar pantallas blancas | 2h |
| Empty states | Pantallas cuando no hay ligas, no hay partidos, etc. | 3h |
| `aria-*` en score inputs | Los botones +/− en `/matches/:id` necesitan labels | 1h |
| PWA install prompt | Lógica para `beforeinstallprompt` + UI de instalación | 3h |
| Service Worker offline | Cachear datos de última sesión para modo offline | 4h |

**Total estimado frontend:** ~45h de work pendiente + ~47h de nice-to-haves.

---

## 3. BACKEND FOUNDATION (Paso 3 del BLUEPRINT)

### Stack confirmado
- **API:** Node.js + TypeScript + Express
- **ORM:** Drizzle ORM
- **DB:** Turso (libSQL — SQLite distribuido, gratis en tier gratuito)
- **Auth:** JWT + refresh tokens
- **Worker:** proceso separado con node-cron + proveedor de fútbol (API-Football + fallbacks)
- **Hosting:** Fly.io (API + Worker como procesos separados o apps separadas — ver D4)
- **WebSocket:** servidor WS montado sobre el mismo `http.Server` de Express

### Estructura de paquetes

```
packages/
├── domain/          # tipos compartidos + funciones puras de scoring
│   └── src/scoring/ # prode.ts | fantasy-player.ts | tournament.ts
├── api/             # Express + Drizzle + JWT — servidor HTTP + WS
│   └── src/
│       ├── db/schema/   # 24 tablas Drizzle (users, leagues, matches, predictions...)
│       ├── middleware/  # token-parse, auth-guard, validate (Zod), rate-limit
│       ├── routes/      # auth, matches, leagues, predictions, fantasy, chat, push
│       ├── handlers/    # controladores finos (req → service → res)
│       ├── services/    # lógica de negocio, accede a db
│       ├── ws/          # WebSocket server, rooms por liga, publisher
│       └── lib/         # jwt, password, invite-code, logger, errors
└── worker/          # proceso separado — cron + polling de APIs externas
    └── src/
        ├── providers/   # API-Football, football-data.org, OpenFootball, TheSportsDB
        ├── quota/       # tracker + policy de rotación
        ├── jobs/        # 13 jobs: seed, poll-live, finalize-match, calc-points, push...
        └── push/        # web-push con VAPID, plantillas es-AR, rate-limiter 5/día
```

### Sprints de implementación

| Sprint | Contenido | Días est. |
|--------|-----------|-----------|
| **1** | Schema Drizzle (24 tablas) + Turso client + Express base + seed fixtures OpenFootball | 2-3 |
| **2** | Auth completo (register, login, me, refresh, logout, Google OAuth) | 1-2 |
| **3** | Matches + Predictions (core loop del prode, lógica de lock, scoring domain) | 2-3 |
| **4** | Leagues (CRUD, join, invite codes, standings prode, FTS5 para búsqueda) | 2-3 |
| **5** | Worker: poll live + finalize-match + calc-points + recalc-standings + push reminders | 3-4 |
| **6** | Players seed + Fantasy completo (equipo, lineup, transfers, chips, auto-sub) | 3-4 |
| **7** | Chat REST + WebSocket rooms + Push suscripción + notificaciones | 2-3 |
| **8** | Achievements (20 del Blueprint) + stats de usuario + perfil público | 1-2 |

**Total estimado:** ~17-24 días de desarrollo backend.

### Decisiones pendientes — backend (responder antes de iniciar Sprint 1)

| ID | Pregunta | Opciones |
|----|----------|---------|
| **D1** | Refresh tokens ¿stateless o en DB? | ✅ **Stateless** — JWT de 30 días, logout solo del lado del cliente |
| **D2** | Fixture 2026 ¿disponible en OpenFootball? | Verificar `github.com/openfootball/world-cup.json`. Si no, construir seed manual |
| **D3** | WebSocket vs SSE para updates live | ✅ **WebSocket** — bidireccional, soporta chat |
| **D4** | Worker: ¿mismo Fly.io app (2 procesos) o 2 apps separadas? | Mismo app más simple para beta |
| **D5** | Jugadores para beta del 4 de mayo | ✅ **Fantasy entra en beta** — usar jugadores estimados con nombres reales |
| **D6** | Google OAuth: ¿client-side o server-side? | ✅ **Client-side** — estándar para PWA |

### Riesgos técnicos

| Riesgo | Nivel | Mitigación |
|--------|-------|-----------|
| Quota de API-Football (100 req/día) | 🔴 Alto | Guard estricto de "hay partido live"; al menos 2 claves rotando |
| Lock de predicciones (timing crítico) | 🔴 Alto | `prediction_lock_utc` en DB es la fuente de verdad; worker actualiza si hay cambio de horario |
| SQLite escrituras concurrentes | 🟠 Medio | `recalc-standings` en una sola transacción por liga |
| FTS5 y Drizzle (no soportado nativamente) | 🟡 Medio | Tabla virtual con SQL raw en migración + trigger SQLite para sync |
| WebSocket bajo picos de partido | 🟡 Medio | Para beta no es problema; para release evaluar SSE |
| Cold start del worker durante partido live | 🟡 Medio | Catch-up scan al iniciar: buscar partidos con kickoff pasado y status `scheduled` |

---

## 4. ROADMAP DE FEATURES (por tier de impacto)

### TIER 1 — Quick wins (S, pocas horas) — implementar antes del beta

| # | Feature | Descripción |
|---|---------|-------------|
| F-01 | **Predicciones de la liga en el partido** | Post-lock, mostrar qué pronosticó cada miembro de la liga en `/matches/:id` |
| F-02 | **Preview de puntos en tiempo real** | Mientras el usuario mueve los contadores de goles, mostrar dinámicamente cuántos puntos ganaría |
| F-03 | **Countdown + badge "sin pronosticar"** | Hero countdown al primer partido (11 Jun) en home + badge naranja con partidos pendientes |
| F-04 | **Picker de goleadores** | Debajo de los contadores, seleccionar hasta 2 goleadores por equipo (+2 pts c/u) |
| F-12 | **Confetti en acierto exacto** | `canvas-confetti` + vibración con `use-haptic.ts` cuando el pronóstico fue exacto |
| F-13 | **Animación de guardado** | Framer Motion `layoutId` para animar el score desde el input hasta el badge de confirmación |
| F-14 | **Live score pulsante** | Badge EN VIVO con animación CSS + flip de número cuando cambia el marcador |

### TIER 2 — Features sociales (M) — máximo impacto de viralidad

| # | Feature | Descripción |
|---|---------|-------------|
| F-05 | **Deep link `/j/:code`** | Landing de invitación con nombre de liga, quién la creó, preview de tabla, CTA "¡Me sumo!" |
| F-06 | **Share sheet con WhatsApp** | Bottom sheet: copiar código, QR, compartir por WA con texto precompletado + `stakes_meme` |
| F-07 | **Head-to-head en tabla** | Al tocar un jugador en standings, bottom sheet con comparativa directa de predicciones |

### TIER 3 — Gamification y retención (M)

| # | Feature | Descripción |
|---|---------|-------------|
| F-08 | **Racha + heatmap en perfil** | Heat map de los últimos 20 partidos (verde/rojo/gris) + achievement `hot_streak` |
| F-09 | **Recap post-jornada** | Card en home después de una fecha: tus pts vs promedio, mejor acierto, podio de la jornada |
| F-10 | **Predicciones de torneo** | Pantalla para campeón, finalista, goleador, revelación, eliminado sorpresa (+50 pts el campeón) |

### TIER 4 — Fantasy (L)

| # | Feature | Descripción |
|---|---------|-------------|
| F-11 | **Formation pitch visual** | Canvas SVG de cancha con 11 titulares posicionados, toque → stats del jugador |

### Feature no planeada en el BLUEPRINT — alta prioridad

| # | Feature | Descripción |
|---|---------|-------------|
| F-15 | **"Compartir pronóstico como imagen"** | Canvas API genera una tarjeta con logo Mundialito + equipos + tu score pronosticado + tu posición. Shareable a IG Stories / WA. Impacto viral enorme, costo S. |

---

## 5. NOTIFICACIONES PUSH — prioridad de implementación

| Prioridad | Notificación | Motivo |
|-----------|-------------|--------|
| 🔴 Crítica | Deadline -1h sin pronosticar | Sin esto el prode pierde valor — la gente olvida |
| 🔴 Crítica | Resultado + puntos ganados | El loop de feedback más importante (máx 5 min post-pitido) |
| 🟠 Alta | Gol que cambia tu predicción | Mayor tasa de apertura, genera engagement durante el partido |
| 🟡 Media | Te pasaron en la tabla | Regreso competitivo |
| 🟡 Media | Nuevo miembro en tu liga | Expectativa en grupos chicos |

> Regla anti-spam: si el usuario abrió la app 5+ veces ese día, suprimir los reminders de deadline.

---

## 6. PREGUNTAS ABIERTAS PARA LA PRÓXIMA SESIÓN

### Producto / UX
- [ ] ¿Las predicciones son por liga o globales? ¿Puede el mismo usuario tener distintas predicciones para la misma liga?
- [ ] ¿El fantasy (armado de equipo) es parte del MVP o es un módulo separado que se activa después?
- [ ] ¿`stakes_meme` es texto libre del admin o hay opciones predefinidas?
- [ ] ¿Hay un chat grupal por liga o se asume que la gente usa WhatsApp externo?
- [ ] ¿El torneo es el Mundial 2026 fijo, o la arquitectura debe soportar otros torneos (Copa América, Champions)?

### Técnicas / arquitectura
- [x] **D1:** Stateless JWT (access 15min + refresh JWT 30d, no tabla en DB)
- [ ] **D2:** Verificar fixture 2026 en OpenFootball
- [x] **D3:** WebSocket
- [ ] **D4:** Mismo Fly.io app con 2 procesos (definir en sprint de deploy)
- [x] **D5:** Fantasy entra en beta con jugadores estimados
- [x] **D6:** Google OAuth client-side confirmado
- [ ] ¿Las predicciones de goleadores son obligatorias o opcionales al guardar el pronóstico?
- [ ] ¿Hay un sistema de administración para cargar resultados o solo via el worker automático (API-Football)?

### Scope de beta
- [ ] ¿Qué se considera "feature complete" para mostrarle a amigos (beta privada)?
- [ ] ¿Cuántos usuarios simultáneos se espera en la beta?
- [ ] ¿El PWA debe funcionar 100% offline o solo cuando hay conexión?

---

## 7. ORDEN SUGERIDO DE TRABAJO

```
SEMANA 1 (Backend)
  1. Setup Turso + Drizzle + schema
  2. Auth (register, login, JWT)
  3. Endpoints de matches + seed con fixture del Mundial 2026

SEMANA 1 (Frontend, paralelo)
  4. AuthStore Zustand + RequireAuth guard
  5. API client (axios instance + interceptores)
  6. Hooks React-Query básicos (useMatches, useLeague)

SEMANA 2
  7. Endpoints de leagues + predictions
  8. Conectar frontend: reemplazar mock.ts por hooks reales
  9. Fix bugs B-01 al B-05

SEMANA 2-3
  10. Feature F-05 (deep link invitación) — destraba el viral
  11. Feature F-03 (countdown) — retención
  12. Feature F-02 (puntos en tiempo real) — UX del prode

SEMANA 3-4
  13. Standings con cálculo real de puntos
  14. Push notifications: deadline + resultado
  15. PWA install prompt + offline básico

BETA PRIVADA (fin de semana 4)
  16. Deploy en Railway + Turso
  17. Test con 10 amigos antes del Mundial (11 Jun)
```

---

*Todos los files de código del prototipo están en `src/` — Mock data en `src/shared/data/mock.ts`.*
*BLUEPRINT completo: `BLUEPRINT.md` en la raíz del proyecto.*

---

## 8. BUGS RONDA 2 (auditoría del código implementado)

### [Auth store: doble escritura en localStorage — desincronización potencial]
**Archivo:** `src/shared/stores/auth-store.ts:26`
**Problema:** El store llama `localStorage.setItem('mundialito_token', token)` manualmente dentro de `login()`, pero Zustand `persist` ya serializa el estado completo (incluido `token`) bajo la key `'mundialito_auth'`. Resultado: el token queda guardado en **dos keys distintas** de localStorage (`mundialito_token` y dentro de `mundialito_auth`). Si el persist de Zustand se limpia o expira pero la key cruda no, o viceversa, `RequireAuth` y el store pueden quedar desincronizados. Lo mismo pasa en `logout()`: se borra `mundialito_token` pero si el persist de Zustand no se limpia correctamente el store puede rehidratarse con `isAuthenticated: true` al recargar.
**Severidad:** Alta
**Fix sugerido:** Eliminar las llamadas manuales a `localStorage.setItem/removeItem` del store. Dejar que solo el interceptor de axios lea `mundialito_token` y sincronizarlo como efecto secundario dentro del `persist` custom storage, o unificar: que `RequireAuth` lea `useAuthStore` en lugar de acceder a localStorage directamente.

### [RequireAuth lee localStorage crudo en vez del store — no detecta expiración]
**Archivo:** `src/shared/components/require-auth.tsx:4`
**Problema:** `RequireAuth` hace `localStorage.getItem('mundialito_token')` pero no valida si el token expiró. Un access token de 15 minutos puede seguir en localStorage vencido, y `RequireAuth` lo considera válido. El usuario pasa el guard, el primer request al API falla con 401, pero no hay lógica de redirect de vuelta a `/login` en ese caso (no hay interceptor de respuesta en `api-client.ts`).
**Severidad:** Alta
**Fix sugerido:** (1) Agregar un interceptor de respuesta en `api-client.ts` que, ante un 401, limpie el store y haga `window.location.replace('/login')`. (2) O decodificar el token en `RequireAuth` y verificar `exp` antes de permitir el paso. (3) A largo plazo, mover la fuente de verdad de auth a `useAuthStore` y que `RequireAuth` consuma `isAuthenticated` desde el store.

### [api-client.ts no tiene interceptor de respuesta para 401]
**Archivo:** `src/shared/lib/api-client.ts`
**Problema:** El interceptor de request adjunta el token, pero no hay interceptor de response. Si el server devuelve 401 (token expirado o revocado), el error llega al componente sin manejo centralizado. No se llama a `logout()`, no se redirige al usuario, y el token inválido sigue en localStorage.
**Severidad:** Alta
**Fix sugerido:** Agregar `apiClient.interceptors.response.use(undefined, async (error) => { if (error.response?.status === 401) { useAuthStore.getState().logout(); window.location.replace('/login'); } return Promise.reject(error); })`. Si se quiere refresh automático, agregar lógica de retry con el refreshToken antes del redirect.

### [Hydration issue: persist de Zustand puede rehydratar con token expirado]
**Archivo:** `src/shared/stores/auth-store.ts:20`
**Problema:** El `persist` middleware de Zustand restaura `{ user, token, isAuthenticated: true }` desde `localStorage` al inicializar la app, sin verificar si el access token sigue vigente. Con access tokens de 15 min, el primer request va a fallar siempre después de un idle. No hay lógica de `onRehydrateStorage` que valide o limpie el estado.
**Severidad:** Media
**Fix sugerido:** Usar la opción `onRehydrateStorage` del persist para hacer un `GET /auth/me` silencioso al iniciar. Si falla con 401, llamar a `logout()`. Alternativamente, guardar solo el refreshToken en persist y reconstruir el accessToken al iniciar.

### [register.ts: información que diferencia email vs username en error de conflicto]
**Archivo:** `packages/api/src/routes/auth/handlers/register.ts:23-26`
**Problema:** El handler devuelve mensajes distintos según si el email o el username ya existen (`'Email already in use'` vs `'Username already taken'`). Esto permite enumerar si un email está registrado (user enumeration attack). Un atacante puede probar emails en el endpoint de registro y saber cuáles tienen cuenta.
**Severidad:** Media
**Fix sugerido:** Devolver siempre el mismo mensaje genérico: `'Email or username already in use'`, sin especificar cuál. El mensaje de username podría mantenerse porque no es un dato sensible, pero el de email sí lo es.

### [predictions.ts: sin foreign keys declaradas con .references()]
**Archivo:** `packages/api/src/db/schema/predictions.ts:6-8`
**Problema:** `userId`, `matchId` y `leagueId` están declarados como `integer().notNull()` pero sin `.references(() => users.id)`, `.references(() => matches.id)` ni `.references(() => leagues.id)`. SQLite no enforce integridad referencial por default; sin `.references()` en Drizzle tampoco se generan constraints en la migración. Es posible insertar predicciones con IDs inexistentes.
**Severidad:** Alta
**Fix sugerido:** Agregar `.references(() => users.id)`, `.references(() => matches.id)` y `.references(() => leagues.id)` a los tres campos. Habilitar `PRAGMA foreign_keys = ON` en la conexión a Turso/libSQL.

### [predictions.ts: sin unique constraint en (userId, matchId, leagueId)]
**Archivo:** `packages/api/src/db/schema/predictions.ts`
**Problema:** No hay unique constraint sobre la combinación `(userId, matchId, leagueId)`. Un usuario puede guardar múltiples predicciones para el mismo partido en la misma liga. El scoring calculado con `points` quedaría duplicado.
**Severidad:** Alta
**Fix sugerido:** Agregar como tercer argumento de `sqliteTable`: `(t) => ({ unq: uniqueIndex('predictions_user_match_league_idx').on(t.userId, t.matchId, t.leagueId) })`. También asegurarse de que el handler de predicciones use `INSERT OR REPLACE` o un upsert.

### [leagues.ts: sin unique constraint en league_members (leagueId, userId)]
**Archivo:** `packages/api/src/db/schema/leagues.ts:14-19`
**Problema:** La tabla `league_members` no tiene unique constraint en `(leagueId, userId)`. Un usuario puede unirse a la misma liga múltiples veces, generando filas duplicadas que distorsionan el conteo de miembros y la tabla de standings.
**Severidad:** Alta
**Fix sugerido:** Agregar `(t) => ({ unq: uniqueIndex('league_members_league_user_idx').on(t.leagueId, t.userId) })` al definir la tabla.

### [leagues.ts: adminId sin foreign key a users]
**Archivo:** `packages/api/src/db/schema/leagues.ts:9`
**Problema:** `adminId: integer('admin_id').notNull()` no tiene `.references(() => users.id)`. Si el usuario admin es eliminado, la liga queda con un `adminId` huérfano sin que la DB lo detecte.
**Severidad:** Media
**Fix sugerido:** Agregar `.references(() => users.id)` al campo `adminId`.

### [matches.ts: predictionLockUtc debe setearse manualmente — riesgo operativo]
**Archivo:** `packages/api/src/db/schema/matches.ts:11`
**Problema:** El campo `predictionLockUtc` (kickoff − 5 min) es un texto que se debe setear manualmente al insertar o actualizar el partido. No hay ningún `DEFAULT` ni computed column que lo derive automáticamente de `kickoffUtc`. Si el horario de un partido cambia y el worker actualiza `kickoffUtc` pero olvida recalcular `predictionLockUtc`, el lock queda desincronizado y los usuarios pueden pronosticar después del inicio real del partido.
**Severidad:** Alta
**Fix sugerido:** En el job del worker que actualiza kickoffs, siempre recalcular `predictionLockUtc = new Date(kickoffUtc).getTime() - 5 * 60 * 1000` y persistirlo junto con `kickoffUtc`. Considerar agregar un trigger SQLite que recalcule el lock automáticamente en UPDATE de `kickoff_utc`.

### [matches.ts: valores de round no incluyen 'r32' para fase de grupos de 32]
**Archivo:** `packages/api/src/db/schema/matches.ts:15`
**Problema:** El comment indica `'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'`. El Mundial 2026 tiene 48 equipos y una nueva fase: la Ronda de 32 (antes de octavos). El valor `'r32'` está en el schema, lo cual es correcto. Sin embargo el comment omite que con 12 grupos de 4 equipos, los mejores 3 de cada grupo más 4 wildcards avanzan. Confirmar que el seed de fixtures usará `'r32'` correctamente para esa ronda intermedia y no `'r16'` por error (el Mundial 2026 no tiene fase de 16 directamente desde grupos).
**Severidad:** Media
**Fix sugerido:** Verificar contra el fixture oficial de FIFA que los valores de `round` matcheen exactamente con los que va a devolver la API de resultados (API-Football). Documentar el mapeo en el código del worker.

### [match-detail.tsx: getPointsPreview no refleja el sistema completo de puntos]
**Archivo:** `src/pages/match-detail.tsx:8-15`
**Problema:** `getPointsPreview` muestra solo dos filas: "exacto" (5 pts) y "correcto/empate" (1 o 3 pts). Pero el sistema de puntuación tiene **4 niveles** (exacto=5, ganador+diferencia=3, ganador=1, empate=1). La función colapsa "ganador+diferencia" y "ganador" en un solo `correct: 3`, sin distinguir el caso intermedio. El usuario ve "+3 pts" cuando en realidad podría ganar 3 o 1 dependiendo de si acertó solo el ganador o también la diferencia. Además, el panel "Sistema de puntuación" de abajo lista los 4 niveles correctamente, creando inconsistencia visual en la misma pantalla.
**Severidad:** Media
**Fix sugerido:** Expandir `getPointsPreview` para mostrar las 3 filas relevantes según si es empate o resultado con diferencia: (a) exacto=5, (b) ganador+diferencia=3 (solo si no empate), (c) solo ganador/empate=1. Esto hace al preview consistente con el panel de abajo.

### [matches.tsx: partidos 'finished' sin indicador visual diferenciado]
**Archivo:** `src/pages/matches.tsx:79-87`
**Problema:** El ícono lateral distingue `live` (pulso rojo) y "pronosticado" (`CheckCircle2` verde) y "sin pronosticar" (`Clock` gris), pero un partido `finished` sin predicción previa muestra el ícono `Clock` gris igual que un partido scheduled futuro. El usuario no puede distinguir visualmente si el partido ya terminó (y no pronosticó) o si todavía no arrancó.
**Severidad:** Baja
**Fix sugerido:** Agregar un caso para `match.status === 'finished'`: mostrar un ícono diferente (ej: `XCircle` o `Flag`) en color muted, o un badge "FIN" con el resultado final si está disponible.

### [matches.tsx: partidos live sin prioridad en el orden de la lista]
**Archivo:** `src/pages/matches.tsx:41-43`
**Problema:** Los partidos se agrupan por fecha (`kickoffUtc.slice(0, 10)`) y las fechas se ordenan cronológicamente con `.sort()`. Un partido `live` aparece en su posición cronológica normal dentro del día, no al tope de la lista. Si hay partidos de fechas anteriores (de ayer) todavía en estado `live`, aparecen al final.
**Severidad:** Baja
**Fix sugerido:** Antes de agrupar, separar los partidos `live` en un grupo especial que se muestre siempre al tope, independientemente de la fecha. O reordenar las fechas poniendo primero las que contienen partidos `live`.

### [home.tsx: countdown hardcodeado — no considera kickoff real del primer partido]
**Archivo:** `src/pages/home.tsx:26`
**Problema:** La fecha `'2026-06-11T19:00:00Z'` está hardcodeada en el componente. Si FIFA cambia el horario del partido inaugural (algo que históricamente ocurre), el countdown mostrará la fecha incorrecta. Tampoco está extraída como constante exportable, lo que dificulta actualizarla desde un solo lugar.
**Severidad:** Baja
**Fix sugerido:** Extraer la fecha como constante a `src/shared/constants.ts` (o derivarla del primer partido de la API cuando esté disponible) y referenciarla desde `CountdownHero`.

### [home.tsx: formatTime hardcodea timezone 'America/Argentina/Buenos_Aires']
**Archivo:** `src/pages/home.tsx:60` y `src/pages/match-detail.tsx:45` y `src/pages/matches.tsx:14`
**Problema:** `formatTime` usa `timeZone: 'America/Argentina/Buenos_Aires'` hardcodeado en tres archivos distintos. Un usuario en México, España o cualquier otro país verá los horarios convertidos a hora argentina, no a su hora local. Esto genera confusión para cualquier usuario fuera de Argentina.
**Severidad:** Media
**Fix sugerido:** Eliminar el `timeZone` fijo para que el browser use la timezone del dispositivo del usuario (comportamiento por defecto de `toLocaleTimeString`). Si se quiere mostrar la timezone, agregar `timeZoneName: 'short'`. Centralizar la función `formatTime` en `src/shared/lib/format.ts` para no repetirla en 3 archivos.

### [refresh.ts: refresh token rotation sin invalidación de token anterior]
**Archivo:** `packages/api/src/routes/auth/handlers/refresh.ts`
**Problema:** El handler verifica el refresh token y emite un nuevo par (access + refresh). Dado que los refresh tokens son stateless (decisión D1), el token anterior sigue siendo técnicamente válido hasta que expire en 30 días. Si un refresh token es robado, el atacante y el usuario legítimo pueden tener tokens válidos simultáneamente durante hasta 30 días sin que el sistema lo detecte.
**Severidad:** Media
**Fix sugerido:** Esto es una consecuencia conocida de la decisión D1 (stateless). Mitigación mínima: reducir la vida del refresh token a 7 días. Mitigación completa: persistir refresh tokens en DB con una tabla `refresh_tokens` y invalidar el anterior al emitir uno nuevo (token rotation con detección de reuso).

---

## 9. PREGUNTAS TÉCNICAS RONDA 2

- [ ] ¿`RequireAuth` debería leer `useAuthStore().isAuthenticated` en lugar de `localStorage` directamente? Si el store es la fuente de verdad, el guard debería consumirlo para evitar divergencias.
- [ ] ¿El persist de Zustand debe almacenar solo el `refreshToken` (en lugar del access token + user completo) para reducir el riesgo de hydration con estado stale?
- [ ] ¿Hay planes de agregar un interceptor de respuesta en `api-client.ts` con refresh automático (silent refresh) antes de redirigir a `/login`?
- [ ] El `round: 'r32'` del Mundial 2026 — ¿el proveedor de datos (API-Football) devuelve exactamente ese string, o hay que mapear desde otro valor? Confirmar antes del seed.
- [ ] ¿`predictionLockUtc` se va a calcular en el worker o en el handler de creación de partidos? ¿Hay un trigger de DB o es responsabilidad de la aplicación?
- [ ] ¿Las predicciones son globales o por liga? El schema actual tiene `leagueId` como `notNull` en `predictions`, lo que implica que un usuario necesita pertenecer a una liga para pronosticar. Si el prode es "global" (sin liga), el modelo actual no lo soporta sin crear una "liga default".
- [ ] ¿El `adminId` de leagues debería tener lógica de transferencia de admin si el admin abandona la liga? No hay campo ni tabla para trackear eso actualmente.
