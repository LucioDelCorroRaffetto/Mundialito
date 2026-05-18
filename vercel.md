# Deploy Frontend to Vercel

## One-click deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

## Manual setup

### 1. Import repo to Vercel
Go to https://vercel.com/new → import your GitHub repo.

### 2. Configure project settings
- **Framework**: Vite (auto-detected)
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Node version**: 22.x

### 3. Set environment variables in Vercel dashboard
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://mundialito-api.fly.dev/api/v1` |
| `VITE_WS_URL` | `wss://mundialito-api.fly.dev` |

### 4. Deploy
Click "Deploy" — subsequent pushes to `main` auto-deploy.

## Custom domain (optional)
In Vercel dashboard → Settings → Domains → add your domain.
Then update `ALLOWED_ORIGINS` in the API's environment variables:
```
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:5174
```
