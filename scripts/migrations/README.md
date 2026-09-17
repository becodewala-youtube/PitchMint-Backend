# Database Migrations

Place MongoDB schema migration and data backfill scripts here.

## Guidelines
- Each migration should be idempotent.
- Name files chronologically: `YYYYMMDD_description.ts`.
- Always provide an `up` and `down` rollback procedure.
