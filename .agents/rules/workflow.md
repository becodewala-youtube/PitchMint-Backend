# Agent Workflow Rules

This document defines the standard PitchMint backend agent workflow for all current and future development.

## Standard Workflow

1. **Inspect current state**: Review current issues, errors, logs, and requirements.
2. **Check git status**: Always run `git status` to check active branch and uncommitted changes.
3. **Create a dedicated branch BEFORE implementation**: Never implement new work directly on `master` or `main`. Branch off the up-to-date base branch.
4. **Understand existing architecture**: Inspect relevant code in `src/modules/*` and `src/shared/*` before modifying files. Do not guess or resurrect deleted architectures.
5. **Make the smallest safe change**: Keep edits tightly scoped to the task. Avoid unnecessary abstractions or unrelated refactoring.
6. **Run targeted tests**: Run focused tests for modified modules during active development.
7. **Run full verification**: Execute type-check, lint, build, test suite, and audit.
8. **Review git diff**: Inspect `git diff` and `git diff --stat` to ensure changes are accurate and minimal.
9. **Clean temporary files**: Remove scratch scripts, temporary outputs, debug logs, and unused imports.
10. **Review changed/deleted/added files**: Verify with `git status` and `git diff --name-status`.
11. **Verify secrets and .gitignore**: Ensure `.env` and sensitive credentials are never tracked or committed.
12. **Prepare commit**: Follow conventional commit standards.
13. **Push branch**: Push only the dedicated branch to the remote repository.
14. **Prepare PR title**: Short, specific conventional title.
15. **Prepare PR description**: Detail what changed, why, testing performed, coverage, and limitations.
16. **Wait for human approval**: Await human review before merging unless explicitly instructed otherwise.

---

## Branch Naming Conventions

Use descriptive prefixes for all branches:

- `feature/<name>` — New capabilities or features
- `fix/<name>` — Bug fixes
- `refactor/<name>` — Code restructuring without behavioral changes
- `test/<name>` — Test suite improvements, coverage, or test infrastructure
- `chore/<name>` — Maintenance, configuration, dependencies
- `security/<name>` — Security hardening, audit remediations, vulnerability fixes

---

## Commit Message Format

Use clear conventional-style commits:

- `feat:` New user-facing feature or capability
- `fix:` Bug fix
- `refactor:` Code refactoring without changing public behavior
- `test:` Adding or updating tests
- `chore:` Dependency or build system updates
- `security:` Security hardening or vulnerability remediation
- `docs:` Documentation updates

Examples:
- `test(credits): add credit deduction and refund coverage`
- `security(auth): harden password reset flow`
- `refactor(payments): simplify webhook processing`

---

## Pull Request Guidelines

### PR Title Rule
Keep PR titles short, specific, and conventional.
- Example: `test(backend): add comprehensive unit test coverage`

### PR Description Rule
The PR description must explain:
- **WHAT** changed
- **WHY** it changed
- **HOW** it was tested
- **Coverage** achieved
- Any known limitations or operational notes
Do NOT write marketing language. Use `.github/pull_request_template.md`.

---

## Reusable Pre-Push Review Checklist

Before any future push, execute and verify all of the following steps:

1. `git status` — confirm clean working tree on the dedicated branch
2. `git diff --stat` — review modified line counts
3. `git diff --name-status` — inspect all added/modified/deleted files
4. Inspect all changed files for unintended edits
5. Check for secrets (passwords, tokens, private keys)
6. Check `.gitignore` (ensure `coverage/`, `.env`, log files are excluded)
7. Run Knip if installed (`npx knip`)
8. Run Madge if installed (`npx madge --circular src/`)
9. `npm run type-check`
10. `npm run lint`
11. `npm run build`
12. `npm test`
13. `npm audit`
14. Inspect final `git diff`
15. Verify temporary scripts/reports are absent

**Never claim "push ready" unless all relevant checks actually passed.**
