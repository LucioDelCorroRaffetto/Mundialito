# Plan de mejoras — Julio 2026

Surge de la revisión integral del 2026-07-02 (seguridad, backend, frontend,
animaciones, identidad visual y features). Se ejecuta **una sesión por vez**,
en orden. Cada sesión es autocontenida: rama propia (o main si es solo docs),
deploy y validación antes de pasar a la siguiente.

**Contexto de calendario:** la final del Mundial es el **19 de julio de 2026**.
Las sesiones 2–4 dan valor durante la fase eliminatoria (cuanto antes, mejor);
el Wrapped (sesiones 5–6) tiene fecha límite dura: debe estar en prod **antes
de la final**.

Estados: ⬜ pendiente · 🔄 en curso · ✅ hecha · ⏭️ salteada

---

## ⬜ Sesión 1 — Seguridad: refresh tokens + headers

**Objetivo:** que un refresh token robado deje de valer 30 días irrevocables.

- [ ] Tabla `refresh_tokens` (id, userId, tokenHash SHA-256, expiresAt,
      revokedAt, createdAt) + migración Drizzle.
- [ ] `POST /auth/refresh`: validar contra la tabla, **rotar** (invalidar el
      usado, emitir uno nuevo) y rechazar tokens revocados/reusados.
      El reuso de un token rotado revoca toda la familia (señal de robo).
- [ ] Revocación en: logout (nuevo endpoint o el existente), delete-account
      y (si existe) cambio de contraseña.
- [ ] Login/register/google: persistir el hash al emitir.
- [ ] `app.use(helmet())` en la API (`packages/api/src/app.ts`).
- [ ] CSP + security headers del frontend vía `vercel.json` (headers).
- [ ] bcrypt `ROUNDS` 10 → 12 (`packages/api/src/lib/password.ts`).

**Archivos:** `packages/api/src/routes/auth/**`, `db/schema`, `app.ts`,
`lib/jwt.ts`, `lib/password.ts`, `vercel.json`.
**DoD:** refresh viejo rechazado tras logout; sesión normal no se corta
(access 1h sigue igual); headers visibles en prod (curl -I); tests de
rotación/reuso en vitest.
**Riesgo:** usuarios logueados al deployar — aceptar en la primera validación
el refresh JWT legacy (sin registro en DB) y registrarlo al rotar, para no
desloguear a todos.

---

## ⬜ Sesión 2 — En vivo: celebración de acierto + leaderboard animado

**Objetivo:** que el momento emocional de la app (acertar en vivo) se sienta.

- [ ] **Celebración**: cuando un pronóstico propio pasa a exacto/acertado
      durante un partido live, burst de confetti + check animado (respetando
      `useMotionPrefs().reduced` → solo fade). Detectar la transición en el
      polling existente de matches live (comparar estado anterior vs nuevo
      en el hook, no en el server).
- [ ] **Leaderboard animado**: `LayoutGroup` + prop `layout` de framer-motion
      en las filas de leaderboard y league-detail para que los cambios de
      posición se deslicen en vez de saltar.
- [ ] **Contadores animados**: count-up en puntos/XP al montar
      (`animate()` de framer, ~600ms, skip si reduced).

**Archivos:** `src/pages/leaderboard.tsx`, `league-detail.tsx`,
`match-detail.tsx`, `src/shared/hooks/use-matches.ts` (o donde viva el
polling), `src/shared/lib/motion.ts` (nuevos helpers).
**DoD:** validado en un partido en vivo real (hay partidos casi todos los
días hasta el 14/7); reduce-motion degrada bien; sin jank en mobile.

---

## ⬜ Sesión 3 — Social: evolución de posiciones + head-to-head

**Objetivo:** darle tema de conversación a las ligas durante la eliminatoria.

- [ ] **Gráfico de evolución**: línea por miembro (posición o puntos por
      jornada/día de partido) en league-detail. Los datos salen del historial
      de puntos existente; endpoint nuevo solo si el shape actual no alcanza.
      SVG propio o lib liviana — evitar sumar una charting lib pesada.
- [ ] **Head-to-head**: vista comparativa de dos usuarios partido a partido
      (mis pronósticos vs los del otro, diferencial de puntos acumulado).
      Ya existe `/u/:userId/predictions`; falta la vista lado a lado.
      Entrada: botón "Comparar" en el perfil público y en la tabla de liga.

**Archivos:** `src/pages/league-detail.tsx`, nueva
`src/pages/head-to-head.tsx` (+ ruta), `packages/api/src/routes/leagues/`
o `users/` si hace falta endpoint.
**DoD:** gráfico legible con 8+ miembros en mobile; H2H navegable desde liga
y perfil; respeta ocultamiento de pronósticos no revelados (partidos futuros).

---

## ⬜ Sesión 4 — Social: reacciones por liga

**Objetivo:** el 80% del valor del chat sin moderación ni infraestructura.

- [ ] Emoji reactions (set fijo: 😂 🔥 💀 🎯 🤡 ⚽) sobre pronósticos ajenos
      **ya revelados** (partido arrancado o terminado).
