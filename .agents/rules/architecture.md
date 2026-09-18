# Backend Architecture Rules

- **Modular Design**: Code is split by feature in `src/modules/` (e.g., auth, users, ideas).
- **Dependency Direction**: Modules should depend on `src/shared/`, not deeply inter-depend on each other.
- **Responsibilities**: 
  - `controllers`: HTTP request/response handling.
  - `services`: Business logic and data manipulation.
  - `routes`: Express route definitions.
- **Shared Code Boundaries**: `src/shared/` contains integrations (e.g., gemini) and common logic.
- **API Boundaries**: Maintain RESTful patterns in controllers. Do not bypass services for database interactions.
