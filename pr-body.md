### What Changed
- Replaced 404 responses with a generic 200 success message in `forgotPassword`.
- Ensured token generation and email dispatch only occur internally for valid users.
- Redacted the submitted email address from the unknown account log to prevent storing PII.
- Updated unit tests to assert the generic response.

### Why It Changed
- The forgot-password endpoint previously leaked whether an email address was registered by returning 404, allowing account enumeration.

### Testing Performed
- `npm run test -- auth.controller.test.ts` - 34/34 tests passed.
- `npm run type-check` - passed.

### Limitations
- Users mistyping their email will not receive immediate feedback that the email was wrong.
