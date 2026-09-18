# Backend Project Rules

- **Understand before modifying**: Inspect relevant code, specifically `src/modules/*` first.
- **Preserve existing architecture**: PitchMint-Backend uses a feature-first modular architecture (`src/modules/*`).
- **Reuse existing components**: Use `src/shared/*` components and utilities.
- **Avoid unnecessary refactoring**: Keep changes scoped to the feature being modified.
- **Check dependencies**: Check `package.json` before installing new packages.
- **Protect secrets**: Never commit `.env` or hardcode secrets.
- **Follow existing patterns**: Adhere to the established controllers, services, routes pattern.
- **Verify changes**: Run `npm run type-check` and `npm run build` after modifications.
- **Documentation**: Update `docs/architecture` and `docs/api` when significant architecture changes occur.
