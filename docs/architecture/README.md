# PitchMint Backend Architecture

## Overview
PitchMint backend is architected as a **Feature-First Modular Monolith**. Instead of organizing by technical layers (`controllers/`, `routes/`, `models/`), code is grouped into high-cohesion domain modules with explicit boundaries.

```
                         server.ts (Entry Point)
                            │
                            ▼
                         app.ts (Bootstrap)
                            │
                     ┌──────┴──────┐
                     │             │
                  routes         config
                     │
                     ▼
                  modules (Feature Modules)
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
     auth          ideas         payments
       │             │              │
       ├─ routes     ├─ routes      ├─ routes
       ├─ controller ├─ controller  ├─ controller
       ├─ service    ├─ service     ├─ service
       ├─ model      ├─ model       ├─ webhook
       └─ types      └─ types       └─ types
                     │
                     ▼
                   shared (Cross-cutting)
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      middleware   errors    integrations
```

## Module Boundaries
Each module is encapsulated in `src/modules/<module-name>/`:
- `<module>.controller.ts`: HTTP request/response handling
- `<module>.service.ts`: Core business logic
- `<module>.routes.ts`: Express router definitions
- `<module>.validator.ts`: Request validation schemas
- `<module>.model.ts`: Mongoose schema and model
- `<module>.types.ts`: TypeScript interfaces and types
- `__tests__/`: Module-specific unit and integration tests

## Shared Components
Located in `src/shared/`:
- `middleware/`: Authentication, credit authorization, rate limiting, sanitization, file uploads
- `errors/`: Error classes and global error handlers
- `integrations/`: Third-party services (Gemini AI, Cloudinary, Razorpay, Email)
- `utils/`: Reusable utilities (activity logger)
- `constants/`: System-wide constants (credit plans)
