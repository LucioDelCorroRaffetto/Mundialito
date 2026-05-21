# Plan de lanzamiento — Mundialito

Revisión hecha el 2026-05-21. La base de datos ya fue limpiada de usuarios y
ligas (script `packages/api/src/scripts/reset-for-launch.ts`). Datos de
referencia intactos: 49 equipos, 104 partidos, 294 jugadores, 20 logros.

---

## Estado general

La app está **casi lista**. Funciona el core: registro/login, predicciones
globales, ligas, tabla global, fantasy (lista + cancha), logros con badges,
página de Copa, panel admin. El build de producción compila sin errores.

Quedan **3 cosas que bloquean el lanzamiento** y **2 features incompletas**
que conviene resolver antes de difundir fuerte.

---

## SPRINT 0 — Bloqueantes (hacer HOY, antes de compartir el link)

Sin esto la app queda rota o vos perdés acceso de admin.

1. **Re-registrar tu cuenta primero.**
   - Entrá a la app y registrate ANTES que nadie. Vas a ser el usuario `id = 1`.

2. **Configurar `ADMIN_USER_IDS` en Render.**
   - En el dashboard de Render → servicio de la API → Environment.
   - Asegurate que `ADMIN_USER_IDS=1` (tu nuevo id).
   - Sin esto no ves la pestaña Admin ni podés cargar resultados.

3. **Redeploy de la API en Render.**
   - Los últimos cambios de la API (endpoint `/admin/sync-scores`, columna
     `tier` en logros, badges en standings) necesitan un deploy nuevo.
   - Push a `main` ya dispara el deploy; verificá que el último build de
     Render tomó el commit `6db7267` o posterior.

4. **Verificación end-to-end** (5 min, en el celular):
   - Registro → home → crear una liga → hacer una predicción → ver tabla.
   - Que no haya errores en rojo en consola (el de `play.google.com` es del
     ad-blocker, ignoralo).

---

## SPRINT 1 — Predicción de goleadores (feature rota)

**Problema:** en el detalle de partido aparece el selector "⚽ Goleadores
(+2 pts c/u)". El usuario elige jugadores, toca "Guardar" y ve el toast de
éxito — pero **los goleadores nunca se guardan**. Dos motivos:

- `match-detail.tsx` → `handleSave()` solo envía `{ matchId, homeScore,
  awayScore }`. El estado `homeScorers` / `awayScorers` se descarta.
- El handler `prediction-scorers/handlers/upsert-scorers.ts` quedó viejo:
  todavía exige `leagueId` y busca la predicción por
  `(userId, matchId, leagueId)`. Con predicciones globales el `leagueId` es
  `null`, así que esa búsqueda nunca encontraría la predicción.

**Opción A — Arreglarlo (recomendado, ~1-2 h):**
- [ ] Actualizar `upsert-scorers.ts`: sacar `leagueId` del schema y del
      `where`; buscar la predicción solo por `(userId, matchId)`.
- [ ] Agregar hook `useUpsertScorers` en `src/shared/hooks/use-predictions.ts`
      que llame `PUT /prediction-scorers` con `{ matchId, scorers }`.
- [ ] En `match-detail.tsx` → `handleSave()`: después del upsert de la
      predicción, si hay goleadores elegidos, llamar al nuevo hook.
- [ ] Al cargar una predicción existente, traer los goleadores guardados con
      `GET /prediction-scorers` y precargar `homeScorers`/`awayScorers`.
- [ ] Verificar que el cálculo de puntos suma +2 por goleador acertado.

**Opción B — Ocultarlo (~10 min):**
- [ ] Comentar / quitar el bloque `ScorerPicker` en `match-detail.tsx` y la
      línea "Goleador acertado" del sistema de puntuación.
- Quita la feature pero evita la mentira de "guardado".

---

## SPRINT 2 — Bracket de eliminatorias automático

**Problema:** los 32 partidos de eliminatorias tienen equipos "TBD / Por
definir". Hoy solo se llenan a mano desde el panel admin. Cuando termine la
fase de grupos hay que poner cada clasificado en su llave manualmente.

**Esto NO bloquea el lanzamiento** — la fase de grupos arranca el 11 de junio
y las eliminatorias recién a fin de mes. Hay tiempo.

Pasos cuando se encare:
- [ ] Servicio que, al terminar la fase de grupos, calcule 1º y 2º de cada
      grupo desde `GroupStandings` (puntos → dif. de gol → goles a favor).
- [ ] Mapear cada slot de eliminatorias (ej: "Ganador A vs 2º B") al equipo
      real, según el fixture oficial del Mundial 2026.
- [ ] Endpoint admin `POST /admin/populate-knockout` que dispare ese cálculo.
- [ ] Botón "Generar llaves" en el panel admin.
- [ ] Alternativa más simple: dejar la carga manual (ya funciona) y solo
      sumar este botón como comodidad.

---

## SPRINT 3 — Pulido (opcional, post-lanzamiento)

- [ ] **Planteles completos:** hoy hay 294 jugadores (~6 por equipo). Las
      listas oficiales de FIFA salen el 2 de junio — recién ahí cargar los 26
      por selección. El fantasy ya está bloqueado hasta esa fecha, así que no
      urge.
- [ ] **Código muerto:** `src/pages/placeholder.tsx` no se usa en ningún
      lado. Borrar.
- [ ] **Tamaño del bundle:** el JS pesa 710 KB (213 KB gzip). Funciona, pero
      conviene `manualChunks` o `import()` dinámico para las páginas pesadas.
- [ ] **FOOTBALL_DATA_API_KEY:** para que el botón "Sincronizar marcadores"
      del admin funcione, hay que crear una API key gratis en
      football-data.org y cargarla como env var en Render. Mientras tanto los
      resultados se cargan a mano (ya funciona).

---

## Checklist rápido para difundir

- [ ] Sprint 0 completo (re-registro + admin + redeploy + prueba e2e)
- [ ] Sprint 1 resuelto (arreglar o esconder goleadores)
- [ ] Sprint 2 puede quedar para después del 11 de junio
- [ ] Sprint 3 es todo opcional
