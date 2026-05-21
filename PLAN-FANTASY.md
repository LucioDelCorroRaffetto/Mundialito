# Plan — Fantasy que suma puntos (mínimo viable)

Creado 2026-05-21. El fantasy hoy es una cáscara: armás un equipo, lo guardás
y nunca pasa nada. `fantasyTeams.totalPoints` está fijo en 0. Este plan lo
convierte en un Gran DT funcional **sin presupuesto/precios/transferencias**
(eso queda para una fase futura).

Objetivo: que esté listo para el **2 de junio** (cuando salgan los planteles
oficiales). No bloquea el lanzamiento del 11 de junio — el fantasy ya está
detrás del banner "no disponible" hasta esa fecha.

---

## Contrato compartido (fuente de verdad para ambos agentes)

### 1. Nueva tabla `player_match_stats`

Registra el rendimiento real de cada jugador en cada partido.

```
player_match_stats
  id            integer PK autoincrement
  match_id      integer NOT NULL → matches.id    (onDelete cascade)
  player_id     integer NOT NULL → players.id    (onDelete cascade)
  played        boolean NOT NULL default false
  goals         integer NOT NULL default 0
  assists       integer NOT NULL default 0
  yellow_cards  integer NOT NULL default 0
  red_card      boolean NOT NULL default false
  UNIQUE (match_id, player_id)
```

Nota: la **valla invicta (clean sheet) NO se guarda** — se deriva en el motor
de puntaje (jugó + el rival no convirtió). Así el admin carga menos datos.

### 2. Fórmula de puntaje fantasy (por jugador por partido)

Función pura `calculateFantasyPoints(input)` en `packages/api/src/lib/fantasy-scoring.ts`:

```
input: { position, played, goals, assists, cleanSheet, yellowCards, redCard }

si !played            → 0 pts
base por presentarse  → +2
gol                   → GK +6 · DEF +6 · MID +5 · FWD +4  (por gol)
asistencia            → +3 (cada una)
valla invicta         → GK/DEF +4 · MID +1   (solo si cleanSheet)
tarjeta amarilla      → -1 (cada una)
tarjeta roja          → -3
```

`cleanSheet` lo determina el servicio de recálculo: `played && goles del rival === 0`
en ese partido (finished).

### 3. Puntaje del equipo fantasy

`fantasyTeams.totalPoints` = suma de los puntos fantasy de los **11 titulares**
en TODOS los partidos finalizados. El **capitán suma x2**. Los suplentes suman 0.

Recálculo completo e idempotente: cada vez que un partido pasa a `finished` o
se editan stats, se recalcula todo desde cero. La escala de usuarios es chica,
no hay problema de performance.

### 4. Contratos de API (exactos — el frontend codea contra esto)

**Admin — traer stats de un partido** (para poblar el formulario)
```
GET /admin/matches/:matchId/player-stats
→ { data: { players: [{ id, name, position, teamId, shirtNumber }],
             stats:   [{ playerId, played, goals, assists, yellowCards, redCard }] } }
```
`players` = los jugadores de los dos equipos del partido.

**Admin — guardar stats de un partido**
```
PUT /admin/matches/:matchId/player-stats
body: { stats: [{ playerId, played, goals, assists, yellowCards, redCard }] }
→ { data: { updated: number } }
```
Tras guardar, dispara el recálculo de puntos fantasy. requireAdmin.

**Fantasy — guardar squad (ahora con titulares y capitán)**
```
PUT /fantasy/squad
body: { playerIds: number[],      // 11-15, el plantel completo
        starterIds: number[],     // exactamente 11, subconjunto de playerIds
        captainId: number }       // debe estar en starterIds
→ { team, squad }
```
Validación: si no se cumplen las reglas → 400 con mensaje claro.

