# PitchMint Database Schemas

## Database Engine: MongoDB (Mongoose ODM)

### Collections & Models

1. **`users` (`User`)**
   - Fields: `name`, `email`, `password`, `profilePicture`, `isPremium`, `credits`, `lastCreditReset`, `plan`, `isEmailVerified`, `emailVerificationToken`, `emailVerificationExpires`, `passwordResetToken`, `passwordResetExpires`, `googleId`, `authProvider`, `savedIdeas`, `createdAt`.

2. **`ideas` (`Idea`)**
   - Fields: `userId`, `ideaText`, `marketDemandScore`, `competitionScore`, `monetizationFeasibilityScore`, `overallScore`, `analysis`, `pitchDeckContent`, `canvasContent`, `competitorAnalysis`, `pitchSimulation`, `collaborativeData`, `createdAt`.

3. **`credittransactions` (`CreditTransaction`)**
   - Fields: `userId`, `type` (purchase | usage | refund | bonus), `amount`, `description`, `relatedService`, `razorpayPaymentId`, `razorpayOrderId`, `createdAt`.

4. **`investors` (`Investor`)**
   - Fields: `name`, `industryFocus`, `contactLink`, `type` (VC | Angel | Incubator | Accelerator), `description`, `location`, `investmentRange`, `createdAt`.

5. **`activityhistories` (`ActivityHistory`)**
   - Fields: `userId`, `serviceType`, `title`, `description`, `data`, `creditsUsed`, `relatedIdeaId`, `createdAt`.
