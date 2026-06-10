# Mundialito — Contexto del proyecto para agentes

> **Leé esto antes de tocar código.** Unifica README, PLANNING, PLAN-FANTASY,
> PLAN-LANZAMIENTO, INTEGRATION, vercel.md y fly.deploy.md más todo lo aprendido
> en las sesiones de hardening pre-Mundial (junio 2026). Los MD viejos siguen en
> el repo como referencia histórica, pero **este archivo es la fuente de verdad**.

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
    auto-sync.ts              # Timer cada 3 min (hoy) + 30 min (ayer). Mutex + guard.
    sync-scores.ts            # Primario: football-data.org (FOOTBALL_DATA_API_KEY)
    sync-espn.ts              # Fallback automático (sin key; dates en ET, no UTC)
    sync-fifa-stats.ts        # Player stats desde api.fifa.com (gratis, sin auth)
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

1. `auto-sync` (en el proceso API, cada 3 min) consulta football-data.org;
   si falla, cae a ESPN. Actualiza status/score del match.
2. Al pasar un match a `finished` (solo en la **transición**):
   - Calcula points de todas las predictions → `checkAchievements('prediction_scored')`
   - Dispara `syncFifaStatsForMatch(matchId)` (fire-and-forget)
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
