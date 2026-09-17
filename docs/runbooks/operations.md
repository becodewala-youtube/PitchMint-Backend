# Operational Runbook

## Local Development
```bash
npm run dev
```

## Production Build & Start
```bash
npm run build
npm start
```

## Seeding Database
```bash
npx tsx scripts/seed/seed-investors.ts
```

## Health Checks
- Root Check: `GET /`
- Dev Diagnostics: `GET /api/health`
