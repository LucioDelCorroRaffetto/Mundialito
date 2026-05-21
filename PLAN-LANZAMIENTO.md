# Plan de lanzamiento — Mundialito

Revisión y correcciones hechas el 2026-05-21. La base de datos fue limpiada de
usuarios y ligas. Datos de referencia intactos: 49 equipos, 104 partidos,
294 jugadores, 20 logros.

---

## ✅ Ya corregido (código)

- **DB limpia:** todos los usuarios, ligas y datos derivados borrados.
  Contadores reseteados → el próximo usuario será `id = 1`.
- **Selector de goleadores eliminado:** estaba roto (decía "guardado" pero no
  guardaba nada, y el cálculo de puntos nunca sumaba el +2). Se sacó del
  detalle de partido para que la app no mienta. Es una feature post-lanzamiento
  (ver Sprint futuro abajo).
- **Código muerto:** se borró `src/pages/placeholder.tsx` (no se usaba).
- Build de producción y TypeScript compilan sin errores.

---

## 🔴 LO QUE TENÉS QUE HACER VOS (no es código — son pasos en Render y la app)

Esto **bloquea el lanzamiento**. Sin esto la app queda sin admin.

### 1. Re-registrar tu cuenta PRIMERO
Entrá a la app y registrate antes que nadie. Vas a ser el usuario `id = 1`.

### 2. Configurar `ADMIN_USER_IDS` en Render
- Dashboard de Render → servicio de la API → pestaña **Environment**.
- Variable `ADMIN_USER_IDS` = `1` (tu nuevo id).
- Sin esto no ves la pestaña Admin ni podés cargar resultados.

### 3. Forzar un redeploy de la API en Render
- Los cambios recientes de la API (endpoint `/admin/sync-scores`, columna
  `tier` en logros, badges en standings) necesitan un deploy nuevo.
- El push a `main` ya lo dispara. Verificá en Render que el último deploy
  tomó el commit más reciente.

### 4. (Opcional) `FOOTBALL_DATA_API_KEY` en Render
- Para que el botón "Sincronizar marcadores" del admin funcione.
- Sacá una API key gratis en https://www.football-data.org/client/register
- Cargala como env var en Render.
- Mientras tanto, los resultados se cargan a mano desde el panel admin
  (ya funciona).

### 5. Prueba final (5 min, en el celular)
Registro → home → crear liga → hacer una predicción → ver tabla.
Que no haya errores rojos en consola (el de `play.google.com` es del
ad-blocker, ignoralo).

---

## 🟢 Pendiente NO bloqueante (para después del 11 de junio)

### Bracket de eliminatorias automático
Los 32 partidos de eliminatorias tienen equipos "Por definir". Hoy se llenan
a mano desde el panel admin (funciona). Auto-poblarlos desde la tabla de
grupos es una mejora de comodidad — no urge, la fase de grupos dura ~2 semanas.

### Planteles completos
Hoy hay 294 jugadores (~6 por equipo). Las listas oficiales de FIFA salen el
2 de junio. El fantasy ya está bloqueado hasta esa fecha. Cuando salgan, cargar
los 26 jugadores por selección.

### Feature de goleadores (re-hacerla bien algún día)
Si se quiere volver a tener "predecí los goleadores (+2 pts)", hace falta:
- Tabla para los goleadores REALES de cada partido.
- UI en el panel admin para cargar quién hizo los goles.
- Lógica de puntaje que compare predicho vs real.
- Arreglar `upsert-scorers.ts` / `get-scorers.ts` (siguen pidiendo `leagueId`,
  incompatible con predicciones globales).
Es un mini-proyecto, no un parche. Por eso se sacó para el lanzamiento.

---

## Checklist para difundir

- [ ] Paso 1 — re-registrarte
- [ ] Paso 2 — `ADMIN_USER_IDS=1` en Render
- [ ] Paso 3 — redeploy de la API
- [ ] Paso 5 — prueba e2e en el celular
- [ ] (Opcional) Paso 4 — football API key
- [ ] Listo para compartir el link 🚀
