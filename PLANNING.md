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
| **D1** | Refresh tokens ¿stateless o en DB? | A: JWT de 30 días (sin revocar) · B: tabla `refresh_tokens` (logout real) |
| **D2** | Fixture 2026 ¿disponible en OpenFootball? | Verificar `github.com/openfootball/world-cup.json`. Si no, construir seed manual |
| **D3** | WebSocket vs SSE para updates live | WS (Blueprint) · SSE más simple para picos de usuarios |
| **D4** | Worker: ¿mismo Fly.io app (2 procesos) o 2 apps separadas? | Mismo app más simple para beta |
| **D5** | Jugadores para beta del 4 de mayo | Estimados con nombres reales · Sin fantasy en beta |
| **D6** | Google OAuth: ¿client-side o server-side? | Client-side (estándar para PWA) — confirmar |

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
- [ ] **D1:** ¿Refresh tokens stateless (JWT 30 días) o en DB (logout real)?
- [ ] **D2:** ¿El fixture completo del Mundial 2026 está disponible en OpenFootball? Si no, ¿qué fuente usamos para el seed?
- [ ] **D3:** ¿WebSocket (como dice el Blueprint) o SSE para updates live?
- [ ] **D4:** Worker y API en el mismo Fly.io app (2 procesos) o 2 apps separadas?
- [ ] **D5:** Para la beta del 4 de mayo, ¿jugadores estimados o arrancamos sin el módulo Fantasy?
- [ ] **D6:** Google OAuth client-side (PWA estándar) — ¿confirmado?
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
