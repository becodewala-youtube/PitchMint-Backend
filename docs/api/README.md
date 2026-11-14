# PitchMint API Documentation

## Base URL
- Development: `http://localhost:5000`
- Production: Configured via reverse proxy / cloud deployment

## Endpoints Summary

### Authentication (`/api/auth`)
- `POST /register`: Register new user
- `POST /verify-email`: Verify email with 6-digit token
- `POST /resend-verification`: Resend verification email
- `POST /signin`: Email & password login
- `POST /google`: Google OAuth token authentication
- `POST /forgot-password`: Send password reset email
- `POST /reset-password`: Reset password with token
- `GET /user`: Fetch authenticated user profile
- `PUT /user`: Update user profile details
- `POST /upload-avatar`: Upload profile picture to Cloudinary

### Idempotency & Credit Safety (`API-02`)
- **Header:** `Idempotency-Key` (or `x-idempotency-key`)
- **TTL & Retention Policy:**
  - The 24-hour retention period applies strictly to terminal records (`completed` and `failed`) via an `expiresAt` TTL index (`expireAfterSeconds: 0`).
  - Active operations (`in_progress`) have no `expiresAt` timestamp and **never automatically expire**, ensuring in-flight mutual exclusion and crash protection are maintained.
  - When a `failed` record is claimed for a retry, its `expiresAt` is removed (`$unset`) so it remains protected while the retry executes.
  - When that retry completes or genuinely fails, a fresh 24-hour expiration window begins from that terminal timestamp.
- **Crash Recovery & Client Key Invariant:**
  - If an ungraceful server crash or process termination occurs mid-flight, the record safely remains `in_progress` in MongoDB.
  - **A client must NEVER create a new idempotency key just to bypass an ambiguous or in-progress previous operation.** Reissuing a request with a new key could trigger duplicate credit burns and side effects if the original operation already succeeded or partially completed.
  - While a record remains `in_progress`, duplicate requests with that key will return HTTP 409 Conflict without re-executing the handler.
  - Resolving an `in_progress` operation stuck due to an ungraceful host process crash may require administrative inspection and safe manual intervention.
- **Supported Operations:**
  - `POST /api/idea/submit`
  - `POST /api/pitchdeck/:id` and `PUT /api/pitchdeck/:id`
  - `POST /api/canvas/:id` and `PUT /api/canvas/:id`
  - `POST /api/competitors/analyze/:id`
  - `POST /api/pitch-simulator/simulate/:id`
- **Behavior:**
  - On new key: atomically records `in_progress` status (without expiry) in MongoDB and proceeds with credit deduction and AI execution.
  - On duplicate key:
    - If `completed`: returns cached HTTP status code and response payload immediately (0 credits deducted).
    - If `in_progress`: returns HTTP 409 Conflict ("Request currently in progress. Please retry shortly.").
    - If `failed`: allows clean retry by atomically transitioning record back to `in_progress` (and unsetting `expiresAt`) ONLY if request identity matches. Rejects identity mismatches with HTTP 409 Conflict without modifying the record.

### Ideas (`/api/idea`)
- `POST /submit`: Submit and validate idea with Gemini AI (1 credit, supports `Idempotency-Key`)
- `GET /saved`: Get paginated saved ideas for current user
  - Query parameters:
    - `page` (number, default `1`)
    - `limit` (number, default `10`, max `50`)
    - `search` (string, case-insensitive regex match on `ideaText` with safe regex escaping)
    - `filter` (`'all' | 'top' | 'deck' | 'none'`, default `'all'`)
    - `sortBy` (`'createdAt' | 'overallScore'`, default `'createdAt'`)
    - `sortOrder` (`'desc' | 'asc'`, default `'desc'`)
  - Response envelope: `{ success: true, ideas, totalPages, currentPage, total }`
- `GET /:id`: Fetch idea by ID
- `DELETE /:id`: Delete saved idea (enforces ownership 403, permanently removes embedded subdocuments and pulls from `User.savedIdeas`)

### Pitch Deck (`/api/pitchdeck`)
- `POST /:id`: Generate 10-slide pitch deck (1 credit, supports `Idempotency-Key`)
- `PUT /:id`: Regenerate 10-slide pitch deck (1 credit, supports `Idempotency-Key`)
- `POST /talking-points/:id`: Generate talking points for a slide
- `PUT /collaborative/:id/slide`: Update slide content
- `POST /collaborative/:id/comment`: Add comment to pitch deck
- `DELETE /collaborative/:id/comment/:commentId`: Delete comment
- `POST /voice-feedback/:id`: Process audio pitch practice

### Business Model Canvas (`/api/canvas`)
- `POST /:id`: Generate 9-block lean canvas (1 credit, supports `Idempotency-Key`)
- `PUT /:id`: Regenerate 9-block lean canvas (1 credit, supports `Idempotency-Key`)

### Competitor Analysis (`/api/competitors`)
- `POST /analyze/:id`: Generate competitor analysis for saved idea (1 credit on new/regenerate, 0 credits if returning cached; supports `Idempotency-Key`)
- `POST /analyze`: Generate competitor analysis for ad-hoc idea

### Pitch Simulator (`/api/pitch-simulator`)
- `POST /simulate/:id`: Generate 5 investor Q&A questions for saved idea (1 credit on new/regenerate, 0 credits if returning cached; supports `Idempotency-Key`)
- `POST /evaluate/:id`: Evaluate founder's answer (**0 credits / free**, stores rating, strengths, improvements, advice)
- `POST /simulate`: Ad-hoc pitch simulation
- `POST /evaluate`: Ad-hoc answer evaluation

### Investor Match (`/api/investors`)
- `GET /`: List all investors with filtering
- `GET /:id`: Get investor details
- `POST /match`: AI-powered investor matchmaking

### Credits & Plans (`/api/credits`)
- `GET /plans`: List credit purchasing plans
- `GET /history`: Credit transaction history
- `GET /balance`: Current user credit balance
- `POST /purchase`: Create Razorpay order for credits
- `POST /verify-payment`: Verify Razorpay signature and add credits
- `POST /simulate-payment-success`: Development demo purchase

### Payments & Upgrades (`/api/payment`)
- `POST /create-checkout-session`: Create Razorpay order for premium
- `POST /verify-premium`: Verify premium upgrade payment
- `POST /webhook`: Razorpay webhook for payments

### Dashboard & Activity History (`/api/history`)
- `GET /`: Get paginated activity history with serviceType filtering
