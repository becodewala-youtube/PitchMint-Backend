# Backend Coding Conventions

- **TypeScript**: Strict typing is required. Avoid `any`.
- **Naming**: Use `camelCase` for variables and functions. Use `PascalCase` for classes and interfaces.
- **File Naming**: Use `kebab-case` with `.ts` extensions (e.g., `user.controller.ts`, `user.service.ts`).
- **Architecture**: Controllers handle HTTP and route to Services. Services handle business logic and interact with integrations or databases.
- **Error Handling**: Use Express middleware for asynchronous errors, or specialized error classes.
- **Async Patterns**: Use async/await natively.
- **Imports**: Prefer absolute or relative paths aligned with existing module structures.
- **Comments**: Document public APIs and complex business logic.