**Fantasy — tabla de posiciones (ARREGLAR bug actual)**
```
GET /fantasy/standings              → global, todos los equipos por totalPoints
GET /fantasy/standings?leagueId=X   → solo miembros de esa liga
```
Hoy filtra siempre por `leagueId` y los equipos son globales (sin leagueId) →
devuelve vacío siempre. Hay que sacar el filtro obligatorio.

**Fantasy — mi equipo (incluir puntos)**
```
GET /fantasy/my-team
→ squad incluye por jugador: { ...datos, isStarter, isCaptain, fantasyPoints }
  y el team incluye totalPoints
```

---

## Reparto de trabajo — 2 agentes en paralelo

Backend (`packages/api/`) y frontend (`src/`) son árboles separados → no se
pisan ningún archivo → paralelismo seguro sin worktrees.

### AGENTE 1 — Backend (`packages/api/`)

1. **Schema**: crear `src/db/schema/player-match-stats.ts`, registrar en
   `src/db/schema/index.ts`. Crear script de migración siguiendo el patrón de
   `src/scripts/migrate-global-fantasy.ts`.
2. **Lib de puntaje**: `src/lib/fantasy-scoring.ts` con `calculateFantasyPoints`
   (función pura, según la fórmula de arriba).
3. **Servicio de recálculo**: `src/services/fantasy-scoring-service.ts` con
   `recomputeAllFantasyPoints()` — recorre cada fantasy team, suma puntos de los
   titulares (capitán x2), deriva clean sheet, escribe `fantasyTeams.totalPoints`.
4. **Integración**: llamar al recálculo desde `update-match.ts` y
   `services/sync-scores.ts` cuando un partido queda `finished`.
5. **Endpoints admin**: `GET`/`PUT /admin/matches/:matchId/player-stats`
   (handlers nuevos + registrar en `routes/admin/router.ts`). El PUT dispara
   el recálculo.
6. **Fantasy**: actualizar `update-squad.ts` para aceptar `starterIds` +
   `captainId` y persistir `isStarter`/`isCaptain`. Arreglar
   `get-fantasy-standings.ts` (global). Actualizar `get-my-team.ts` para
   devolver `fantasyPoints` por jugador y `totalPoints`.
7. Tipá todo, `tsc` sin errores en `packages/api`. NO commitear.

### AGENTE 2 — Frontend (`src/`)

1. **Página Fantasy** (`src/pages/fantasy.tsx`): tras elegir el plantel,
   permitir marcar 11 titulares y 1 capitán. Mostrar `fantasyPoints` por
   jugador y `totalPoints` del equipo. Adaptar el guardado al nuevo contrato
   (`playerIds` + `starterIds` + `captainId`).
2. **Hook** (`src/shared/hooks/use-fantasy.ts`): adaptar al nuevo body de
   `PUT /fantasy/squad` y a los nuevos campos de `my-team`.
3. **Tabla fantasy**: mostrar `GET /fantasy/standings` en algún lado visible
   (sección dentro de Fantasy o del leaderboard).
4. **Página Admin** (`src/pages/admin.tsx`): por cada partido, un formulario
   para cargar stats de jugadores (jugó / goles / asistencias / amarillas /
   roja) usando `GET`/`PUT /admin/matches/:matchId/player-stats`.
5. **Tipos** (`src/shared/types/api.ts`): agregar los tipos nuevos.
6. Codeá contra los contratos de API de este documento (el backend los
   implementa en paralelo). `tsc` sin errores en la raíz. NO commitear.

---

## Verificación final (la hace el orquestador)

- `tsc -b` en raíz y en `packages/api` sin errores.
- Correr la migración contra la DB.
- Revisar los diffs de ambos agentes.
- Commit único cuando todo cierra.

---

## Fuera de alcance (fase futura — Gran DT completo)

- Presupuesto / precios por jugador / valor de mercado.
- Transferencias entre fechas.
- Formaciones reales (hoy la cancha es 3-5-5-2 fija de 15).
- Sustituciones automáticas (si un titular no juega, entra un suplente).
