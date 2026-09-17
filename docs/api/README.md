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

### Ideas (`/api/idea`)
- `POST /submit`: Submit and validate idea with Gemini AI
- `GET /saved`: Get all saved ideas for the current user
- `GET /:id`: Fetch idea by ID
- `DELETE /:id`: Delete saved idea

### Pitch Deck (`/api/pitchdeck`)
- `POST /:id`: Generate pitch deck for an idea
- `PUT /:id`: Regenerate pitch deck for an idea
- `POST /talking-points/:id`: Generate talking points for a slide
- `PUT /collaborative/:id/slide`: Update slide content
- `POST /collaborative/:id/comment`: Add comment to pitch deck
- `DELETE /collaborative/:id/comment/:commentId`: Delete comment
- `POST /voice-feedback/:id`: Process audio pitch practice

### Business Model Canvas (`/api/canvas`)
- `POST /:id`: Generate lean canvas
- `PUT /:id`: Regenerate lean canvas

### Competitor Analysis (`/api/competitors`)
- `POST /analyze/:id`: Generate competitor analysis for saved idea
- `POST /analyze`: Generate competitor analysis for ad-hoc idea

### Pitch Simulator (`/api/pitch-simulator`)
- `POST /simulate/:id`: Generate investor Q&A questions for saved idea
- `POST /evaluate/:id`: Evaluate founder's answer
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
