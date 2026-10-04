### What Changed
- Added `.commitlintrc.json` and `.husky/commit-msg` to enforce Conventional Commits.
- Modified `.husky/pre-commit` to strictly run `lint-staged`.
- Deleted `.husky/pre-push` to defer heavy validation to GitHub Actions.
- Installed `@commitlint/cli` and `@commitlint/config-conventional` dependencies.
- Standardized concise `.github/pull_request_template.md`.

### Why It Changed
- Optimize the local developer feedback loop by eliminating redundant pre-push testing (tests are correctly gated on GitHub Actions instead).
- Make git workflow conventions mechanically enforceable to improve consistency.

### Testing Performed
- `npm run type-check` - 0 errors.
- `npm run test -- --runInBand` - 457/457 passed locally.
- Manually verified `commit-msg` hook correctly allows standard commits and rejects unformatted ones.

### Limitations
- Branch names are intentionally not mechanically enforced locally as per requirements, relying on developer discipline.
- GitHub branch protection requires manual verification in the repository settings.
