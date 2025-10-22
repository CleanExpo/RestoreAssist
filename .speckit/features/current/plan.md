# Implementation Plan: Fix Google OAuth Authentication

**Feature ID:** fix-oauth-authentication
**Created:** 2025-01-22
**Status:** Design Complete
**Priority:** P0 (Critical)

## Executive Summary

This plan addresses critical authentication failures blocking 100% of user onboarding. The fix targets Google OAuth configuration issues, error handling improvements, and validates the recent cookie consent backdrop fix. Implementation is structured in 4 phases over 3-5 days with comprehensive testing gates.

**Key Objectives:**
1. Restore Google OAuth authentication flow (95% success rate target)
2. Implement user-friendly error recovery mechanisms
3. Validate single-click button activation fix
4. Integrate trial activation with fraud detection
5. Establish comprehensive monitoring and logging

**Success Metrics:**
- Authentication success rate: ≥95%
- Time to complete sign-in: <7 seconds
- Error recovery rate: ≥80%
- First-click button activation: 100%
- Support ticket reduction: ≥70%

## Technical Context

### Existing Architecture

**Frontend Stack:**
- React 18.2 with TypeScript 5.3
- Vite build tool and dev server (http://localhost:5173)
- TailwindCSS 4.1 for styling
- `@react-oauth/google` v0.12+ for OAuth integration
- React Router for navigation
- Radix UI components

**Backend Stack:**
- Node.js 20+ with Express.js
- TypeScript 5.3
- PostgreSQL with Prisma ORM (currently using in-memory fallback)
- JWT authentication with refresh tokens
- Sentry for error monitoring

**Authentication Flow:**
```
Landing Page → Google OAuth Button Click
    ↓
Google Consent Screen (popup)
    ↓
OAuth Callback → Backend /api/auth/google
    ↓
JWT Token Generation → Session Cookie
    ↓
Trial Activation (fraud detection check)
    ↓
Dashboard Redirect
```

**Current Issues:**
1. OAuth initialization error: "[GSI_LOGGER]: The given origin is not allowed for the given client ID"
2. Google Cloud Console propagation delay (5-15 minutes)
3. Browser caching of OAuth configuration
4. Environment variable precedence (.env vs .env.local)
5. Cookie consent backdrop previously blocked clicks (fixed in commit 91d2b8d)

### Technology Decisions

**OAuth Library:** `@react-oauth/google` v0.12+
- **Rationale:** Industry-standard React wrapper for Google Identity Services
- **Alternatives:** react-google-login (deprecated), custom implementation
- **Decision:** Keep existing library, add configuration validation layer

**Error Handling:** Custom error mapping with retry logic
- **Rationale:** Technical OAuth errors confuse end users
- **Implementation:** Map OAuth error codes to user-friendly messages with actionable steps

**Monitoring:** Sentry + Custom Metrics
- **Rationale:** Need both error tracking and success rate analytics
- **Implementation:** Log all auth attempts with outcomes, track in Sentry

**Session Management:** JWT with httpOnly cookies
- **Rationale:** Secure token storage, CSRF protection
- **Implementation:** Existing JWT service, add refresh token rotation

### File Structure

```
packages/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CookieConsent.tsx (validate fix)
│   │   │   ├── AuthButton.tsx (new)
│   │   │   └── ErrorMessage.tsx (new)
│   │   ├── hooks/
│   │   │   ├── useGoogleAuth.ts (new)
│   │   │   └── useRetry.ts (new)
│   │   ├── services/
│   │   │   └── authService.ts (enhance)
│   │   ├── utils/
│   │   │   ├── oauthErrorMapper.ts (new)
│   │   │   └── configValidator.ts (new)
│   │   └── pages/
│   │       └── LandingPage.tsx (update)
│   └── .env (verify CLIENT_ID)
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── authRoutes.ts (enhance)
│   │   ├── services/
│   │   │   ├── freeTrialService.ts (integrate)
│   │   │   └── authService.ts (add retry logic)
│   │   ├── middleware/
│   │   │   ├── validateEnv.ts (new)
│   │   │   └── rateLimiter.ts (enhance)
│   │   └── utils/
│   │       └── errorLogger.ts (enhance)
│   ├── .env (deprecate)
│   └── .env.local (primary config)
└── tests/
    └── e2e-claude/
        └── auth/
            ├── oauth-flow.spec.ts (new)
            ├── error-handling.spec.ts (new)
            └── button-clicks.spec.ts (validate fix)
```

### Dependencies

**External Services:**
- Google OAuth 2.0 API (must be configured in Google Cloud Console)
- Sentry (error monitoring)
- PostgreSQL / In-memory storage

**Internal Services:**
- Free Trial Service (`src/services/freeTrialService.ts`)
- JWT Service (session tokens)
- Email Service (future: password reset)

**Configuration Requirements:**
- GOOGLE_CLIENT_ID (frontend .env)
- GOOGLE_CLIENT_SECRET (backend .env.local)
- GOOGLE_REDIRECT_URI (backend .env.local)
- JWT_SECRET, JWT_REFRESH_SECRET (backend .env.local)

## Constitution Check

### Principle 1: User-Centric Design ✅

**Alignment:**
- Single-click button activation addresses frustration
- Error messages use plain language, avoid jargon
- Retry mechanisms reduce user effort
- Clear feedback during authentication flow
- Mobile-responsive OAuth popup flow

**Validation:**
- Playwright tests verify single-click activation
- Error message content reviewed for clarity
- Mobile device testing on iOS Safari, Chrome Mobile
- Task completion time measured (target: <7s)

### Principle 2: NCC 2022 Compliance ✅

**Alignment:**
- N/A for authentication feature (no building code implications)
- Authentication enables access to compliance-generating features

**Validation:**
- Not applicable to this feature

### Principle 3: Performance First ✅

**Alignment:**
- OAuth init completes within 2 seconds (constitution requirement: TTI <3s)
- Total auth flow <7 seconds (includes network round-trips)
- Retry logic uses exponential backoff (prevents server overload)
- No blocking UI operations (loading indicators during retries)
- Minimal bundle size impact (<5KB added)

**Validation:**
- Lighthouse performance scores remain ≥90
- Real network testing on 4G throttled connection
- Load testing with 100 concurrent auth attempts
- Bundle size tracked in CI/CD

### Principle 4: Security by Default ✅

**Alignment:**
- OAuth tokens never logged or exposed in errors
- Client secrets remain backend-only
- httpOnly cookies with secure flag prevent XSS
- Rate limiting prevents brute force (10 attempts/hour per IP)
- CSRF protection on OAuth callback
- Failed attempts logged for security monitoring
- Environment secrets validated at startup

**Validation:**
- Security code review of auth endpoints
- OWASP Top 10 testing (injection, XSS, CSRF)
- Secrets audit (no leaks in logs, errors, or frontend)
- Rate limiting tested with automated tools

### Principle 5: Test-Driven Development ✅

**Alignment:**
- E2E tests cover primary auth flow before deployment
- Unit tests for error mapping, retry logic, config validation
- Integration tests for trial activation flow
- Accessibility tests for button activation
- Test coverage target: ≥80% for new auth code

**Validation:**
- CI/CD pipeline runs all tests before merge
- Code coverage reports in pull requests
- Playwright tests execute on every commit
- Manual testing on supported browsers

**Gate Result:** ✅ **PASS** - All constitutional principles satisfied

## Phase 0: Research & Technical Validation

**Duration:** 4 hours
**Prerequisites:** None
**Outputs:** research.md, configuration validation

### Tasks

1. **Validate Google Cloud Console Configuration**
   - Verify authorized JavaScript origins include http://localhost:5173, https://restoreassist.app
   - Confirm test users (phil.mcgurk@gmail.com, zedhfrash25@gmail.com) are whitelisted
   - Check propagation status (may require 10-15 min wait after changes)
   - Document current configuration state

2. **Research OAuth Error Codes**
   - Enumerate all possible Google OAuth error responses
   - Map technical errors to user-friendly messages
   - Document retry-able vs fatal errors
   - Create error code reference table

3. **Analyze Browser Cache Behavior**
   - Test how Chrome, Firefox, Safari, Edge cache OAuth data
   - Determine cache clearing instructions per browser
   - Identify cache-related error patterns
   - Document cache management best practices

4. **Review Fraud Detection Integration**
   - Analyze freeTrialService.ts logic and thresholds
   - Understand device fingerprinting mechanism
   - Document trial eligibility rules
   - Identify edge cases (shared devices, VPNs)

5. **Environment Configuration Audit**
   - Compare .env vs .env.local across frontend and backend
   - Verify which file takes precedence
   - Check for missing or mismatched values
   - Document canonical configuration location

**Deliverable:** research.md with findings and recommendations

## Phase 1: Design & Data Modeling

**Duration:** 6 hours
**Prerequisites:** Phase 0 complete, Google propagation delay elapsed
**Outputs:** data-model.md, API contracts, quickstart.md

### Data Model

**Entities:**

1. **User** (existing, no schema changes)
   - user_id (primary key)
   - email (from Google OAuth)
   - name (from Google profile)
   - profile_picture (from Google profile)
   - role (user | admin)
   - created_at, updated_at

2. **Session** (existing, no schema changes)
   - session_id (primary key)
   - user_id (foreign key)
   - jwt_token (hashed)
   - refresh_token (hashed)
   - expires_at
   - created_at

3. **AuthAttempt** (new, for monitoring)
   - attempt_id (primary key)
   - user_email (nullable, before user creation)
   - ip_address
   - user_agent
   - oauth_error_code (nullable)
   - success (boolean)
   - attempted_at

4. **FreeTrialToken** (existing, from fraud detection service)
   - token_id (primary key)
   - user_id (foreign key)
   - token_value
   - used (boolean)
   - expires_at

**State Transitions:**

```
OAuth Attempt → Pending
    ↓
Google Consent → Processing
    ↓ (success)
Token Exchange → Creating Session
    ↓
Trial Check → Validating Eligibility
    ↓ (fraud pass)
Trial Activation → Activated
    ↓
Redirect → Complete

(Alternative paths for errors)
```

### API Contracts

**See `/contracts/auth-api.yaml` for complete OpenAPI spec**

Key Endpoints:

1. **POST /api/auth/google**
   - Exchange Google OAuth code for JWT session
   - Input: { code, redirect_uri }
   - Output: { token, refresh_token, user }
   - Errors: 400 (invalid code), 403 (trial limit), 500 (server error)

2. **GET /api/auth/config**
   - Frontend configuration validation
   - Output: { client_id, allowed_origins, is_valid }
   - Errors: 500 (misconfigured)

3. **POST /api/auth/retry**
   - Manual retry trigger for failed auth
   - Input: { attempt_id }
   - Output: { retry_count, next_retry_at }

4. **GET /api/auth/status**
   - Check authentication session validity
   - Output: { authenticated, user, trial_status }

### Integration Points

- **Frontend → Google OAuth:** GoogleOAuthProvider wraps app
- **Frontend → Backend:** /api/auth/google for token exchange
- **Backend → Fraud Detection:** freeTrialService.validateTrialEligibility()
- **Backend → Database:** Prisma ORM for user/session CRUD
- **Backend → Sentry:** Error logging for failed auth attempts

**See quickstart.md for local development setup**

## Phase 2: Implementation

**Duration:** 2 days (16 hours)
**Prerequisites:** Phase 1 complete, all research findings addressed

### Part A: Frontend OAuth Enhancement (8 hours)

**Files to Modify:**
1. `packages/frontend/src/components/CookieConsent.tsx`
   - Validate pointer-events-none fix is working
   - Add E2E test to prevent regression

2. `packages/frontend/src/hooks/useGoogleAuth.ts` (new)
   - Initialize GoogleOAuthProvider
   - Handle OAuth success/error callbacks
   - Implement retry mechanism with exponential backoff
   - Manage loading states

3. `packages/frontend/src/utils/oauthErrorMapper.ts` (new)
   - Map OAuth error codes to user messages
   - Provide actionable remediation steps
   - Include browser-specific cache clearing instructions

4. `packages/frontend/src/components/AuthButton.tsx` (new)
   - Render "Sign in with Google" button
   - Show loading indicator during auth
   - Display retry button on failure
   - Accessibility: keyboard navigation, screen reader labels

5. `packages/frontend/src/components/ErrorMessage.tsx` (new)
   - Render user-friendly error messages
   - Include retry countdown timer
   - Link to support documentation
   - Dismissible with X button

6. `packages/frontend/src/pages/LandingPage.tsx`
   - Replace existing auth button with AuthButton component
   - Add error message display area
   - Ensure OAuth popup not blocked by cookie consent

**Acceptance Criteria:**
- Single click activates OAuth flow (no double-click)
- Error messages use plain language
- Retry button appears after failure
- Loading states provide visual feedback
- Mobile-responsive layout maintained

### Part B: Backend Authentication Service (6 hours)

**Files to Modify:**
1. `packages/backend/src/routes/authRoutes.ts`
   - Add /auth/config endpoint for validation
   - Enhance /auth/google with better error handling
   - Add /auth/retry endpoint
   - Implement rate limiting middleware

2. `packages/backend/src/services/authService.ts`
   - Add retry logic for transient failures
   - Integrate with freeTrialService
   - Log auth attempts to database
   - Handle partial failures (auth success, trial creation fail)

3. `packages/backend/src/middleware/validateEnv.ts` (new)
   - Check required env vars at startup
   - Fail fast with actionable error message
   - Sanitize secrets in logs

4. `packages/backend/src/utils/errorLogger.ts`
   - Log auth attempts to database (AuthAttempt table)
   - Send errors to Sentry with context
   - Track success rate metrics

**Acceptance Criteria:**
- Server starts only if env vars valid
- Auth errors logged with anonymized user ID
- Trial activation integrates with fraud detection
- Rate limiting prevents brute force
- Refresh tokens rotate securely

### Part C: Testing & Validation (2 hours)

**Files to Create:**
1. `tests/e2e-claude/auth/oauth-flow.spec.ts`
   - Test successful OAuth flow end-to-end
   - Verify JWT token creation
   - Check trial activation
   - Validate dashboard redirect

2. `tests/e2e-claude/auth/error-handling.spec.ts`
   - Simulate OAuth configuration errors
   - Test error message display
   - Verify retry mechanism
   - Check rate limiting

3. `tests/e2e-claude/auth/button-clicks.spec.ts`
   - Validate single-click activation
   - Test cookie consent interaction
   - Mobile touch event handling

**Acceptance Criteria:**
- All tests pass in CI/CD pipeline
- Code coverage ≥80% for auth code
- Accessibility tests pass (axe-core)
- Load tests handle 100 concurrent users

## Phase 3: Deployment & Monitoring

**Duration:** 4 hours
**Prerequisites:** Phase 2 complete, all tests passing

### Tasks

1. **Environment Configuration**
   - Update production .env.local with correct values
   - Verify Google Cloud Console production domains
   - Test propagation delay in staging environment

2. **Deployment**
   - Deploy backend to Vercel/production server
   - Deploy frontend to Vercel
   - Run smoke tests on production

3. **Monitoring Setup**
   - Configure Sentry alerts for auth failures
   - Set up success rate dashboard
   - Create support runbook for auth issues

4. **Documentation**
   - Update README with auth troubleshooting
   - Document environment variable requirements
   - Create support article for test user mode

**Acceptance Criteria:**
- Production OAuth flow works for test users
- Monitoring dashboards show success rate
- Support team has troubleshooting runbook

## Rollback Plan

If critical issues arise post-deployment:

1. **Immediate Rollback:**
   - Revert to previous Git commit
   - Redeploy backend and frontend
   - Monitor error rates return to baseline

2. **Investigate Root Cause:**
   - Check Sentry for error spike patterns
   - Review auth attempt logs
   - Verify Google Cloud Console configuration

3. **Hotfix Process:**
   - Create hotfix branch from main
   - Apply minimal fix
   - Test in staging
   - Deploy hotfix to production

## Success Criteria & Metrics

**Functional Success:**
- ✅ Users can sign in with Google in <7 seconds
- ✅ Error messages are comprehensible to non-technical users
- ✅ Retry mechanism recovers from transient failures
- ✅ Trial activation fraud detection integrated
- ✅ Single-click button activation works

**Quantitative Metrics:**
- Authentication success rate: ≥95%
- Error recovery rate: ≥80%
- Time to Interactive (TTI): <3 seconds
- OAuth init time: <2 seconds
- First-click activation: 100%

**Qualitative Metrics:**
- User satisfaction: ≥4.5/5 rating
- Support tickets: ≥70% reduction
- Developer experience: Clear error logs for debugging

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google propagation delay | High | Low | Document 15-min wait, add status check |
| Browser cache issues | Medium | Medium | Provide cache clearing instructions |
| Fraud detection false positives | Medium | High | Admin override capability, support escalation |
| Rate limiting too strict | Low | Medium | Monitor auth attempt patterns, adjust thresholds |
| Partial failure (auth success, trial fail) | Medium | Medium | Queue trial creation for retry, partial success message |
| Third-party cookie blocking | Medium | Medium | Detect and provide browser-specific guidance |
| Google API downtime | Low | High | Retry with exponential backoff, maintenance message |

## Open Questions & Clarifications

**Resolved:** All technical unknowns addressed in Phase 0 research.

**Assumptions:**
- Google Cloud Console configuration has propagated (10-15 min elapsed)
- Users have modern browsers with cookies enabled
- Database (PostgreSQL or in-memory) is available
- Fraud detection thresholds (1 trial/email) remain unchanged

---

**Plan Version:** 1.0
**Last Updated:** 2025-01-22
**Next Phase:** `/speckit.tasks` to generate actionable task breakdown
