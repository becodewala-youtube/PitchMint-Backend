# Backend Project Rules

## Purpose

PitchMint is a SaaS startup validation platform. This backend is a REST API serving AI-powered features (idea validation, pitch deck, canvas, competitor analysis, pitch simulation, market research, investor matching) with Razorpay payments, Gemini AI, and a dual-pool credit system.

## General Rules

- **Understand before modifying**: Inspect relevant code in `src/modules/*` and `src/shared/*` first.
- **Preserve existing architecture**: Feature-first modular structure (`src/modules/*`). Don't flatten or restructure.
- **Reuse existing components**: Use `src/shared/*` middleware, integrations, and utilities.
- **Avoid unnecessary refactoring**: Keep changes scoped to the feature being modified. Don't rewrite working code.
- **Check dependencies**: Check `package.json` before installing new packages.
- **Protect secrets**: Never commit `.env` or hardcode secrets. All env vars go through `src/config/env.ts`.
- **New env vars**: Must be added to both `src/config/env.ts` AND `.env.example`.
- **Follow existing patterns**: Controllers → Services → Models. Don't bypass services for database access.
- **Documentation**: Update `docs/` when making significant architecture changes.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type-check | `npm run type-check` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Tests | `npm test` |

## Verification Before Done

1. `npm run type-check` passes
2. `npm run build` produces clean output
3. `npm run lint` has no new errors
4. `npm test` passes; new behavior has tests
5. No changes to files outside the task scope
