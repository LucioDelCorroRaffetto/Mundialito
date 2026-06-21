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
