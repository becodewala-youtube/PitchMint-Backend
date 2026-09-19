# Backend Coding Conventions

- **TypeScript**: Strict mode is enabled. Avoid `any` (lint warns). Use proper types from `<feature>.types.ts` files.
- **Module system**: CommonJS (`"type": "commonjs"` in package.json). Use `import`/`export` syntax (transpiled by tsc).
- **Naming**:
  - Variables/functions: `camelCase`
  - Classes/interfaces: `PascalCase`
  - Files: `kebab-case.ts` with role suffix (e.g., `credit.controller.ts`, `credit.service.ts`, `credit.model.ts`)
- **Architecture**: Controllers handle HTTP request/response. Services handle business logic. Models define Mongoose schemas. Keep them separated.
- **Error handling**: Use Express error middleware (`src/shared/errors/`). Wrap async handlers properly. Never swallow errors silently.
- **Async patterns**: Use `async`/`await`. No raw callbacks.
- **Imports**: Use relative paths within the same module. Use relative paths to `src/shared/*` from modules.
- **Logging**: Use the Winston logger from `src/config/logger.ts`. Avoid `console.log` (lint warns, allows `console.warn`/`error`/`info`).
- **Testing**: Co-locate tests in `__tests__/` within each module. Use `mongodb-memory-server` for DB tests. Test config uses `tsconfig.test.json`.
- **Comments**: Document public APIs and complex business logic. Preserve existing comments.
