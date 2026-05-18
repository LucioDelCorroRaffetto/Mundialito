# Mundialito

**El prode + fantasy del Mundial 2026 entre amigos. 100% gratis.**

PWA mobile-first para predecir resultados del Mundial 2026, armar ligas privadas con amigos y jugar al fantasy con los jugadores reales.

---

## Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Estado | Zustand persist + React-Query |
| Backend | Express 4 + TypeScript + Drizzle ORM |
| Base de datos | Turso (libSQL / SQLite distribuido) |
| Worker | Node.js + node-cron |
| Auth | JWT stateless (access 15min + refresh 30d) |
| Real-time | WebSocket (rooms por liga) |
| Push | Web Push API + VAPID |
| Deploy | Fly.io (API + Worker) + Vercel (Frontend) |

---

## Desarrollo local

### Prerequisitos
- Node.js 22+
- Una base de datos Turso (gratis en [turso.tech](https://turso.tech)) o SQLite local

### 1. Clonar e instalar
```bash
git clone https://github.com/tu-usuario/mundialito.git
cd mundialito
npm install          # instala dependencias del frontend
cd packages/api && npm install
cd ../worker && npm install
```

### 2. Variables de entorno
```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Seed de la base de datos
```bash
cd packages/api
npm run db:push      # crea las tablas
npm run db:seed      # carga equipos, partidos y jugadores
```

### 4. Levantar todo
```bash
# Terminal 1 — API
cd packages/api && npm run dev

# Terminal 2 — Worker
cd packages/worker && npm run dev

# Terminal 3 — Frontend
npm run dev
```

Abrir [http://localhost:5174](http://localhost:5174)

---

## Features

### Prode (predicciones)
- Predecir resultado exacto de cada partido
- Puntuacion: exacto=5pts, diff+ganador=3pts, ganador=1pt, empate=1pt
- Predicciones de torneo: campeon, finalista, goleador, revelacion (+pts bonus)
- Lock automatico 1h antes del partido
- Goleadores picker (+2pts c/u, hasta 2 por equipo)

### Ligas
- Crear ligas privadas con codigo de invitacion
- Unirse con codigo o link profundo `/j/:code`
- Tabla de posiciones en tiempo real
- Buscar ligas publicas
- "Stakes meme" — la apuesta entre amigos

### Fantasy
- Armar equipo de 15 jugadores (2 GK + 5 DEF + 5 MID + 3 FWD)
- Seleccionar 11 titulares + capitan/vicecapitan
- Jugadores reales de las 48 selecciones del Mundial 2026
- Puntos por goles, asistencias, vallas invictas (proximamente)

### Real-time
- WebSocket por liga (actualizaciones de marcador en vivo)
- Push notifications (deadline, resultado, tabla)

### PWA
- Instalable en iOS/Android
- Service Worker con cache offline
- Push notifications nativas

---

## Deploy

Ver [fly.deploy.md](fly.deploy.md) y [vercel.md](vercel.md).

### Secrets necesarios

| Variable | Donde |
|----------|-------|
| `FLY_API_TOKEN` | GitHub Secrets |
| `VERCEL_TOKEN` | GitHub Secrets |
| `VERCEL_ORG_ID` | GitHub Secrets |
| `VERCEL_PROJECT_ID` | GitHub Secrets |
| `VITE_API_URL` | GitHub Secrets + Vercel Env |
| `VITE_WS_URL` | GitHub Secrets + Vercel Env |

---

## Estructura del proyecto

```
mundialito/
├── src/                    # Frontend React
│   ├── app/                # Router + Providers
│   ├── pages/              # Paginas por ruta
│   └── shared/             # Componentes, hooks, stores, tipos
├── packages/
│   ├── api/                # Express API
│   │   └── src/
│   │       ├── db/         # Schema Drizzle + client Turso
│   │       ├── routes/     # Endpoints REST
│   │       ├── middleware/  # Auth, validate, error
│   │       ├── lib/        # JWT, scoring, push-sender
│   │       └── ws/         # WebSocket server
│   └── worker/             # Proceso cron
│       └── src/
│           ├── db/         # Client Turso (propio)
│           └── jobs/       # finalize-match, poll-live, deadline-reminders
└── public/                 # Assets estaticos + sw-custom.js
```

---

## Roadmap

- [ ] Google OAuth
- [ ] API-Football integration (live scores automaticos)
- [ ] Achievements (20 logros)
- [ ] Head-to-head entre miembros de una liga
- [ ] Recap post-jornada
- [ ] Seed con fixture oficial FIFA 2026 (post-sorteo)
- [ ] App nativa (Capacitor) — post-Mundial

---

## Licencia

MIT — libre para uso personal y entre amigos.
