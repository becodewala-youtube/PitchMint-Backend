# PitchMint Backend Context

## 1. Project Purpose
Backend API for PitchMint platform (pitchmint startup validation).

## 2. Technology Stack
Node.js, Express, TypeScript, Mongoose, JWT, Cloudinary, Razorpay.

## 3. Architecture
Feature-first modular architecture located in `src/modules/`.

## 4. Major Modules
auth, users, ideas, pitch-deck, pitch-simulator, competitors, investors, canvas, credits, payments, market-research, dashboard.

## 5. API Architecture
RESTful API, routing configured per module, consolidated in `src/server.ts`. Request flow: `Route -> Controller -> Service -> Model/Integration`.

## 6. Authentication
JWT-based authentication (bcryptjs for passwords).

## 7. Database
MongoDB via Mongoose.

## 8. External Integrations
Google Generative AI, Cloudinary (storage), Razorpay (payments), Nodemailer.

## 9. Testing & Deployment
- Deployment: Vercel (`vercel.json`), Docker (`Dockerfile`, `docker-compose.yml`).
- Testing: Jest (`tests/`).

## 10. Cross-Repository Relationship
PitchMint-Backend serves the PitchMint-frontend repository. It defines the REST API contract and authenticates requests from the frontend client.

```
Frontend -> API Contract -> Backend -> Database / External Services
```
