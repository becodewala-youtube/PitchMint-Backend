# ADR-001: Feature-First Backend Architecture

Status: Accepted

Decision:
The backend architecture is structured around business features (`src/modules/`) rather than technical layers (e.g., separating all controllers from all services across the entire application).

Reason:
Not documented in the existing project.

Consequences:
- Features are self-contained, making it easier to locate domain-specific logic.
- Shared code must be carefully placed in `src/shared/` to prevent circular dependencies between feature modules.
