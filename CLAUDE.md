# Mundialito — Contexto del proyecto para agentes

> **Leé esto antes de tocar código.** Unifica README, PLANNING, PLAN-FANTASY,
> PLAN-LANZAMIENTO, INTEGRATION, vercel.md y fly.deploy.md más todo lo aprendido
> en las sesiones de hardening pre-Mundial (junio 2026). Los MD viejos siguen en
> el repo como referencia histórica, pero **este archivo es la fuente de verdad**.
>
> 📓 **Append-only:** cada vez que cambies un comportamiento por una razón
> (arreglar un bug, cambiar una fuente, ajustar una regla), agregá una entrada a
> la **Bitácora** (final del archivo) con *qué cambió y por qué*. Si descubrís un
> error que ya cometimos, agregalo a **Gotchas**. El objetivo es que la próxima
> sesión arranque sabiendo qué está bien, qué está mal y por qué se hizo cada cosa.

## 🛑 Protocolo OBLIGATORIO para cada sesión y cada agente

Esto **no es opcional** y aplica a la sesión principal Y a cualquier sub-agente
que se lance sobre este proyecto.

**Al EMPEZAR (antes de tocar nada):**

1. **Leé este archivo COMPLETO** — es la fuente de verdad: arquitectura, reglas
   de negocio, gotchas y bitácora. Ya rompimos cosas en producción por ignorar
   un gotcha que estaba documentado acá. No empieces a trabajar sin haberlo leído.
2. Si vas a delegar en sub-agentes, **pasales explícitamente la orden de leer
   este archivo** (ruta absoluta) antes de que empiecen. Un agente que arranca
   "en frío" sin este contexto es peligroso sobre una app en vivo.

**Al TERMINAR (antes de cerrar la tarea):**

3. **Dejá contexto de lo que investigaste y trabajaste.** Agregá una entrada a la
   **Bitácora** (final del archivo) documentando, sí o sí:
   - **✅ Lo bueno**: qué quedó funcionando, verificado o blindado.
   - **⚠️ Lo malo**: bugs encontrados, fragilidades, deuda técnica y pendientes
     — **aunque no los hayas arreglado**. Dejá registro para la próxima sesión.
   - **Qué cambió y por qué.**
4. Si descubrís un error que ya cometimos (o uno nuevo fácil de repetir),
   sumalo a **Gotchas**.

Documentar el contexto (lo bueno y lo malo) es parte de la tarea, no un extra.
Si trabajaste y no dejaste rastro en la Bitácora, la tarea no está terminada.

## Qué es

PWA mobile-first de prode + fantasy del Mundial 2026 entre amigos. Gratis, sin
ads, sin monetización. ~40 usuarios reales. El torneo va del **11 de junio**
(México vs Sudáfrica, Estadio Azteca, 19:00 UTC) al **19 de julio de 2026**.

- **Frontend**: React 18 + Vite + TypeScript, Tailwind (tokens via CSS vars),
  TanStack Query, Zustand (auth + theme), framer-motion. Deploy: **Vercel**
  (`mundialito-pi.vercel.app`). PWA via vite-plugin-pwa (autoUpdate,
  index.html NUNCA precacheado — ver Gotchas).
- **Backend**: Express + Drizzle ORM + **Turso/libSQL** (SQLite remoto).
  Deploy: **Render free tier** (`mundialito-d2jk.onrender.com`). Monorepo:
  `packages/api` (server) y `packages/worker` (cron jobs).
- **Worker**: solo corre `send-deadline-reminders` cada 5 min. El job
  `poll-live` está **deshabilitado a propósito** (tenía bugs de scoring y de
  match-matching; el API auto-sync es el único path autorizado para scoring).

## Mapa de carpetas (lo que importa)

```
src/                          # Frontend
  app/router.tsx              # Rutas. Páginas lazy con lazyWithReload (ver Gotchas)
  pages/                      # home, matches, match-detail, fantasy, leagues,
                              # tournament-predictions, achievements, profile,
                              # user-profile, leaderboard, admin, settings
  shared/hooks/               # use-matches, use-predictions, use-fantasy*,
                              # use-leagues, use-achievements, use-leaderboard
  shared/stores/auth-store.ts # Zustand persist + sync entre tabs (storage event)
  shared/lib/levels.ts        # Espejo manual de packages/api/src/lib/levels.ts
  theme/                      # palettes.ts + theme-provider (CSS vars en :root)
packages/api/src/
  routes/                     # auth, users, leagues, predictions,
                              # tournament-predictions, fantasy, matches,
                              # achievements, push, admin
  services/
    auto-sync.ts              # Timer in-process: SOLO scores (football-data→ESPN).
                              # NO hace FIFA timeline ni finalize. Cada 3min hoy + 30min ayer.
    sync-scores.ts            # Primario: football-data.org (FOOTBALL_DATA_API_KEY)
    sync-espn.ts              # Fallback (sin key; dates en ET, no UTC). Score POR
                              # IDENTIDAD de equipo, no por posición home/away (ver Gotchas)
    sync-fifa-stats.ts        # Player stats + timeline en vivo desde api.fifa.com.
                              # Detecta Type 26 "final whistle" → finalWhistle
    finalize-match.ts         # Cierra un partido en vivo apenas FIFA da el pitazo
                              # (Type 26), sin esperar ~10min a football-data/ESPN
    fantasy-scoring-service.ts# recomputeAllFantasyPoints (serializado, coalesce)
    achievement-service.ts    # checkAchievements + evaluadores + recompute
    diagnose-fifa-flow.ts     # Self-test del parser FIFA contra WC2022
  lib/
    scoring.ts                # calculatePoints (null-safe)
    match-helpers.ts          # calcPredictionLock (kickoff-5min) / isLocked (fail-safe locked)
    levels.ts                 # XP→nivel (0/5/15/30/50/75/105/140/180/225/280/340/410/490)
    user-xp.ts                # XP SIEMPRE computado en vivo (sum de pointsBonus)
    fantasy-rounds.ts         # Rounds + deadlines. 'final' = ['third','final'] (NO 'sf')
    invite-code.ts            # crypto.randomInt, 8 chars
    personal-league.ts        # ensurePersonalLeague (transaccional)
    notify-admin.ts           # Push a ADMIN_USER_IDS ante fallas del sync
  scripts/                    # Ver "Scripts" abajo
  db/schema/                  # Drizzle. Migraciones = scripts ALTER idempotentes
```

## Reglas de negocio (memorizar)

### Scoring de predicciones (`lib/scoring.ts`)
| Acierto | Puntos |
|---|---|
| Resultado exacto | 5 |
| Empate acertado (no exacto) | 3 |
| Ganador + diferencia exacta | 3 |
| Solo ganador | 1 |

- **Lock: 5 minutos antes del kickoff** (`predictionLockUtc = kickoffUtc - 5min`).
  ⚠️ El README dice "1h antes" — está desactualizado, el código manda.
- Predicciones son **por liga**: tabla `predictions` UNIQUE(user, match, league).
  Guardar sin `leagueId` propaga a todas las ligas del user (primera vez).
- **Penales**: los syncs suman +1 al ganador del shootout para que el score
  refleje al ganador real (sino todo KO por penales sería "empate").
- Tournament predictions (campeón/goleador/etc.) se lockean con el primer
  partido. El frontend tiene `OPENING_LOCK_UTC = 2026-06-11T18:55:00Z` hardcoded
  + el server valida contra el `predictionLockUtc` del primer match.

### Fantasy
- Squad: exactamente **15** (2 GK / 5 DEF / 5 MID / 3 FWD) — enforced server-side.
  Squad se lockea al kickoff del torneo. Lineup es **por fecha** (fantasy_lineups):
  11 titulares + 1 capitán (×2) + 1 vice (×1.5), capitán ≠ vice.
- Scoring por jugador (`lib/fantasy-scoring.ts`): +2 jugar, gol GK/DEF 6 /
  MID 5 / FWD 4, asistencia +3, clean sheet GK/DEF 4 / MID 1, amarilla −1, roja −3.
- `recomputeAllFantasyPoints` es idempotente, serializado (mutex + coalesce) y
  se dispara desde: sync de scores, admin update-match, admin player-stats,
  sync FIFA stats.

### Logros / XP / Nivel
- Los logros **NO suman puntos al leaderboard** — dan XP. XP se computa **en
  vivo** (`lib/user-xp.ts` = SUM(points_bonus) de logros del user). La columna
  `users.xp` existe pero NO es source of truth (legacy, no usar).
- Niveles: Bronce(1-3) Plata(4-6) Oro(7-9) Platino(10-12) Diamante(13-14).
  `lib/levels.ts` (API) y `src/shared/lib/levels.ts` (front) son **espejos
  manuales** — si cambiás uno, cambiá el otro.
- Título elegible: `users.selected_title_slug` (PATCH /users/me valida ownership).
- Catálogo: `scripts/sync-achievements-catalog.ts` = fuente de verdad (32 logros
  + presidente_fifa exclusivo del admin). `night_owl` y `share_master` fueron
  **removidos** — no los reintroduzcas sin re-agregarlos al catálogo (FK).

## Flujo de datos durante el torneo (TODO AUTOMÁTICO)

