<div align="center">

<img src="public/logo.svg" alt="Mundialito" width="120" />

# 🏆 Mundialito

**El prode + fantasy del Mundial 2026 entre amigos. Gratis, sin publicidad.**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-mundialito--pi.vercel.app-ffc857?style=for-the-badge)](https://mundialito-pi.vercel.app)
[![Deploy](https://img.shields.io/github/deployments/LucioDelCorroRaffetto/Mundialito/production?label=Vercel&logo=vercel&style=flat-square)](https://mundialito-pi.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)

</div>

---

## ✨ ¿Qué es Mundialito?

Una PWA **mobile-first** para vivir el Mundial 2026 con tus amigos. Predecí resultados, armá tu fantasy team con jugadores reales, creá ligas privadas y competí en tiempo real.

🌐 **Producción:** [mundialito-pi.vercel.app](https://mundialito-pi.vercel.app) · API: [mundialito-d2jk.onrender.com](https://mundialito-d2jk.onrender.com)

> ⚽ **48 equipos · 104 partidos · Argentina campeón** (hay que creer)

---

## 🎮 Features

### 🔮 Prode (predicciones)
| Feature | Detalle |
|---------|---------|
| Resultado exacto | 5 pts — acertás el marcador exacto |
| Diferencia + ganador | 3 pts |
| Solo el ganador | 1 pt |
| Lock automático | 5 min antes del kickoff, sin trampas |
| Predicciones de torneo | Campeón · Finalista · Goleador · Revelación |
| Goleadores por partido | +2 pts c/u, hasta 2 por equipo |

### ⚽ Fantasy
- Armá tu equipo de **15 jugadores** (2 GK · 5 DEF · 5 MID · 3 FWD)
- Seleccioná **11 titulares** + capitán y vicecapitán
- Jugadores reales de las **48 selecciones** del Mundial 2026
- Puntos por goles, asistencias y vallas invictas

### 🏅 Ligas privadas
- Creá tu liga con un **código de invitación** o link directo `/j/:código`
- Tabla de posiciones en **tiempo real** (WebSocket)
- "Stakes" — la apuesta meme entre amigos
- Búsqueda de ligas públicas

### 🏆 Logros
- 20 logros desbloqueables (primera predicción, racha perfecta, etc.)
- Cada logro otorga **XP** (sube de nivel y desbloquea títulos) — no suma
  puntos al leaderboard, que se rige solo por aciertos de pronóstico

### 📱 PWA nativa
- Instalable en iOS y Android como app nativa
- Funciona offline (Service Worker con cache)
- Push notifications: deadline, resultado, tabla actualizada

---

## 🛠 Stack técnico

```
Frontend          React 18 · Vite · TypeScript · Tailwind CSS · Framer Motion
Estado            Zustand (persist) · TanStack Query
Backend           Express 4 · TypeScript · Drizzle ORM
Base de datos     Turso (libSQL / SQLite distribuido en el edge)
Auth              JWT stateless — access 15 min + refresh 30 días
Real-time         WebSocket (rooms por liga)
Push              Web Push API + VAPID
Worker            Cron en Render (cada 2 min: live scores · recordatorio diario)
Deploy            Render (API + Worker) · Vercel (Frontend)
```

---

## 🚀 Desarrollo local

### Prerequisitos
- Node.js 22+ (ver `.nvmrc` / `node -v` → v22)
- Cuenta en [Turso](https://turso.tech) (gratis) o SQLite local

### 1. Clonar e instalar

```bash
git clone https://github.com/LucioDelCorroRaffetto/Mundialito.git
cd Mundialito
npm install
cd packages/api && npm install
cd ../worker && npm install
```

### 2. Variables de entorno

Copiá `.env.example` y completá los valores. Las claves principales:

```bash
# Frontend (Vite)
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000

# API / Worker (Node.js) — Turso (libSQL)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# JWT — generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=change-me-access-secret-64-chars-minimum
JWT_REFRESH_SECRET=change-me-refresh-secret-64-chars-minimum

# Push (VAPID) — generar con: node packages/api/scripts/generate-vapid.mjs
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@mundialito.app
```

> Ver `.env.example` para el listado completo (CORS, Google OAuth, API-Football).

### 3. Base de datos

```bash
cd packages/api
npm run db:push      # crea las tablas
npm run db:seed      # equipos, partidos, jugadores y logros
```

### 4. Levantar todo

```bash
# Terminal 1 — API
cd packages/api && npm run dev

# Terminal 2 — Frontend  
npm run dev          # → http://localhost:5174
```

---

## 📁 Estructura del proyecto

```
Mundialito/
├── src/                        # Frontend React
│   ├── app/                    # Router + Providers (QueryClient, Auth)
│   ├── pages/                  # Una página por ruta
│   └── shared/
│       ├── components/         # UI reutilizable + layout
│       ├── hooks/              # TanStack Query hooks
│       ├── stores/             # Zustand (auth, settings)
│       ├── types/              # Tipos de la API
│       └── data/               # Datos estáticos (bracket, flags)
└── packages/
    ├── api/                    # Express REST API
    │   └── src/
    │       ├── db/             # Schema Drizzle + cliente Turso
    │       ├── routes/         # Endpoints REST por dominio
    │       ├── middleware/     # Auth JWT, validación, errores
    │       ├── lib/            # Scoring, JWT helpers, push sender
    │       └── ws/             # WebSocket server (rooms por liga)
    └── worker/                 # Cron en Render (live scores + recordatorios)
        └── src/                # run-once.js (cada 2 min) · run-daily.js
```

---

## 🗺 Roadmap

- [x] Prode con lock automático
- [x] Ligas privadas con WebSocket
- [x] Fantasy team builder
- [x] 20 logros que otorgan XP (niveles + títulos)
- [x] Cuadro de torneo visual (bracket con colores por ronda)
- [x] Leaderboard global + por liga
- [x] PWA instalable + push notifications
- [ ] Google OAuth
- [ ] Live scores automáticos (API-Football)
- [ ] Head-to-head entre miembros de una liga
- [ ] Trivia diaria del Mundial
- [ ] Recap post-jornada con estadísticas
- [ ] App nativa (Capacitor) — post-Mundial

---

## 📄 Licencia

MIT — libre para uso personal y entre amigos.

---

<div align="center">
Hecho con ❤️ para el Mundial 2026 🇦🇷
</div>
