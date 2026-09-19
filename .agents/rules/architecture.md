# Backend Architecture Rules

## Module Structure (`src/modules/`)

Each business domain is a self-contained module. Current modules: `auth`, `users`, `ideas`, `credits`, `payments`, `pitch-deck`, `canvas`, `competitors`, `pitch-simulator`, `market-research`, `investors`, `dashboard`.

```
src/modules/<feature>/
  ├── <feature>.controller.ts   # HTTP request/response handling
  ├── <feature>.service.ts      # Business logic (some modules inline in controller)
  ├── <feature>.model.ts        # Mongoose schema/model (if feature owns data)
  ├── <feature>.types.ts        # TypeScript interfaces
  ├── <feature>.routes.ts       # Express router
  ├── <feature>.validator.ts    # express-validator rules (if present)
  └── __tests__/                # Co-located unit/integration tests
```

## Shared Layer (`src/shared/`)

- `middleware/` — auth, credit (check/deduct/refund), rate-limiter, sanitizer, upload
- `integrations/` — Gemini, Razorpay, Cloudinary, Email wrappers
- `errors/` — Error middleware
- `constants/` — Credit plan definitions
- `utils/` — Activity logger
- `migrations/` — Runtime data migration logic

## App Bootstrap (`src/`)

- `config/env.ts` — Typed env config (fatal on missing `JWT_SECRET`)
- `config/database.ts` — MongoDB connection
- `config/logger.ts` — Winston logger
- `app/app.ts` — Express setup: middleware ordering, CORS, route mounting, error handling
- `app/routes.ts` — Central route registration (all `/api/*` routes)
- `server.ts` — Entry point, DB connect, graceful shutdown

## Dependency Direction

- Modules depend on `src/shared/`, not on each other.
- Controllers handle HTTP and delegate to services. Services handle business logic.
- Don't bypass services for direct database interactions.

## Critical Constraints

- **Webhook raw body**: `/api/payment/webhook` uses `express.raw()` BEFORE `express.json()` in `app.ts`. This ordering is required for Razorpay signature verification. Never change it.
- **Middleware order in `app.ts`**: Raw body → CORS → helmet → JSON → sanitizer → rate limiters → routes → error handler. Do not reorder.
- **Route registration**: All module routes mount through `src/app/routes.ts`. Don't add routes directly to `app.ts`.

## Credit System Architecture

- **Dual-pool model**: Users have `monthlyCredits` (auto-reset monthly) + `purchasedCredits`. The virtual `user.credits` returns their sum.
- **Deductions**: MUST use `atomicDeductCredits()` from `src/shared/middleware/credit.middleware.ts`. Uses MongoDB aggregation pipeline for atomic cascading deduction (monthly first, purchased remainder). Includes automatic compensation rollback if ledger write fails.
- **Refunds**: MUST use `refundCredits()` from the same middleware. Returns credits to their exact originating pools. Uses `processedRefunds` array for idempotency.
- **Payment processing**: MUST use `processSuccessfulPayment()` from `src/modules/credits/credit.service.ts`. Uses `processedPayments` array + unique sparse index on `razorpayPaymentId` for idempotency. Includes P3 ledger desynchronization recovery.
- **Never** modify idempotency guards on payment/credit/refund flows.
- **Never** remove or rename `processedPayments`, `processedRefunds`, `monthlyCredits`, `purchasedCredits` fields on the User model — they are load-bearing for financial integrity.

## Database & Migrations

- MongoDB with Mongoose. No SQL.
- Migration scripts: `scripts/migrations/YYYYMMDD_description.ts` — must be idempotent with `up`/`down` procedures.
- Runtime migration logic: `src/shared/migrations/`.
- Never modify Mongoose schema field types, indexes, or unique constraints without a migration plan.

## Security

- Never bypass `auth.middleware.ts` on protected routes.
- Never remove or weaken rate limiters (`apiLimiter`, `authLimiter`).
- Never alter Razorpay webhook signature verification.
- Never remove `express-mongo-sanitize` middleware.
- Never log full request bodies containing passwords or tokens.