⚠️ **Hay DOS disparadores de sync** (redundantes a propósito):
- `auto-sync.ts`: timer DENTRO del proceso API. **Solo scores** (football-data→ESPN).
- **`POST /sync` en `app.ts`**: lo pega **cron-job.org cada 3 min**. Hace scores
  (yesterday+today) + **FIFA timeline en vivo + finalize + reconcile + squads**.
  Toda la lógica FIFA (cronología en vivo, cierre por pitazo) vive acá, NO en el timer.

1. El tick de `/sync` consulta football-data.org (yesterday+today); si falla o no
   hay key, cae a ESPN (ambas fechas). Actualiza status/score del match.
   - **Score por identidad** (sync-espn): el gol se asigna al equipo por su
     código, NO por el flag home/away de ESPN (ver Gotchas #13).
   - **Guard finished→live**: una fuente que todavía dice "live" NO des-finaliza
     un partido ya cerrado (evita flip-flop cuando FIFA cerró antes).
2. Al pasar un match a `finished` (solo en la **transición**):
   - Calcula points de todas las predictions → `checkAchievements('prediction_scored')`
   - Dispara `syncFifaStatsForMatch(matchId)` (fire-and-forget)
2b. **Cierre rápido por FIFA**: tras el sync de stats de los partidos en vivo, si
   la timeline trae el evento **Type 26 "The final whistle sounds."**,
   `finalizeMatchFromFinalWhistle` marca el match `finished/full_time` usando el
   score que las fuentes ya mantuvieron en vivo y puntúa predictions + fantasy —
   **sin esperar los ~10-15 min que tardan football-data/ESPN en marcar FINISHED**
   (ver Bitácora 2026-06-19 "Lag de cierre").
3. `sync-fifa-stats` baja `api.fifa.com/api/v3/timelines/17/285023/{stage}/{match}`
   (público, sin auth). Tipos de evento: **0/39/41=gol, 1=asistencia ("Assisted
   by X." sin país → se resuelve por IdTeam), 2=amarilla, 3=roja (inferido),
   5=sustitución** (in + out cuentan played). Matching de jugadores: fuzzy por
   apellido contra el roster del team, **rechaza ambiguos** (hermanos Williams),
   cachea `players.fifa_id_player` para O(1) futuro.
4. Upserta `player_match_stats` → `recomputeAllFantasyPoints()`.
5. Si >5 eventos sin resolver o 0 stats con >50 eventos → **push al admin**
   (`lib/notify-admin.ts`, usa ADMIN_USER_IDS).

⚠️ API-Football (API_FOOTBALL_KEY) **NO sirve**: su free tier bloquea WC 2026.
El código de `sync-player-stats.ts` (API-Football) quedó pero no se usa.
football-data.org free tampoco da detalle por jugador (403). FIFA.com es la
única fuente gratis verificada.

## Scripts clave (`packages/api`, correr con `npx tsx src/scripts/...`)

| Script | Cuándo |
|---|---|
| `test:fifa-e2e` | Readiness check completo (backfill + endpoint + parser). Correr el 11/6 a la mañana. |
| `diagnose:fifa` | Solo parser vs WC2022 (~700ms). Exit≠0 si falla. |
| `backfill:fifa` | Mapea matches→FIFA IdMatch. **Re-correr tras cada fase** (KOs nuevos). |
| `verify:squads` / `fix:squads` | Diff/fix de planteles contra Wikipedia. |
| `sync:photos` | Fotos de jugadores desde Wikipedia (verifica nacionalidad + apellido). |
| `notify:opening` | Push "el Mundial empieza mañana". **Correr 10/6 16:00 AR manualmente.** |
| `recompute:achievements` | Backfill de logros para un user o todos. |
| `sync:achievements` | Sincroniza catálogo de logros con la DB. |
| `add-fifa-ids` / `migrate-achievements-to-xp` | Migraciones ya aplicadas (idempotentes). |

## Env vars (Render)

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` (**requeridos en prod — el server se niega a arrancar sin
ellos**), `FOOTBALL_DATA_API_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_USER_IDS` (=1),
`ALLOWED_ORIGINS`, `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, `NODE_ENV=production`.
FIFA.com no necesita key.

## Gotchas (errores que ya cometimos — no repetir)

1. **SQLite/libSQL**: `at` es palabra reservada — no usarla como alias SQL.
   `NULL + N = NULL` — usar COALESCE en updates aritméticos.
2. **PWA**: index.html JAMÁS va al precache del SW (`globIgnores`), Vercel lo
   sirve con no-store. Los chunks `/assets/*` son immutable. `lazyWithReload`
   recarga la página ante "Failed to fetch dynamically imported module"
   (deploy nuevo + HTML viejo). No tocar esa configuración sin entenderla.
3. **ESPN scoreboard** interpreta `?dates=` en **Eastern Time**, no UTC —
   siempre pedir día UTC + día anterior y dedupe por event id.
4. **FIFA kickoffs** difieren de nuestro seed hasta 7h — matchear por códigos
   de equipo + mismo día, nunca por hora exacta. FIFA usa `RSA` para Sudáfrica
   (nosotros `ZAF`) — map en `FIFA_CODE_TO_OURS`.
5. **Partidos simultáneos**: los 2 últimos de cada grupo van a la misma hora
   (regla FIFA anti-arreglo). Cualquier matcher por kickoff DEBE desambiguar
   por equipos y rechazar si quedan ≥2 candidatos.
6. **Hermanos** (I. Williams/N. Williams, Theo/Lucas Hernández): el fuzzy de
   apellido debe rechazar matches ambiguos, nunca `.find()` el primero.
7. **football-data quota**: 10 req/min free. El auto-sync hace 1 req/3min, OK.
   No agregar llamadas sin pensar en la cuota.
8. **Email/username**: normalizar lowercase+trim en server Y client (SQLite
   `eq` es case-sensitive).
9. **Auth multi-tab**: el auth-store escucha `storage` events — logout en una
   tab desloguea todas.
10. **Espejos manuales** que hay que mantener sincronizados:
    `lib/levels.ts` ↔ `src/shared/lib/levels.ts`;
    `lib/scoring.ts` ↔ scoring inline en `packages/worker/jobs/finalize-match.ts`
    (worker deshabilitado, pero por si se reactiva).
11. **Drizzle**: usar transacciones para flujos check-then-insert (personal
    league, join league, create league, tournament predictions multi-liga).
12. **Rate limit auth**: middleware propio en `middleware/rate-limit.ts`
    (in-memory, single instance). 10 req/5min en login/register/refresh.
13. **Score por identidad, no por posición** (`sync-espn.ts`): ESPN y nuestra DB
    a veces difieren en quién es "local". Asignar el score por el flag home/away
    de ESPN atribuía los goles al equipo equivocado ("resultado al revés").
    `resolveCompetitors` resuelve cuál competidor de ESPN es NUESTRO local/visitante
    por código de equipo. **No volver a copiar ESPN-home→nuestro-home a ciegas.**
14. **🚨 NO swapear home/away de un match con pronósticos** sin swapear los
    pronósticos en la MISMA operación atómica. Los `predictions.home_score/away_score`
    se guardan POR POSICIÓN, atados a la orientación del match al momento de predecir.
    Invertir solo el match deja todos sus pronósticos con el significado al revés
    (incidente jun-2026: usuarios perdieron puntos, "predije Bosnia y figura Suiza").
    Si hay que alinear orientación a FIFA: swap match + predictions juntos. Para
    partidos jugados los puntos son **invariantes** ante swap consistente de ambos
    lados (no hace falta re-puntuar). Verificar alineación sin testimonio:
    `AVG(home_score-away_score)` debe apuntar al favorito (confiable solo con
    favorito claro). El fix de "score por identidad" (#13) hace que el display
    invertido sea inofensivo PARA LOS SCORES, pero NO para los pronósticos.
15. **Una fuente puede estar simplemente MAL** (no solo desincronizada).
    football-data.org publicó ESP-KSA 5-0 cuando terminó 4-0 (ESPN y FIFA = 4 goles).
    Como `/sync` prioriza football-data, revertía la corrección cada tick. Para esos
    casos: **`matches.score_locked = 1`** (lo setea el admin al editar el score; los
    syncs respetan el flag y dejan de pisar score + de re-puntuar). Para diagnosticar
    un score sospechoso: comparar `match_events` (goles FIFA) vs el score del feed —
    si difieren, FIFA/ESPN suelen tener razón. Ver Bitácora 2026-06-21.

## Pendientes conocidos (no bugs, decisiones)

- WebSocket sin auth (broadcasts de scores públicos — riesgo bajo, mejorar post-Mundial).
- `useLeagueSocket` existe pero no se usa; el realtime es polling (matches 60s,
  match-detail live 45s, home countdown invalida al llegar a 0).
- Refresh token sin rotación server-side (vive 30 días).
- Leaderboard `meta.total` devuelve page size, no total real.
- Después de cada fase del torneo: correr `backfill:fifa` para mapear los KO
  nuevos (4 veces en total).
- Eventos FIFA Type 3 (roja) inferido, no verificado — chequear logs en el
  primer partido con expulsión.

## Cómo verificar cambios

- API: `cd packages/api && npx tsc --noEmit`
- Front: `npx tsc --noEmit` (raíz)
- Pipeline FIFA: `npm run diagnose:fifa` (sin DB) o `npm run test:fifa-e2e` (con DB)
- Smoke prod: `curl https://mundialito-d2jk.onrender.com/health`
- Commits SIN "Co-Authored-By Claude". La carpeta `.claude/` nunca se commitea.
- DB de prod (Turso) para diagnósticos: scripts `.mjs` sueltos en `packages/api`
  con `@libsql/client` apuntando a `TURSO_DATABASE_URL`. **Son temporales —
  borralos al terminar** (no commitear). Para correrlos: `node script.mjs`.

---

## Bitácora de decisiones y aprendizajes (append-only)

> Orden cronológico inverso (lo nuevo arriba). Cada entrada: **qué cambió y por qué**.
> Agregá una entrada cada vez que cambies un comportamiento por una razón.

### 2026-07-16 (4) — Colapsar Oloráculo y outcome (feedback: "vista muy cargada")

Segundo pase de feedback sobre `/tournament-predictions`: liga + Oloráculo +
resultados de Copa + 7 pick cards apilados se sentía denso incluso con el
restyle anterior. Solo presentacional. `tsc`=0, 50 tests, build OK.

- **`ForecastTopCandidates`** (antes siempre expandido con la tabla de 8
  filas visible): ahora colapsado por defecto. El header muestra un teaser de
  una línea ("Favorito: {equipo} ({%})") en vez de la tabla completa; tocar
  el header la despliega. El toggle interno "Ver top 20" sigue igual, adentro.
- **`TournamentOutcomeCard`**: mismo tratamiento. Colapsado por defecto con
  teaser dinámico en el header (`Campeón: X` si resolved, o
  `N cenicientos · M decepciones definidos` en provisional). Todo el resto
  (podio, tabla de valla, candidatas) quedó igual, solo detrás del toggle.
- Los 7 pick cards (`openSection`, un solo acordeón abierto a la vez) ya
  estaban colapsados por defecto — no se tocaron, son la tarea principal de
  la página.
- Patrón reusado: mismo `slideUpVariants` + `AnimatePresence` + chevron que
  ya usan `LeagueHistorySection`/`LeagueCopaPicksSection` — consistencia
  entre todas las secciones colapsables de la app.

### 2026-07-16 (3) — Restyle de picks de Copa y outcome (feedback: "no es amigable")

El dueño vio la entrega anterior (texto plano, ✓/✗ crudos, chips de una sola
línea) y pidió mejorar el estilo. Solo presentacional — cero cambios de lógica
ni de datos, mismos hooks/endpoints. `tsc` front = 0, 50 tests, build OK.

- **`TournamentOutcomeCard`** (`tournament-predictions.tsx`): podio como grid
  2×2 de tiles con ícono en círculo de color por categoría (🏆 Trophy ámbar,
  Medal finalista, Award tercero, Goal goleador), badge "Provisional"/
  "Definitivo" en el header. Tabla de valla pasó de grid de texto a filas tipo
  ranking con rank number + bandera + pill de promedio (líder resaltado en
  verde). Candidatas de sorpresa/decepción: `CheckCircle2`/`XCircle` de lucide
  en vez de glifos ✓/✗ de texto, tarjeta con borde para las que califican.
- **`LeagueCopaPicksSection`** (`league-detail.tsx`): los emoji crudos (🏆🥈🥉…)
  como texto pasaron a `COPA_CATEGORIES` — config de ícono lucide + color por
  categoría, reusada tanto para los chips como si se necesita en otro lado.
  Cada miembro es ahora una card (antes fila con borde-top), tu propia fila
  ordenada primero y con fondo distinguible, avatar con inicial de fallback en
  vez de círculo vacío, badge "Puntuado" cuando hay points.
- Sin cambios de datos/lógica — mismo `useTournamentOutcome`/
  `useLeagueTournamentPicks`, mismos campos del resolver.

### 2026-07-16 (2) — Picks de Copa visibles por liga + outcome provisional + fix valla con penales

Pedido del dueño: transparencia de las predicciones de Copa antes de la final.
Decisión de diseño: los picks se muestran **en la liga** (no en el perfil)
porque `tournament_predictions` es por (user, league) — un user puede elegir
distinto en cada liga. Verificado: `tsc` API+front = 0, 130+50 tests, build OK.

- **Nuevo `GET /leagues/:id/tournament-predictions`** (`handlers/tournament-picks.ts`):
  picks de todos los miembros + `topScorerName` resuelto server-side + `points`.
  Anti-copia: antes del lock solo devuelve la fila propia (`meta.locked`). El
  lock se extrajo a `lib/tournament-lock.ts` (compartido con el upsert — antes
  estaba inline). Front: sección colapsable "Picks de Copa" en `league-detail`
  (tab Tabla), chips 🏆🥈🥉⚽✨📉🧤 con bandera, puntos cuando se liberan.
- **`/tournament-predictions/outcome` ahora devuelve un bloque `provisional`**
  cuando la final no terminó: sorpresas/decepciones al día (excluyendo equipos
  con partidos pendientes — sin el filtro, Argentina figuraba "candidata a
  decepción ✗" con la final por jugarse), **tabla de valla (PJ/GC/promedio)** y
  goleador parcial. El resolver ganó `resolveProvisionalOutcome()` +
  `computeInsights()` (núcleo compartido, champion nullable). La card del front
  muestra "Así viene la Copa · PROVISIONAL" y pasa sola al modo resuelto.
- **🐛 Fix valla menos vencida**: el resolver computaba goles en contra con el
  score BUMPEADO (+1 de penales) — perder una tanda le sumaba al perdedor un
  gol fantasma en contra. Con ESP 1 GC / COL 0.200 de promedio, una final
  perdida por penales 0-0 le costaba la valla a España incorrectamente. Ahora
  la valla usa goles DE JUEGO (resta el bump); depth/batacazos siguen con el
  score guardado (intencional, documentado inline).
- **Estado provisional verificado contra prod** (2026-07-16): valla ESP 0.143
  (1 GC en 7 PJ) > COL 0.200 — si ESP recibe 1 gol en la final la pierde;
  cenicientos ✓ PAR/NOR/SWE/ALG/COD/CPV/MAR; decepciones ✓ BRA/NED/URU/GER;
  goleador parcial Messi y Mbappé (8).
- ⚠️ Nota: el token de `.env.ro` no puede ejecutar el `PRAGMA foreign_keys`
  que `db/client.ts` antepone a todo — scripts que importen el db del API
  necesitan el `.env` RW; el `.env.ro` sirve solo para `@libsql/client` crudo.

### 2026-07-16 — Auditoría de cierre de torneo: backfill final/3er puesto + gaps del resolver de Copa y fantasy_legend

Revisión pedida por el dueño: "que al terminar el Mundial todo se actualice
solo". Se auditó el camino completo final→resolver→wrapped y se verificó prod
(read-only via `.env.ro`).

**✅ Lo bueno (hecho y verificado — `tsc` API = 0, 130 tests verdes, /health OK):**
- **Backfill de equipos aplicado en prod** (`backfill-knockout-teams.ts --apply`):
  la final (#104) y el 3er puesto (#103) estaban **TBD vs TBD** con las semis ya
  jugadas — sin equipos, `findMatch` (por identidad) no matcheaba y la final NO
  se habría sincronizado sola. Ahora: #103 FRA-ENG, #104 ESP-ARG (verificado
  contra FIFA live + resultado de semis). `fifa_id_match/stage` ya estaban
  mapeados para TODOS los KO (backfill:fifa al día — no hace falta re-correrlo).
- **Fix `finalize-match.ts`**: el camino primario (cierre por pitazo FIFA) NUNCA
  otorgaba `fantasy_legend` — solo vivía en sync-scores, que tras el cierre por
  FIFA no ve transición (statusChanged/scoreChanged=false → continue). Ahora el
  bloque `round === 'final'` también llama `finalizeFantasyLegends()`.
- **Fix `sync-espn.ts`**: el camino ESPN no llamaba NI al resolver de Copa NI a
  fantasy_legend. Peor: el bump de penales por ESPN setea `scoreLocked=1`, que
  suprime para siempre el trigger equivalente de sync-scores (scoreChanged
  nunca más). Ahora, con `anyMatchFinished` y la final finished, dispara ambos.
- **Fix `update-match.ts` (admin)**: corregir el score de la final a mano ahora
  también re-resuelve las predicciones de Copa (antes solo fantasy_legend; el
  `score_locked` que setea el admin suprimía los triggers de los syncs).
- **Fix `tournament-resolver.ts`**: el resolver determinaba campeón/3ro SOLO por
  score y devolvía null en empate. Pero el admin usa `penalty_winner` (lado
  ganador sin bump — así se cerró el #96 de octavos, 0-0 pen). Una final cerrada
  así jamás resolvía la Copa. Ahora `winnerSide()` cae a `penaltyWinner` si el
  score está empatado (final Y 3er puesto).
- **Verificado ya sano**: cadena FIFA whistle→finalize→resolver p/ final decidida
  en 90'/ET; bump de penales por football-data → resolver+legends (sync-scores);
  wrapped gate (`round='final'` finished), banner home (`useTournamentPhase` con
  allMatches limit 200, cap del endpoint = 200 OK), push `send-wrapped-ready`
  (run-daily 12:00 UTC, idempotente vía `worker_flags` — la tabla existe en prod),
  worker deadline-reminders cubre la fecha 'final' (`['third','final']`).

**⚠️ Lo malo / pendiente:**
- 🔴 **Los 4 fixes NO están commiteados ni deployados** — deployar ENTRE HOY y
  el 18/7 (no hay partidos hasta el 3er puesto). Sin deploy, la final por penales
  vía ESPN o el fantasy_legend por pitazo FIFA quedan manuales
  (`resolve-tournament-predictions.ts` / `POST /admin/finalize-fantasy`).
- 🟡 **`.env.ro` tiene los valores CRUZADOS**: `TURSO_DATABASE_URL` contiene el
  JWT y `TURSO_AUTH_TOKEN` la URL libsql. Corregir el archivo (los scripts que
  lo usen a ciegas revientan con URL_INVALID).
- 🟡 `use-tournament-phase.ts:38` filtra `round !== '3rd'` pero la API manda
  `'third'` — filtro muerto. Hoy es inofensivo (el loop solo mira r32..final),
  pero el literal está mal; el tipo de `mock.ts` también dice `'3rd'`.
- 🟡 Wrapped sigue sin walkthrough real (login Google) — validar `?preview=1`
  como admin antes del 19/7.
- 🟢 `tournament_predictions`: 63 filas, 0 puntuadas (esperado hasta la final).

Detalle completo de los 6 ítems en la tabla "Registro de sesiones" de
`PLAN-MEJORAS.md` (no repetido acá). Resumen: lock in-memory de `/sync`
(429 si ya hay un tick corriendo), rate limit genérico 300/min en
`/api/v1`, ajuste de contraste de `--bg-elevated` en modo claro, tinte
sutil del acento en `--bg-deep` (dark) vía `color-mix`, y `users.isAdmin`
en DB + `PATCH /admin/users/:id` para promover admins sin redeploy
(`ADMIN_USER_IDS` sigue como fallback). Ítem 7 (compactar reacciones)
quedó fuera de alcance, era explícitamente opcional.

**⚠️ Gotcha nuevo — `drizzle-kit push` y columnas NOT NULL con default**:
al agregar `users.isAdmin` (NOT NULL, default 0) sobre una tabla con 91
filas, `drizzle-kit push` propuso **truncar la tabla `users`** pese al
`.default(0)` declarado en el schema Drizzle — mismo tipo de fricción de
tooling ya visto en Sesión 4 (`Cannot find module './users.js'`). Se
abortó y se aplicó `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT
NULL DEFAULT 0` a mano vía script descartable con `@libsql/client`
(SQLite soporta esto nativamente sin reescribir filas). **Antes de
aceptar cualquier prompt de `drizzle-kit push` que mencione pérdida de
datos o truncar tablas, parar y aplicar el ALTER a mano** — no confiar en
que el default declarado en el schema evite el prompt.

**⚠️ Pendiente**: el tinte de `--bg-deep` (ítem 4) se validó con el
cálculo de luminancia WCAG contra la tabla de ratios auditada (Sesión
2026-06-21), no visualmente — el puerto 5174 del frontend estaba tomado
por el dev server de otra sesión concurrente en este mismo repo. Pedirle
al usuario que lo mire en pantalla (los 12 acentos, sobre todo magenta/
coral que tenían el margen más chico).

### 2026-07-03 — Wrapped frontend + share (Sesión 6 de `PLAN-MEJORAS.md`)

Detalle completo en la tabla "Registro de sesiones" de `PLAN-MEJORAS.md`
(sesiones 1-6, no repetido acá para no duplicar). Resumen: página `/wrapped`
(stories tap/swipe + imagen compartible client-side vía canvas), banner en
home cuando el torneo termina, tabla `worker_flags` nueva + job de worker
`send-wrapped-ready` (push post-final, idempotente). Deploy confirmado en
prod (Vercel sirve el chunk, `/health` OK).

**⚠️ Lo malo / pendiente:** no se pudo hacer el walkthrough real en
navegador (banner → stories → compartir) — mismo límite conocido de
sesiones anteriores, el login requiere Google OAuth y no hay credenciales
en este entorno. Falta que el usuario lo valide con `?preview=1` siendo
admin antes del 19/7 (deadline duro del Wrapped).

### 2026-06-29 — Auditoría stats (goleadores/asistidores/amarillas/rojas) + mapeo de fifa_id

Disparado por un reporte de usuario ("le falta un gol a Mbappé"). Se corrió
`audit-stats.ts` (feed FIFA vs `player_match_stats`) + un audit ad-hoc de
asistencias (el script original NO chequeaba assists). **Solo se tocó data de
prod (mapeos + re-sync), no código.**

**✅ Lo bueno (arreglado y verificado contra el feed):**
- **Mbappé/Dembélé (#41 FRA-IRQ)**: faltaban el 2° gol de Mbappé (54') y el gol
  de Dembélé (66') + sus assists. **Causa: feed parcial** — el partido se
  sincronizó cuando la timeline solo tenía el gol del 14' y nunca se re-sincronizó
  con el 2T. Ambos ya estaban en el roster con `fifa_id_player` cacheado → un
  `resync-all-finished` (force) los recuperó solo. Idem assists de Olise.
- **Desajustes de transliteración** (FIFA escribe distinto que nuestro roster, el
  matcher fuzzy no llega): se cacheó `players.fifa_id_player` extrayendo el
  `IdPlayer` del evento del feed, para que el resolver matchee por ID (1ª rama,
  saltea el fuzzy). Mapeados: Mostafa **Ziko** (FIFA "ZICO", #38 gol+asist),
  Mohanad **Lasheen** ("LASHIN", #38/#62 amarillas), **Diney** ("DINEY BORGES",
  #40), Musa **Al-Taamari** ("MOUSA ALTAMARI", #44 asist), Husam **Abu Dahab**
  ("ABUDAHAB", #44), Hossein **Kanaanizadegan** ("KANANI", #62), Firas
  **Al-Buraikan** ("FERAS ALBRIKAN", #64), Mohannad **Abu Taha** ("ABUTAHA", #67),
  Mohammad **Abu Zrayq** ("ABUZRAIQ", #67).
- **Ambigüedad Danilo (BRA, #53)**: hay DOS "Danilo" en el plantel → el matcher
  rechazaba la amarilla por ambiguo. Se mapeó el `IdPlayer` 335656 al Danilo
  **defensor** (id 5576).
- **#55 asistencia fantasma**: Eren Elmalı tenía `assists=1` que FIFA después
  reasignó (timeline editada). El resync hace upsert pero **no borra** filas de
  jugadores que ya no aparecen en el feed → quedó stale. Se puso a 0 a mano.
- Tras cada cambio: `recomputeAllFantasyPoints`. **Rojas: 100% OK desde el vamos.**

**⚠️ Lo malo / pendiente:**
- 🟡 **#73/#74/#76 (octavos, stage 289287) están TBD-TBD** (placeholder id 49):
  los equipos clasificados reales todavía no se asignaron al match, así que el
  sync carga el roster vacío de TBD y `player_match_stats` queda en 0 (#74: feed
  con 9 goles, db 0). **No es bug del sync** — necesita asignar los equipos del
  cuadro + `backfill:fifa`. Queda para el flujo de bracket (dueño).
- 🟡 **#32 Carlos González (PAR)**: el feed cuenta su amarilla pero NO está en
  nuestro plantel de 26 y el evento ni trae `IdPlayer` → imposible mapear. Además
  el feed cuenta la amarilla de **Montella (DT de Türkiye)**, que bien ignoramos.
  Por eso #32 queda Y feed=4 / db=2 — esperado, no se fuerza.
- 🟢 **Idea de robustez (post-torneo)**: el matcher falla sistemáticamente con
  apellidos compuestos colapsados ("Abu Dahab"→"ABUDAHAB", "DINEY BORGES" vs solo
  "Diney") y apellidos < 5 chars fuera del umbral fuzzy ("Ziko"/"ZICO"). El
  resync tampoco limpia stats stale (ver #55). Ambos se podrían endurecer.

### 2026-06-24 — Clinch nunca confirmaba 1° + R32 en la lista mostraba "???"

Dos bugs reportados desde la UI (el cuadro y la lista de Partidos). **Solo
lógica/presentacional, no toca scoring ni shape de la API.** `tsc` front = 0,
`npm run test` 25/25, `npm run build` OK.

- **🐛 El motor de clinch (`group-clinch.ts`) NUNCA confirmaba el 1° de nadie**
  (`first=null` en TODOS los grupos), aun con equipos matemáticamente
  asegurados. Verificado contra la DB de prod: GER/MEX/USA/ARG salían ámbar `≈`
  (provisional) igual que NOR/FRA/COL, cuando los 4 primeros ya tenían el 1°
  asegurado.
  - **Causa raíz**: en el bucle de escenarios, al empatar dos equipos en puntos
    el desempate solo se resolvía si **ambos** ya habían jugado sus 3 partidos
    (`tStats.done && oStats.done`); si a alguno le restaba un partido, caía al
    `else` conservador (`could++`) y no confirmaba. Pero bajo la regla **FIFA
    2026 (enfrentamiento directo PRIMERO**, antes de la dif. de gol global —
    confirmado con fuente oficial fifa.com), un duelo directo YA JUGADO y no
    empatado fija el orden del par pase lo que pase en lo que resta. GER ya le
    había ganado a CIV (su único rival que podía llegar a 6) → estaba confirmado,
    pero el `done` guard lo ignoraba. (El comentario de cabecera del archivo
    encima describía el orden VIEJO —dif. de gol global primero—, contradiciendo
    a `compareDecided` y a `computeStandings`; era stale y se corrigió.)
  - **Fix**: nuevo `headToHeadResult()` que resuelve por el duelo directo jugado
    aunque resten partidos; el desempate por dif. de gol GLOBAL (`compareGlobal`,
    antes `compareDecided`) se sigue exigiendo "ambos done". Resultado verificado
    contra prod: GER/MEX/USA/ARG → 1° confirmado `✓`; NOR/FRA/COL → siguen `≈`
    (su duelo directo por el 1° está pendiente, correcto). Test viejo de grupo D
    ("NO confirma 1°...") codificaba el comportamiento incorrecto (regla vieja) →
    reescrito a un caso genuinamente no confirmable (duelo directo pendiente) +
    test nuevo del caso GER (confirma con partidos pendientes si ya ganó el duelo).
- **🐛 La lista de Partidos mostraba los cruces de R32 como "??? vs ???"** en vez
  de los equipos ya proyectados (la pestaña Cuadro sí los mostraba).
  - **Causa**: el endpoint `/teams` NO incluye al equipo placeholder TBD (id 49)
    que ocupa los R32. El cuadro cae a su `TBD_TEAM` hardcodeado (→ muestra
    proyección), pero la lista caía a `PLACEHOLDER_TEAM` (code `'???'`) y
    `teamDisplayLabel` solo trataba el code `'TBD'`, devolviendo `'???'` crudo.
  - **Fix** (`matches.tsx`): se wireó la misma proyección del cuadro
    (`computeBracketProjection` + `resolveBracketSlot`, reusa teams/matches ya
    cacheados, no agrega red). Nuevo `renderTeamSide` muestra: equipo real →
    bandera+código; cruce proyectado → bandera+código+`✓`/`≈`; sin proyección →
    label del slot ("1° Grp A"/"Mejor 3ro"/"Por definir", nunca `'???'`). Helper
    `isRealTeam` distingue TBD/'???' de un equipo definido.
- **Pendiente**: deployar (no se commiteó/deployó acá). El fix de clinch hace que
  el cuadro y la lista se auto-actualicen a medida que se definan los grupos.

### 2026-06-24 — Matches: filtro inicial inteligente + tabs "Hoy" / "Por jugar"

- **Síntoma reportado por usuarios**: en `/matches` (tab "Partidos") había que
  **scrollear mucho** para llegar a los partidos del día — la vista "Todos"
  arranca en el primer día del torneo y, con los días que pasan, se acumulan
  decenas de partidos terminados arriba.
- **Fix (solo presentacional, `src/pages/matches.tsx`)**:
  - **Filtro inicial inteligente**: al cargar los datos (una sola vez, vía guard
    `initializedRef` + `setState` en render para evitar el flash de la lista
    completa), la página aterriza en **"Hoy"** si hay partidos hoy, si no en
    **"Por jugar"** (próximos), si no en "Todos" (torneo terminado). Respeta el
    deep-link `?filter=live` del banner de la home y suma `?filter=today`. Así
    los partidos del día se ven **sin scrollear** y los filtros quedan a la vista.
  - **Filtro de estado como dropdown** (no como pestañas): a pedido del usuario,
    para no saturar la barra con 7 opciones. `<select>` nativo estilado (mejor UX
    mobile: usa el picker del SO), accesible (`label` sr-only), con count por
    opción `Opción (N)`. Reemplaza la fila de pills horizontal. El badge "en vivo"
    del header sigue señalando el estado live (se perdió el pulse rojo de la pill,
    redundante con ese badge). Opciones: `Todos · Hoy · En vivo · Por jugar ·
    Sin pronosticar · Pronosticados · Terminados`.
  - Semántica: **"Pendientes"** vieja (`scheduled && !predicho`, confusa) se
    partió en dos opciones claras → **"Por jugar"** = `status === 'scheduled'`
    (todos los restantes) y **"Sin pronosticar"** = `scheduled && !predicho` (los
    que te falta pronosticar). Nueva **"Hoy"** = kickoff en la fecha local del
    dispositivo (incluye los ya jugados/en vivo de hoy).
  - Helper `localDateKey(Date)` extraído (reusado por `groupByDate`, el filtro
    "Hoy" y el default). Empty-state propio para "Hoy".
- **No toca**: lógica de negocio, scoring, hooks de datos, shape de la API. El
  polling de 30s NO re-pisa el filtro (guard de una sola aplicación). Verificado:
  `tsc --noEmit` (front) = 0, `npm run build` OK.
- **Descartado en el camino**: un auto-scroll a la fecha "hoy" dentro de "Todos"
  — escondía los filtros recién al cargar (lo que el usuario quería descubrir) y
  era frágil con el stagger de framer-motion y el scroll a nivel documento del
  app-shell. El default inteligente resuelve lo mismo de forma más robusta.

### 2026-06-22 — Fix banderas Copa (Windows) + badge "No pronosticaste"

Dos fixes puntuales reportados desde la UI, deployados por separado (commits
`e1b6002` y `999d0a1`) con `live=0`.

- **Banderas de la tabla Monte Carlo (Oloráculo) no se veían en desktop/Windows**
  (`tournament-predictions.tsx`). La tabla pintaba la bandera como emoji crudo
  (`<span>{row.teamFlag}</span>`). **Windows no renderiza los emoji de bandera**
  (regional indicators) y muestra el código de 2 letras. Fix: usar `<TeamFlag
  code={row.teamCode} emoji={row.teamFlag} size={16} />` (imagen flagcdn con
  fallback a emoji), mismo patrón que el resto de la app (stats.tsx). Barrido:
  era el ÚNICO caso de emoji crudo de bandera en el código.
- **Badge "FT" ambiguo en partidos finalizados sin pronóstico** (`matches.tsx`).
  El `FT` no distinguía "no pronosticaste" de "pronóstico sin puntos". Se agrega
  una línea tenue en cursiva "No pronosticaste" cuando `isFinished && !hasPrediction`
  (el caso multi-liga divergente sigue difiriéndose al detalle). Nota: se evitó
  `text-muted/70` (los tokens `var()` sin `<alpha-value>` no soportan el modificador
  de opacidad → CSS inválido, mismo tipo de bug que `translate-x-5.5`); se usó
  `text-muted italic`.

### 2026-06-22 — Ronda profunda UX/perf (4 agentes paralelos) — APROBADA por auditor

Segunda pasada "más a fondo" sobre la base ya deployada. 4 agentes con file-ownership
disjunto (core / ligas+perfil / feature / infra compartida). Solo presentacional +
perf de render + a11y — `git diff` sobre `shared/hooks`, `shared/stores`,
`scoring.ts`, `levels.ts`, `packages` = VACÍO (confirmado por auditor). Verificación:
`tsc -b` 0, `npm run test` 5/5, `npm run build` OK. Auditado por agente independiente:
**APROBADO** (sin violaciones de alcance, keys de stagger estables, memo seguro,
focus-trap correcto). Commit consolidado tras esperar `live=0`.

> ⚠️ NOTA OPERATIVA: una primera corrida de esta ronda se cortó por límite de sesión
> de los sub-agentes y dejó JSX sin cerrar (home.tsx/stats.tsx no compilaban). Se
> stasheó lo roto (`git stash`) y se relanzó con instrucción de "edición atómica /
> dejar el archivo compilable". Lección: en pasadas multi-agente largas, verificar
> `tsc -b` del árbol consolidado ANTES de cualquier deploy; un agente cortado puede
> dejar el árbol roto.

- ✅ **Adopción de las primitivas de `motion.ts`** (creadas el 21/6, hasta ahora sin
  consumir): `staggerContainer`/`staggerItem`/`useMotionPrefs` en listas de
  leaderboard, matches (secciones + filas), home (ligas + próximos), league-detail
  (standings), profile/user-profile (logros), achievements (grids), stats, fantasy
  (standings), tournament-predictions (Monte Carlo), help (pasos). **Stagger solo en
  mount, NO en polling**: keys de contenedor estables → el refetch actualiza filas
  sin re-disparar la entrada (verificado contra polls reales 30/60s). Degradan a
  opacity-only con reduce-motion.
- ✅ **Performance**: `React.memo` en `LeaderboardRow`, `Row` (standings),
  `MatchEvents` (timeline de match-detail, re-render en poll live de 45s),
  `StatCard`, `FantasyGuide`, `BreakdownBadges`. `useMemo` en derivaciones
  (entries/top3/rest/myEntry, predictedIds, locked). Las props de datos cambian de
  referencia en refetch → las filas con score en vivo SÍ se actualizan (memo no las
  congela).
- ✅ **Focus management en modales** (`achievement-card-modal`, `share-sheet`):
  focus-trap (foco inicial, ciclo Tab/Shift+Tab, restauración al cerrar, Escape,
  `role=dialog`/`aria-modal`/`aria-labelledby`), lock de scroll. share-sheet no tenía
  Escape ni lock. Independiente de animación (ok con reduce-motion). El `useFocusTrap`
  quedó DUPLICADO en los 2 modales (deuda: extraer a `shared/lib/use-focus-trap.ts`).
- ✅ **Tap-targets ≥44px**: chips de filtro/status tabs de matches (sin romper el
  scroll horizontal), botones icon-only "Volver"/"Compartir"/Settings en ligas/perfil,
  botones de modales. Cierra la deuda "Volver ~34px" en esas páginas (pendiente en
  fantasy/tournament-predictions/match-detail).
- ✅ **A11y**: roles de tablist/tab/switch, `aria-pressed`/`aria-selected`/`aria-current`,
  labels de inputs, `aria-busy` en button loading, `error-boundary` con botón real,
  empty-state de catálogo vacío en achievements, `sr-only "Paso N"` en help.
- ✅ **Fix de auditoría aplicado pre-deploy**: `league-detail.tsx` usaba
  `key={standings.length}` en el contenedor de stagger → re-animaba la tabla ante
  alta/baja de miembros. Quitada la key (consistente con leaderboard/home).
- ⚠️ **Pendiente (deuda menor post-torneo)**: `LineupRow` (fantasy) y las 7 PickCards
  (tournament-predictions) no se memoizaron/animaron (requerían refactor estructural).
  Front sigue sin tests de componente (solo el drift-guard de levels.ts). `useFocusTrap`
  duplicado. tab-bar/sidebar sin cambios (ya cumplían / desktop-only).

### 2026-06-21 — Pasada UX/UI multi-agente (4 agentes paralelos, presentacional)

Cuatro agentes en paralelo con propiedad de archivos particionada (paleta/tema,
animaciones, UX/UI flujos core, UX/UI secundarias). Solo cambios presentacionales
sobre app en vivo — nada toca lógica de negocio, data fetching, hooks, scoring ni
shape de datos. Verificación consolidada al final: `tsc -b` limpio, `npm run test`
5/5 verde. (`npm run lint` falla por config preexistente del monorepo —ESLint busca
config en `packages/api`—, ajeno a estos cambios.) Sin commit ni deploy.

**Agente 1 — Paleta & contraste WCAG** (`src/theme/*`, `index.css`):
- **coral y magenta ahora cumplen AA**: usaban texto BLANCO sobre el acento (2.78 y
  3.38, fallaban el 4.5 de texto). Cambiados a texto OSCURO `#0a0e1a` → 6.91 y 5.67.
  `a11y: false → true`.
- **lime y teal**: estaban marcados `a11y: false` de más; medidos dan 15.40 y 10.09
  con su texto oscuro. Flag corregido a `true`.
- **text-muted del modo claro FALLABA AA** (4.12 sobre bg-deep, 4.23 sobre card).
  Subido 0.55 → 0.64 → 4.86/5.05 ✓. Dark 0.55 → 0.60 (ya pasaba; más aire).
  `:root` de index.css sincronizado. Borde claro 0.08 → 0.10 (casi invisible).
- 2 paletas nuevas AA: **sky** `#5AB8FF` (8.81) y **rose** `#FF7A99` (7.71). El
  picker las toma solo vía `accentList`. Tabla de ratios documentada en `palettes.ts`.
- ✅ Verificado sin cambios: WC26 tri-anfitrión OK en ambos modos; team-colors.ts ya cumplía.
- ⚠️ Ratios calculados a mano (fórmula WCAG); shells `node` denegados en la sesión.

**Agente 2 — Primitivas de motion + micro-interacciones** (`src/shared/lib/motion.ts`
NUEVO, `button/skeleton/tab-bar/sidebar/share-sheet/achievement-card-modal`, `router.tsx`):
- Nuevo `motion.ts`: variants/transitions/curvas consistentes (fade/slide/scale/sheet/
  stagger, spring de tap, `EASE`/`DURATION`, `useMotionPrefs`). Mobile-first (150–320ms),
  solo transform/opacity. Todos los helpers aceptan flag `reduced` para degradar.
- Micro-interacciones: `whileTap` en `button.tsx`; indicador activo animado con
  `layoutId` en tab-bar y sidebar; **shimmer** en skeleton (reemplaza pulse plano);
  entrada/salida prolija de share-sheet y achievement-card-modal vía primitivas.
- **Reduce-motion blindado en JS**: el CSS ya neutralizaba animaciones CSS, pero las de
  framer-motion no degradaban solas. `achievement-card-modal` ahora corta con `reduced`
  el RAF auto-sweep, el tilt 3D y los loops infinitos conic/foil. Fade-in de ruta en
  `router.tsx` es CSS (clase `animate-fade-in`) para no interferir con Suspense/
  `lazyWithReload` (Gotcha #2).
- APIs públicas intactas; `SkeletonCard` sumó `className?` opcional.
- ⚠️ `staggerContainer`/`staggerItem` quedaron disponibles pero ningún componente los
  consume aún — pensados para listas en páginas. app-shell y user-level-badge sin tocar.

**Agente 3 — UX/UI flujos core** (home, matches, match-detail, leagues, league-detail, leaderboard):
- **leaderboard.tsx**: tenía un agujero real — sin manejo de error mostraba el vacío
  engañoso "Todavía no hay posiciones". Ahora estado de error con botón Reintentar
  (refetch) + estado vacío genuino como card accionable con CTA a /matches. `aria-label`
  en BadgeChip (antes solo `title`).
- **matches.tsx**: el error mostraba `error.message` crudo sin reintento → mensaje
  amigable + botón Reintentar.
- **leagues.tsx**: corregido HTML inválido (`<button>` anidado dentro de `<Link>`/`<a>`)
  en las cards "Crear liga"/"Unirse" — ahora el Link es el contenedor. Header con
  subtítulo; `aria-label` en búsqueda.
- `loading="lazy"` en avatares de league-detail standings y podio del leaderboard.
- ⚠️ Chips de filtro de grupo en matches (36×32px, <44px) se dejaron (agrandarlos rompe
  el scroll horizontal de 12 chips). match-detail.tsx (~1436 líneas) sin tocar — refactor
  de tamaño queda como deuda post-torneo. home.tsx ya cubierta por auditorías previas.

**Agente 4 — UX/UI secundarias + onboarding** (login, register, settings, stats; resto auditado sin cambios):
- **Bug visual real en Settings**: el thumb del toggle de notificaciones usaba
  `translate-x-5.5`, clase **inexistente** en Tailwind (no hay `5.5` en la scale ni en
  el config) → no emitía CSS, el switch nunca se movía a "on". Corregido a
  `translate-x-[22px]`.
- **Bug de copy en Stats**: el divisor entre tramos de igual total mostraba
  `{total} {total===1?'·':'·'}` (ambas ramas iguales) → "2 ·". Ahora "2 goles"/"1 gol"
  con el sustantivo correcto por pestaña (goles/asistencias/amarillas/rojas, sing/plural)
  vía nueva prop `unit`.
- A11y: `role="alert"` en errores de login y register; `aria-label` en botones
  icon-only Guardar/Cancelar del username en Settings; `aria-pressed` en tabs de Stats;
  error de login de `text-sm` → `text-sm-s` (escalable). Register sumó el link
  "¿Primera vez? → /ayuda" que login ya tenía (paridad de onboarding).
- ⚠️ Botón "Volver" (~34px tap, <44px) es patrón global; no se cambió solo en estas
  páginas para no romper consistencia → mejora global post-torneo. fantasy.tsx,
  tournament-predictions.tsx, profile, user-profile, help, splash, achievements:
  auditadas, ya bien estructuradas, sin cambios.

### 2026-06-21 — Segunda auditoría multi-agente + batch de fixes seguros y tests P0

Segunda pasada de auditoría (agentes de research, frontend, backend, testing) en
modo "auditar y proponer", seguida de la implementación del bloque **seguro de
aplicar durante el torneo** (nada toca el path de scoring en vivo, salvo la
extracción comportamiento-equivalente de `sync-espn`, que sí debe deployarse
entre partidos). Rama: `chore/audit-safe-fixes-and-p0-tests`.

**✅ Lo bueno (aplicado y verificado — front+API tsc 0 errores, build OK, 54 tests verdes):**
- **Push subs muertas (410/404) ahora se borran** en `lib/push-sender.ts` (API, Drizzle)
  y `packages/worker/src/lib/push-sender.ts` (worker, SQL crudo). Antes ambos
  **se tragaban** el 410 → el `catch` de `notify-admin` que intentaba limpiar
  nunca disparaba y las subs muertas se acumulaban (peor en `send-deadline-reminders`,
  que fanout a todos los users).
- **`register` TOCTOU**: el INSERT ahora mapea la violación de UNIQUE a `ConflictError`
  (409) en vez de filtrar un 500 genérico ante dos signups concurrentes con el mismo
  email/username.
- **FE — lock de predicción que no se re-evaluaba con el tiempo**: `match-detail.tsx`
  y `tournament-predictions.tsx` ahora fuerzan UN re-render al cruzar el lock
  (kickoff−5min / `OPENING_LOCK_UTC`) con un `setTimeout`, así el UI se bloquea solo
  en vez de quedar editable hasta un render externo. El backend ya rechazaba con 409;
  esto es solo UX (no había pérdida de datos).
- **FE menores**: banderas `loading="eager"`→`"lazy"` (en `/matches` eran ~400 requests
  a flagcdn en el primer paint); fallback del `ErrorBoundary` `text-white/60`→`text-muted`/
  `text-text` (era ilegible en tema claro).
- **Tests P0 (cubren los 3 incidentes de junio que no tenían test): nuevo módulo puro
  `lib/score-sync.ts`** extraído de `sync-espn.ts` (mismo patrón que `fifa-parse`),
  con `resolveCompetitors` (Gotcha #13, score por identidad), `resolveShootoutScore`
  (penalty bump + hold de shootout-winner-unknown) y `shouldRescorePredictions`
  (guard `score_locked`, Gotcha #15). `sync-espn.ts` ahora importa estas funciones
  (comportamiento idéntico, verificado por tsc). 19 tests nuevos en `lib/score-sync.test.ts`.
  El drift-guard `src/shared/lib/levels.test.ts` (espejo `levels.ts` front↔API, Gotcha #10)
  quedó del batch anterior.
- **Dead code borrado**: `src/shared/hooks/use-ws.ts` (`useLeagueSocket` sin usar, con bug
  latente en cleanup); `broadcastToLeague` y la sobrecarga de 4 args de `broadcastMatchUpdate`
  en `ws/server.ts`; lectura del header `x-user-hour` en `upsert-prediction` (`night_owl`
  ya removido — se preservó el campo `userHour` del tipo del evento como hook futuro).

**⚠️ Lo malo / pendiente (NO resuelto — requiere decisión o esperar fin de torneo):**
- 🟡 **Goleadores NO se puntúan**: `prediction_scorers` se guarda y lockea, pero **no
  hay ninguna ruta de scoring que otorgue los "+2 por goleador"** del README/reglas
  (grep `scorer` en `scoring.ts`/`standings.ts` = 0). **Decisión del dueño (2026-06-21):
  NO implementarlo durante este Mundial** — implementarlo a mitad de torneo cambiaría
  el leaderboard retroactivamente. Queda como posible feature post-torneo; mientras
  tanto los picks de goleadores no suman puntos (no es un bug, es decisión consciente).
  El README menciona "+2 goleadores" como regla → corregir el README post-torneo si se
  decide no implementarlo nunca.
- 🟡 **Operativo `SYNC_SECRET` + deploy**: ✅ `SYNC_SECRET` **confirmado** — Render y el
  header `x-sync-secret` de cron-job.org coinciden, el `/sync` no da 503 y el sync en
  vivo funciona. Queda por confirmar en prod (no verificable desde el repo): que Render
  tomó el último `main` con el guard `score_locked`, que la migración
  `add-score-locked-column` corrió en la Turso de prod, y que match 39 quedó 4-0 con
  `score_locked=1`.
- 🟡 **Worker no typechequea aislado**: `cd packages/worker && tsc --noEmit` falla por
  módulos no resueltos (`@libsql/client`, `node-cron`, `web-push`) — **pre-existente**,
  no introducido por este batch. Revisar la config del worker.
- **Post-torneo** (riesgo/sin valor durante el Mundial): rotación de refresh token,
  auth + heartbeat en WebSocket, tokens a httpOnly cookie, config de ESLint, refactor
  de `match-detail.tsx` (~1420 líneas), `update-match` admin transaccional, derivar
  `OPENING_LOCK_UTC` del API en vez de hardcodear.

### 2026-06-21 — Override de score (`scoreLocked`) + fix ESP-KSA 5-0→4-0

- **Síntoma**: el partido 39 (España-Arabia, grupo H) mostraba **5-0** pero terminó
  **4-0**.
- **Causa raíz**: **football-data.org publicó 5-0** (dato erróneo de la fuente).
  ESPN decía 4-0 (ESP ganador) y la **timeline FIFA tenía 4 goles** (3 + 1 en contra)
  — las dos fuentes correctas. Como `/sync` prioriza football-data y el partido
  seguía en la ventana (yesterday+today), cada tick volvía a pisar el score a 5-0.
- **Fix estructural**: nueva columna **`matches.score_locked`** (0/1). Cuando es 1,
  `sync-scores` y `sync-espn` **no** tocan home/away score **ni** re-puntúan las
  predicciones de ese match (status/liveStatus siguen sincronizando normal). El
  endpoint admin `update-match` ahora **setea `score_locked=1`** cuando un admin
  edita el score a mano. Migración idempotente: `src/scripts/add-score-locked-column.ts`.
- **Fix de datos (prod)**: match 39 → 4-0 + `score_locked=1`; re-puntuadas sus
  predicciones contra 4-0 → **3 pronósticos de "5-0" que estaban mal acreditados con
  5 pts (exacto contra el 5-0 corrupto) bajaron a 1 pt**. Fantasy intacto (se basa en
  `player_match_stats` de FIFA = 4 goles, no en el score; valla por away=0 sin cambio).
- ⚠️ **Orden de deploy**: la corrección de datos solo **se mantiene** una vez
  deployado este código (el guard de `score_locked`). Con el código viejo corriendo,
  el sync puede revertir el 4-0 a 5-0 en el próximo tick. Deployar **entre partidos**.

### 2026-06-21 — Auditoría con 5 agentes + primer batch de fixes y tests

Sesión de auditoría completa (front, backend API, pipeline sync/scoring, research,
testing) en modo "auditar y proponer", seguida de la implementación del batch de
mayor ROI y menor riesgo. **App en vivo (fase de grupos) — no se deployó nada
todavía; los cambios viven en la rama `chore/audit-fixes-tests-context`.**

**✅ Lo bueno (hecho y verificado):**
- **Infra de tests creada de cero.** Antes `npm test` estaba roto (apuntaba a un
  `vitest.config.ts` inexistente) y `packages/api` no tenía Vitest. Ahora:
  `vitest.config.ts` en raíz (jsdom, `passWithNoTests`) y en `packages/api`
  (node), scripts `test`/`test:watch` en ambos, y los tests excluidos del build
  `tsc` (`packages/api/tsconfig.json` → `exclude`). El binario de vitest se
  hoistea desde el root, no hay install separado en la API.
- **35 tests pasando** (lógica pura, sin DB): `scoring`, `fantasy-scoring`,
  `match-helpers` (lock kickoff-5min + fail-safe), `fantasy-rounds` (regresión
  semis ×2 congelada) y `fifa-parse`.
- **Helpers de parseo FIFA extraídos** de `services/sync-fifa-stats.ts` a
  `lib/fifa-parse.ts` (`parseDescription`, `normName`, `editDistanceAtMostOne`,
  `hasFinalWhistle`, `FINAL_WHISTLE_TYPE`, `FifaLocaleString`). Movida pura, sin
  cambio de comportamiento, para testearlos sin arrastrar la capa de DB.
- **`SYNC_SECRET` ahora obligatorio en producción** (`app.ts`): si falta en prod,
  `/sync` responde 503 en vez de quedar abierto. En dev se mantiene la apertura
  sin secret para no romper el testing local. **PENDIENTE OPERATIVO: setear
  `SYNC_SECRET` en Render y en cron-job.org antes de mergear/deployar, sino el
  cron deja de funcionar.**
- **Fix `reconcile`**: al auto-finalizar un partido (camino de último recurso a
  las 3h30m), ahora dispara `syncFifaStatsForMatch()` fire-and-forget como ya
  hacen sync-scores/sync-espn. Antes ese camino cerraba el match sin stats FIFA
  → todos los titulares quedaban en 0 fantasy esa fecha.
- Auditoría confirmó **mucho ya blindado**: finalize idempotente, score por
  identidad, rechazo de hermanos ambiguos, tanda no infla fantasy, guard
  finished→live, "finished sin scores" ignorado, transacciones en ligas, sin
  fugas de email, lock fail-safe.

**✅ Segundo batch de fixes (aplicados, `tsc` API+front = 0, 35 tests verdes):**
- **ESPN no cierra un KO empatado sin ganador** (`sync-espn.ts`): si la tanda no
  trae el flag `winner`, el match se **mantiene `live`** ese tick (no se finaliza
  ni se puntúa) y se cierra cuando el ganador aparece (próximo tick o
  football-data). Antes podía persistir 1-1 y "todo empate puntúa 5". Solo retiene
  en la *transición* a finished; un match ya finished no se toca.
- **Front `matches.tsx`**: la lista filtra TODAS las predicciones del match y solo
  muestra marcador/`+pts` si son idénticas en todas las ligas; si divergen, sigue
  marcando "pronosticado" (`hasPrediction`) pero el detalle queda para match-detail.
- **Authz/lock**: `ensureMyTeam` valida membresía de liga (403 si no); `upsert-scorers`
  rechaza con 409 si el match está lockeado; `delete-account` ahora es transaccional
  (transfer admin + deletes atómicos); rate-limit usa el **último** hop de
  `X-Forwarded-For` (el del proxy de Render, no spoofeable) en vez del primero.
- **Observabilidad**: `/health` hace `SELECT 1` con timeout 2.5s (503 si la DB no
  responde); `morgan('combined')` en prod (`'dev'` en local).
- **Código muerto / docs**: sacado el header `x-user-hour` (front) y los tips que
  mentían (`night_owl` removido; "logros suman puntos" → dan XP). README corregido
  (lock 5min, logros = XP).

**⚠️ Lo que queda pendiente (decisiones, no olvidos):**
- 🔴 **Warmth de Render = SPOF** (operacional, no código): lo único que evita el
  cold start es cron-job.org cada 3min. Falta pinger de respaldo a `/health` +
  alertas de fallo en cron-job.org. → Ver instrucciones de Render/cron entregadas.
- 🟡 **`update-match` (admin) no transaccional**: NO se tocó a propósito — su loop
  de scoring toca el path del vivo; aplicar entre partidos con cuidado.
- 🟡 **Refresh token sin rotación** (30d): **decisión de no bajarlo** durante el
  Mundial — desloguearía gente en plena fase final. Post-Mundial: rotación + TTL menor.
- 🟢 **`meta.total` = page size** en leaderboard: cosmético con ~40 users; sin tocar.
- ❓ **`OPENING_LOCK_UTC`**: código = `2026-06-19`, doc decía `2026-06-11`. Hoy (21/6)
  ambas ya pasaron y el server valida contra el lock del primer partido, así que es
  inocuo ahora. Confirmar si el `19/6` fue una extensión intencional del deadline.
- 🟢 **No hay config de ESLint en el repo** (`npm run lint` falla: "couldn't find a
  configuration file"). Gap pre-existente — agregar un `eslint.config.js` algún día.

**Limpieza:** se borraron las 3 worktrees ya mergeadas (`feat/fantasy-deadline-push`,
`feat/fantasy-player-breakdown`, `feat/timeline-penalties`); las ramas quedan.

**Verificación de este checkout:** `cd packages/api && npm install` (las deps no
venían) → `npx tsc --noEmit` (API) = 0; `npx tsc --noEmit` (raíz, front) = 0;
`cd packages/api && npm test` = 35 ok. El front no tiene tests aún
(`vitest run` en raíz = passWithNoTests).

### 2026-06-20 — Tick interno de alta frecuencia para el vivo (lag de ~3min)
- **Síntoma**: durante un partido, el gol, el minuto y el cooling break tardaban
  ~2-3 min en aparecer. El cooling break (dura ~2-3 min) casi siempre se mostraba
  tarde o se perdía.
- **Causa raíz**: la timeline FIFA + cooling break + cierre por pitazo solo
  corrían desde `POST /sync` (cadencia del cron externo cron-job.org, ~3 min). El
  timer interno de `auto-sync` solo hacía **scores** (football-data), no FIFA.
- **Fix**: se extrajo el bloque FIFA-en-vivo de `app.ts` a `syncLiveMatches()`
  (`services/sync-live.ts`), reusado por `/sync` y por un **nuevo timer interno
  de 45s** (`runLiveSync` en `auto-sync.ts`) que SOLO actúa si hay partidos en
  vivo. Usa **ESPN** (sin key/cuota) para el score y FIFA (público) para
  timeline/cooling break/finalize. football-data sigue intacto cada 3 min como
  fuente autoritativa. Serializado con `runSync` vía `syncInFlight`. ESPN pide
  ayer+hoy UTC (partidos cruzando medianoche). Resultado: lag ~3min → ~45s.
- **Keys (verificado)**: ESPN y FIFA **no usan key** (APIs públicas ya en uso).
  football-data es la única con cuota. API-Football tiene key pero su free tier
  bloquea WC2026 (inútil). No buscar "activar" ESPN/FIFA.
- **Deploy**: hacerlo **entre partidos** (toca el path de scoring del vivo).

### 2026-06-20 — Penales: errado/atajado en timeline + tanda no infla fantasy
- **Qué cambió**: la cronología ahora muestra **penal errado (FIFA Type 65)** y
  **penal atajado (Type 60)**. Antes solo se veían los convertidos, y en una
  tanda eso dejaba la cronología incompleta/asimétrica.
- **Bug latente corregido**: FIFA usa **Type 41 tanto para penal en juego como en
  la tanda (Period 11)**. El parser sumaba los penales de la tanda como goles
  fantasy (+4 a +6 por jugador). Ahora, si `Type 41 && Period === 11` se emite
  `penalty_goal` al timeline pero **NO** suma a `bucket.goals`. Penal en juego/ET
  (Period < 11) sí suma.
- **Gotcha del dedupe**: la tanda no trae `MatchMinute`, así que varios penales
  del mismo jugador (un arquero que ataja 2) colisionaban en la clave natural
  `type:minute:period:playerId`. Se asigna un **minuto sintético incremental** por
  evento de tanda como desempate estable (la UI muestra "Penales", no el número).
- Nuevos tipos en enum `match_events`, `TimelineEvent`, `MatchTimelineEvent` y
  `EVENT_LABEL`. `diagnose-fifa-flow` replica la exclusión de la tanda.

### 2026-06-20 — Fantasy: push de deadline + desglose de puntos por jugador
- **Push de deadline**: nuevo job `send-fantasy-deadline-reminders.ts` (worker)
  que avisa ~30 min antes del deadline de cada fecha (armar 11/capitán). Antes el
  único push era de pronósticos. Mismo patrón anti-spam (ventana [now+25,now+30],
  cron 5min). Los deadlines se **espejan** de `lib/fantasy-rounds.ts` (el worker
  no depende de `packages/api`) — mantener en sync (ver Gotcha #10).
- **Desglose por jugador**: el lineup de una fecha cerrada ahora muestra los
  puntos fantasy por titular con su detalle (gol/asist/valla/tarjetas), capitán
  ×2 / vice ×1.5. Backend reusa `calculateFantasyPoints` (única fuente de verdad);
  valla invicta derivada por identidad de equipo. Al entrar a una fecha cerrada la
  vista arranca en "lista" (donde se ve el desglose).

### 2026-06-19 — Cierre rápido por "final whistle" de FIFA (lag de cierre)
- **Síntoma**: un partido seguía mostrándose "EN VIVO" ~10-15 min después de
  terminar. Medido: delay sistemático de ~10-15 min entre el pitazo y que lo
  marcáramos `finished`.
- **Causa raíz**: football-data.org Y ESPN **tardan ~10 min** en flipear el
  status a FINISHED tras el pitazo (lag aguas arriba, no del cron). El cron
  agrega hasta 3 min más.
- **Fix**: FIFA expone el fin al instante. La timeline (que ya bajamos cada tick)
  trae el evento **Type 26 "The final whistle sounds."**. `sync-fifa-stats` lo
  detecta (`finalWhistle`) y `finalizeMatchFromFinalWhistle` cierra el partido
  usando el score que las fuentes ya mantuvieron en vivo + puntúa predictions.
  Guard en sync-scores/sync-espn: una fuente lenta que dice "live" no
  des-finaliza (evita flip-flop). Corre por el path `/sync` (cron-job.org).
- **Pendiente/idea**: la misma técnica serviría para la transición
  entretiempo→2T (FIFA Type 7 Period 5 "start of the second period" llega al
  instante; hoy esa transición también lagea unos minutos por las fuentes).

### 2026-06-19 — Score por identidad de equipo (resultado al revés)
- **Síntoma**: el resultado de Suiza-Bosnia figuraba al revés y no se actualizaba.
- **Causa**: `sync-espn` copiaba ESPN-home-score → nuestro-home a ciegas. Cuando
  ESPN y nuestra DB no coincidían en quién era local, los goles caían en el
  equipo equivocado.
- **Fix**: `resolveCompetitors` mapea cada competidor de ESPN a nuestro
  local/visitante por código de equipo. Mapeo divergente: `RSA→ZAF`. Ver Gotcha #13.

### 2026-06-19 — Alineación de orientación a FIFA + incidente de pronósticos
- **Qué se hizo**: el seed tenía 24 partidos con home/away invertido vs FIFA (la
  3ª fecha de cada grupo, sistemático). Se alinearon a FIFA (swap match + predictions
  atómico por partido).
- **Incidente**: al swapear 2 partidos (28, 53) con scripts separados, el swap de
  predictions no persistió en uno → quedaron desalineados y usuarios perdieron
  puntos. Se corrigió manualmente. **Aprendizaje → Gotcha #14** (no swapear match
  sin swapear predictions atómicamente). Los puntos son invariantes ante swap
  consistente de ambos lados.

### 2026-06-18 — Sync cross-medianoche (partidos trabados en vivo)
- **Síntoma**: partidos con kickoff cerca de medianoche UTC (ej. GHA-PAN 23:00,
  Colombia) quedaban "en vivo" tras terminar.
- **Causa**: el sync solo consultaba `today`; al cruzar medianoche UTC el partido
  caía en `yesterday`.
- **Fix**: `/sync` consulta `yesterday + today` cada tick. (ESPN además interpreta
  `dates=` en ET → ya se pedían 2 días, ver Gotcha #3.)

### 2026-06-18 — HT subs con minuto "?" y cooling breaks
- HT subs (FIFA Period=4, sin MatchMinute) se mapean a period=2 minuto=45
  sintético en `sync-fifa-stats`. Cooling break: el pill se sacó de
  `CoolingBreakDrops` (duplicaba el label del header). Own goal: ícono con ✕ rojo.
