# ADR 0001: Migration to Feature-First Modular Monolith Architecture

## Status
Accepted

## Context
The legacy codebase was structured as a flat layered architecture (`controllers/`, `routes/`, `models/`, `middleware/`, `utils/`), leading to tight cross-file coupling, low discoverability of feature domain boundaries, and lack of modular testing isolation.

## Decision
Refactor the codebase into a feature-first modular monolith:
- Domain modules inside `src/modules/<feature>/`
- Shared cross-cutting concerns in `src/shared/`
- Centralized configuration in `src/config/`
- Application bootstrap in `src/app/`
- Server lifecycle in `src/server.ts`
- E2E testing in `tests/e2e/` and unit testing inside modules

## Consequences
- Clean separation of business domains
- Easier code navigation and independent feature scalability
- Clear contract between shared utilities and business logic
- Preserved existing endpoints and database behaviors
