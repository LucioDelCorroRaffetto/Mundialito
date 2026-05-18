# Deploy to Fly.io

## Prerequisites
- `fly` CLI installed (`brew install flyctl` or https://fly.io/docs/flyctl/)
- Turso account with a database created
- VAPID keys generated (see below)

## First-time setup

### 1. Generate VAPID keys
```bash
cd packages/api
node scripts/generate-vapid.mjs
```
Copy the output to your Fly.io secrets (step 3).

### 2. Create Fly.io apps
```bash
cd packages/api
fly apps create mundialito-api

cd ../worker
fly apps create mundialito-worker
```

### 3. Set secrets (API)
```bash
cd packages/api
fly secrets set \
  TURSO_DATABASE_URL="libsql://your-db.turso.io" \
  TURSO_AUTH_TOKEN="your-token" \
  JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")" \
  JWT_REFRESH_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")" \
  VAPID_PUBLIC_KEY="your-public-key" \
  VAPID_PRIVATE_KEY="your-private-key" \
  VAPID_SUBJECT="mailto:you@example.com" \
  GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
```

### 4. Set secrets (Worker)
```bash
cd packages/worker
fly secrets set \
  TURSO_DATABASE_URL="libsql://your-db.turso.io" \
  TURSO_AUTH_TOKEN="your-token" \
  VAPID_PUBLIC_KEY="your-public-key" \
  VAPID_PRIVATE_KEY="your-private-key" \
  VAPID_SUBJECT="mailto:you@example.com" \
  API_FOOTBALL_KEY="your-api-football-key"
```

### 5. Deploy
```bash
cd packages/api && fly deploy
cd ../worker && fly deploy
```

### 6. Run seed
```bash
cd packages/api
fly ssh console -C "node dist/scripts/seed.js"
```
Or locally with production env:
```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:seed
```

## Subsequent deploys
```bash
cd packages/api && fly deploy
cd packages/worker && fly deploy
```

## Frontend
See vercel.md for Vercel deployment.
