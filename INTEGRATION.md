# Integración Frontend ↔ Backend

Guía rápida para conectar el frontend de Mundialito con el backend (Sprint 2 ya implementado).

## Levantar el stack

### Backend (API en `packages/api/`)

```bash
cd packages/api
npm install
npm run dev
```

Por defecto escucha en `http://localhost:3000` y expone los endpoints bajo `/api/v1`.

### Frontend (root del repo)

```bash
npm install
npm run dev
```

Vite arranca normalmente en `http://localhost:5173`.

### Configuración de entorno

Copiar `.env.example` a `.env` en la raíz:

```bash
cp .env.example .env
```

Contenido:

```
VITE_API_URL=http://localhost:3000/api/v1
```

El `apiClient` (`src/shared/lib/api-client.ts`) lee `VITE_API_URL` y usa ese fallback si no está definido.

## Estado actual: hooks reales vs mock data

| Área         | Hook real disponible | Páginas usando mock todavía |
| ------------ | -------------------- | --------------------------- |
| Matches      | sí                   | sí (migración pendiente)    |
| Predictions  | sí                   | sí (migración pendiente)    |
| Auth         | sí                   | sí (migración pendiente)    |
| Leagues      | no (Sprint 3)        | sí                          |
| Standings    | no (Sprint 3)        | sí                          |

Los datos mock viven en `src/shared/data/mock.ts` y sus tipos (`Team`, `Match`, `Prediction`, `League`) son locales a ese módulo. Los tipos reales del API están en `src/shared/types/api.ts`. La migración mock → real se hará en sesión dedicada.

## Hooks disponibles

### Matches — `src/shared/hooks/use-matches.ts`

```tsx
import { useMatches, useMatch } from '@/shared/hooks/use-matches';

const { data, isLoading } = useMatches({ status: 'scheduled', limit: 10 });
const { data: match } = useMatch(matchId);
```

### Predictions — `src/shared/hooks/use-predictions.ts`

```tsx
import {
  useMyPredictions,
  useMyPredictionForMatch,
  useUpsertPrediction,
  useDeletePrediction,
} from '@/shared/hooks/use-predictions';

const { data } = useMyPredictions(leagueId);
const { data: mine } = useMyPredictionForMatch(matchId, leagueId);

const upsert = useUpsertPrediction();
upsert.mutate({ matchId, leagueId, homeScore: 2, awayScore: 1 });

const del = useDeletePrediction();
del.mutate(predictionId);
```

### Auth — `src/shared/hooks/use-auth.ts`

```tsx
import { useLogin, useRegister, useMe } from '@/shared/hooks/use-auth';

const login = useLogin();
login.mutate({ email, password });

const register = useRegister();
register.mutate({ email, username, password });

const { data: me } = useMe(); // solo se ejecuta si isAuthenticated
```

## Notas de comportamiento

- El interceptor de request inyecta `Authorization: Bearer <token>` desde `useAuthStore`.
- El interceptor de response, ante un `401`, hace logout y redirige a `/login`.
- `useLogin` / `useRegister` persisten el `accessToken` en el store y guardan el `refreshToken` en `localStorage` bajo `mundialito_refresh`.
- `useMyPredictionForMatch` no reintenta en `404` (caso normal cuando aún no hay pronóstico).