- [ ] Tabla `prediction_reactions` (predictionId, userId, emoji, createdAt;
      unique por predictionId+userId+emoji, toggle on/off).
- [ ] Contadores agregados en las filas de pronósticos de la liga; animación
      pop al reaccionar (springSnappy).
- [ ] Notificación push opcional "X reaccionó a tu pronóstico" (reusar
      infra de push existente; respetar preferencias de notificaciones).

**Archivos:** `packages/api/src/routes/predictions/` (+ schema + migración),
`src/shared/components/prediction-history-row.tsx`, hooks nuevos.
**DoD:** no se puede reaccionar a pronósticos no revelados (validado
server-side); toggle idempotente; funciona en la vista de liga y en H2H.

---

## ⬜ Sesión 5 — Wrapped (backend + datos) ⏰ deadline 19/7

**Objetivo:** "Mundialito Wrapped" por usuario para el cierre del torneo.

- [ ] Endpoint `GET /users/me/wrapped` (o snapshot precalculado post-final)
      con: puntos totales y posición final (global y por liga), mejor acierto
      (exacto más improbable según forecast), racha más larga, rival más
      cercano (menor diferencial), equipo más pronosticado, % de aciertos,
      logros destacados, evolución de posición.
- [ ] Definir qué se calcula on-the-fly vs se materializa (el forecast cache
      ya existe; el Wrapped se consulta una vez por usuario — on-the-fly con
      cache in-memory probablemente alcanza).
- [ ] Gate: disponible recién cuando el torneo esté finalizado (o feature
      flag para probar antes con datos parciales).

**Archivos:** `packages/api/src/routes/users/` o ruta nueva `wrapped/`,
`services/` para el cálculo, tests de los agregados.
**DoD:** payload completo y correcto para un usuario real con datos del
torneo actual; tests de cada métrica con fixtures.

---

## ⬜ Sesión 6 — Wrapped (frontend + share) ⏰ deadline 19/7

- [ ] Vista `/wrapped`: secuencia de cards full-screen animadas (stagger +
      slideUp existentes), una métrica por card, navegación por tap/swipe.
- [ ] Imagen compartible (canvas u og-image por usuario) + integración con
      el share-sheet existente → WhatsApp.
- [ ] Entrada destacada en home cuando el torneo termina (banner reusando
      el patrón de knockout-phase-banner).
- [ ] Push "Tu Wrapped está listo" post-final (job del worker).

**Archivos:** `src/pages/wrapped.tsx` (+ ruta lazy), `share-sheet.tsx`,
`packages/worker/jobs/`.
**DoD:** flujo completo en el celular: push → wrapped → compartir imagen a
WhatsApp con preview correcto. **En prod antes del 19/7.**

---

## ⬜ Sesión 7 — Identidad: fuentes, logo, og:image

**Objetivo:** menos peso, render consistente, mejor preview al compartir.

- [ ] **og:image + Twitter card** en `index.html` (la app se comparte por
      WhatsApp — el preview del link es marketing gratis). Imagen estática
      1200×630 con el escudo.
- [ ] **Consolidar fuentes**: bajar de 4 familias a 3 (Inter + Russo One +
      una display; Oswald y Space Grotesk se pisan — elegir una mirando
      dónde se usa cada una).
- [ ] **Self-host con @fontsource**: eliminar Google Fonts (privacidad, un
      preconnect menos, cache inmutable de Vite).
- [ ] **Logo autocontenido**: convertir `<text>★</text>` y el wordmark de
      `logo.tsx` a paths SVG para que el escudo se vea igual sin fuentes
      cargadas (favicon, apple-touch-icon, og:image, primer render).
      Regenerar favicon.svg y apple-touch-icon.png desde la versión nueva.

**Archivos:** `index.html`, `package.json`, `src/index.css`,
`src/shared/components/logo.tsx`, `public/`.
**DoD:** Lighthouse sin regresión (idealmente mejora en LCP); preview de
link correcto en WhatsApp; logo idéntico con fuentes deshabilitadas.

---

## ⬜ Sesión 8 — Backlog técnico menor

Sin urgencia; barrer en una sesión corta o intercalar.

- [ ] Lock de solapamiento en `POST /sync` (flag in-memory → 429 al tick
      concurrente; hoy solo squads tiene cooldown).
- [ ] Rate limit genérico laxo por IP para el resto de la API (forecast,
      leaderboard) — hoy solo auth está limitado.
- [ ] `--bg-elevated` modo claro: 0.02 → 0.04 (casi invisible sobre blanco).
- [ ] Evaluar tinte sutil del acento en `--bg-deep` (3-4%) para que el theme
      se sienta en toda la pantalla.
- [ ] Evaluar `is_admin` en DB en lugar de `ADMIN_USER_IDS` env (hoy agregar
      admin = redeploy).
- [ ] Evaluar refresh token en cookie httpOnly (invasivo; la CSP de la
      sesión 1 ya mitiga el grueso del riesgo XSS de localStorage).

---

## Registro de sesiones

| Fecha | Sesión | Resultado |
|-------|--------|-----------|
| — | — | — |
