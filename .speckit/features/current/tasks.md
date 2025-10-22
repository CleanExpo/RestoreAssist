# Task Breakdown: Fix Google OAuth Authentication

**Feature ID:** fix-oauth-authentication
**Created:** 2025-01-22
**Total Tasks:** 47
**Estimated Duration:** 3-5 days (26 hours)
**Priority:** P0 (Critical - Blocking 100% of user onboarding)

## Overview

This task breakdown addresses critical authentication failures by implementing Google OAuth fixes, error handling improvements, and trial activation integration. Tasks are organized by user story to enable independent implementation and testing.

**Key Deliverables:**
- Single-click button activation validation
- OAuth configuration validation layer
- User-friendly error messages with retry mechanisms
- Browser cache management guidance
- Test user mode support
- Trial activation fraud detection integration
- Comprehensive monitoring and logging

## Implementation Strategy

**MVP Scope (User Story 1 + 2):** Cookie consent fix validation + OAuth configuration validation
- Estimated Time: 6 hours
- Deliverable: Users can click buttons once, OAuth configuration errors are clear

**Incremental Delivery:**
- Sprint 1: US1-US2 (MVP - button clicks + config validation)
- Sprint 2: US3-US4 (error messages + retry logic)
- Sprint 3: US5-US7 (cache guidance + test mode + fraud detection)
- Sprint 4: US8 + Polish (monitoring + cross-cutting concerns)

## User Story Mapping

| Story | Description | Tasks | Est. Time | Dependencies |
|-------|-------------|-------|-----------|--------------|
| Setup | Project initialization & Google Cloud Console config | T001-T005 | 3h | None |
| Foundation | Environment validation & database schema | T006-T010 | 2h | Setup |
| **US1** | Single-Click Button Activation | T011-T014 | 2h | Foundation |
| **US2** | OAuth Configuration Validation | T015-T020 | 4h | Foundation |
| **US3** | User-Friendly Error Messages | T021-T024 | 3h | US2 |
| **US4** | Retry Mechanism with Exponential Backoff | T025-T028 | 3h | US3 |
| **US5** | Browser Cache Management Guidance | T029-T031 | 2h | US3 |
| **US6** | Test User Mode Support | T032-T034 | 2h | US2 |
| **US7** | Trial Activation Fraud Detection | T035-T039 | 3h | US2 |
| **US8** | Monitoring & Logging | T040-T043 | 2h | Foundation |
| Polish | Cross-cutting concerns & deployment | T044-T047 | 2h | All |

---

## Phase 1: Setup & Configuration

**Goal:** Initialize project structure and configure Google Cloud Console for OAuth testing.

**Tasks:**

- [ ] T001 Verify Google Cloud Console OAuth configuration is complete
  - Check authorized JavaScript origins include http://localhost:5173, https://restoreassist.app
  - Verify test users whitelisted: airestoreassist@gmail.com, phill.mcgurk@gmail.com, zenithfresh25@gmail.com
  - Confirm publishing status is "Testing"
  - Document propagation timestamp (must wait 10-15 min before testing)
  - File: `.speckit/features/current/research.md` (update with config status)

- [ ] T002 [P] Audit environment variable files across frontend and backend
  - Compare packages/frontend/.env vs packages/frontend/.env.example
  - Compare packages/backend/.env vs packages/backend/.env.local
  - Identify inconsistencies and missing values
  - Document which file takes precedence
  - File: `.speckit/features/current/research.md` (environment audit section)

- [ ] T003 [P] Create .env.example templates for frontend and backend
  - Copy packages/frontend/.env to packages/frontend/.env.example
  - Copy packages/backend/.env to packages/backend/.env.example
  - Remove all secret values (replace with placeholders)
  - Add comments explaining each variable
  - Files: `packages/frontend/.env.example`, `packages/backend/.env.example`

- [ ] T004 Update .gitignore to prevent secret commits
  - Add `.env` to .gitignore (if not already present)
  - Ensure `.env.local` is in .gitignore
  - Verify `.env.example` is NOT in .gitignore (should be committed)
  - File: `.gitignore`

- [ ] T005 [P] Generate JWT secrets for local development
  - Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`  twice
  - Update packages/backend/.env.local with JWT_SECRET and JWT_REFRESH_SECRET
  - Verify secrets are different and sufficiently random (32+ chars)
  - File: `packages/backend/.env.local`

**Independent Test Criteria for Setup:**
- ✅ Google Cloud Console shows "Testing" status with 3 test users whitelisted
- ✅ .env.example templates exist with no secrets
- ✅ .gitignore prevents .env commits
- ✅ Backend starts with valid JWT secrets

---

## Phase 2: Foundational Infrastructure

**Goal:** Establish environment validation and database schema required by all user stories.

**Tasks:**

- [ ] T006 Create environment validation middleware for backend
  - Check required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, JWT_REFRESH_SECRET
  - Validate format (Client ID ends with .apps.googleusercontent.com)
  - Fail fast at server startup if critical vars missing
  - Sanitize secrets in logs (show first 8 chars only)
  - File: `packages/backend/src/middleware/validateEnv.ts` (new)

- [ ] T007 Integrate environment validation into backend startup
  - Import validateEnv middleware in packages/backend/src/index.ts
  - Call validation before server.listen()
  - Exit with code 1 and error message if validation fails
  - Log success message if all vars valid
  - File: `packages/backend/src/index.ts`

- [ ] T008 Create Prisma schema for auth_attempts table
  - Define AuthAttempt model with fields: attempt_id, user_email, ip_address, user_agent, oauth_error_code, success, retry_count, attempted_at
  - Add indexes on user_email, ip_address, attempted_at, success
  - Map to `auth_attempts` table name
  - File: `packages/backend/prisma/schema.prisma`

- [ ] T009 Generate and run Prisma migration for auth_attempts
  - Run: `npx prisma migrate dev --name add-auth-attempts-table`
  - Verify migration file created in packages/backend/prisma/migrations/
  - Test migration on development database (or in-memory mode)
  - File: `packages/backend/prisma/migrations/YYYYMMDDHHMMSS_add-auth-attempts-table/migration.sql`

- [ ] T010 [P] Create error logger utility with Sentry integration
  - Implement logAuthAttempt(email, ipAddress, userAgent, success, error, retryCount) function
  - Save auth attempt to auth_attempts table
  - Send errors to Sentry with context (sanitize secrets)
  - Track success rate metrics
  - File: `packages/backend/src/utils/errorLogger.ts` (enhance existing)

**Independent Test Criteria for Foundation:**
- ✅ Backend fails to start if GOOGLE_CLIENT_ID missing
- ✅ auth_attempts table exists with correct schema
- ✅ Error logger saves attempts to database
- ✅ Sentry receives authentication errors

---

## Phase 3: User Story 1 - Single-Click Button Activation

**Goal:** Validate that cookie consent backdrop fix prevents double-click requirement.

**User Story:** As a user, I want all buttons to activate on the first click, so I don't have to click twice.

**Acceptance Criteria:**
- Single click activates "Sign in with Google" button
- Cookie consent backdrop uses `pointer-events-none` when invisible
- Touch events on mobile activate on first tap
- Keyboard navigation (Tab + Enter) works on first keypress

**Tasks:**

- [ ] T011 [US1] Review CookieConsent component for pointer-events fix
  - Verify packages/frontend/src/components/CookieConsent.tsx line 57-62
  - Confirm backdrop div has `pointer-events-auto` when visible, `pointer-events-none` when invisible
  - Check z-index is 40 (below OAuth popup which is 50+)
  - File: `packages/frontend/src/components/CookieConsent.tsx` (review only)

- [ ] T012 [P] [US1] Create E2E test for single-click button activation
  - Create Playwright test that clicks "Sign in with Google" button once
  - Verify OAuth popup appears (or mock OAuth flow)
  - Test with cookie consent visible and hidden
  - Test keyboard navigation (Tab to button, Enter to activate)
  - File: `tests/e2e-claude/auth/button-clicks.spec.ts` (new)

- [ ] T013 [P] [US1] Create E2E test for mobile touch events
  - Simulate touch event on auth button
  - Verify activation on first tap
  - Test with cookie consent backdrop visible
  - File: `tests/e2e-claude/auth/button-clicks.spec.ts` (add test case)

- [ ] T014 [US1] Run E2E tests and validate single-click behavior
  - Execute: `npx playwright test tests/e2e-claude/auth/button-clicks.spec.ts`
  - Verify all tests pass (single-click, keyboard, touch)
  - Document test results in PR description
  - Fix: If tests fail, update CookieConsent.tsx with correct pointer-events logic

**Independent Test Criteria for US1:**
- ✅ Playwright test confirms single-click activation
- ✅ Cookie consent backdrop does not block clicks when hidden
- ✅ Mobile touch events activate on first tap
- ✅ Keyboard navigation works without double-press

---

## Phase 4: User Story 2 - OAuth Configuration Validation

**Goal:** Validate Google OAuth configuration and provide clear feedback if misconfigured.

**User Story:** As a developer, I want the system to validate OAuth configuration at startup, so I know immediately if something is wrong.

**Acceptance Criteria:**
- Client ID format validated (ends with .apps.googleusercontent.com)
- Current origin checked against authorized origins
- Configuration status logged at startup
- Sign-in button disabled if critically misconfigured

**Tasks:**

- [ ] T015 [US2] Create OAuth configuration validator utility
  - Validate GOOGLE_CLIENT_ID format (regex: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/)
  - Check client ID is not empty or default placeholder
  - Return { isValid: boolean, errors: string[] }
  - File: `packages/frontend/src/utils/configValidator.ts` (new)

- [ ] T016 [US2] Create backend endpoint GET /api/auth/config
  - Return { client_id, is_valid, allowed_origins, errors }
  - Validate env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
  - Check client secret is set (don't expose value)
  - File: `packages/backend/src/routes/authRoutes.ts` (add endpoint)

- [ ] T017 [US2] Implement frontend config check on app initialization
  - Call GET /api/auth/config when app loads
  - Log configuration status to console (isValid, errors)
  - Store config state in React context or global state
  - Disable "Sign in with Google" button if isValid = false
  - File: `packages/frontend/src/App.tsx` or main entry point

- [ ] T018 [P] [US2] Create unit tests for configValidator
  - Test valid Client ID format
  - Test invalid formats (missing domain, wrong format, empty)
  - Test placeholder detection ("YOUR_CLIENT_ID_HERE")
  - File: `packages/frontend/src/utils/configValidator.test.ts` (new)

- [ ] T019 [P] [US2] Create integration test for /api/auth/config endpoint
  - Test response with valid env vars
  - Test response with missing GOOGLE_CLIENT_ID
  - Test response with invalid GOOGLE_CLIENT_SECRET
  - Verify errors array contains actionable messages
  - File: `packages/backend/src/routes/authRoutes.test.ts` (new or existing)

- [ ] T020 [US2] Add configuration status display in developer console
  - Log "OAuth Configuration: Valid ✅" or "OAuth Configuration: Invalid ❌ [errors]"
  - Include Client ID (first 20 chars) for debugging
  - Link to troubleshooting docs in console message
  - File: `packages/frontend/src/App.tsx`

**Independent Test Criteria for US2:**
- ✅ Backend /api/auth/config endpoint returns validation status
- ✅ Frontend disables sign-in button if config invalid
- ✅ Developer console shows clear configuration status
- ✅ Unit tests cover all validation edge cases

---

## Phase 5: User Story 3 - User-Friendly Error Messages

**Goal:** Map technical OAuth errors to plain-language messages with actionable steps.

**User Story:** As a user, when authentication fails, I want to see a clear explanation of what went wrong and what to do next, not technical jargon.

**Acceptance Criteria:**
- Error "[GSI_LOGGER]: origin not allowed" → "Authentication is being set up. Please wait 10-15 minutes and try again."
- Error "popup_closed_by_user" → "Sign-in was cancelled. Click the button again when ready."
- Error includes retry button or wait time countdown
- Support contact info provided for fatal errors

**Tasks:**

- [ ] T021 [US3] Create OAuth error mapper utility
  - Map error codes: idpiframe_initialization_failed, popup_closed_by_user, access_denied, invalid_client, redirect_uri_mismatch, invalid_grant, temporarily_unavailable
  - Return { userMessage, technicalMessage, retryable, retryAfterSeconds }
  - Include browser-specific cache clearing instructions for cache-related errors
  - File: `packages/frontend/src/utils/oauthErrorMapper.ts` (new)

- [ ] T022 [US3] Create ErrorMessage component for displaying OAuth errors
  - Props: error (OAuth error object), onRetry (callback), onDismiss (callback)
  - Display user-friendly message from error mapper
  - Show retry button if error.retryable = true
  - Show countdown timer if error.retryAfterSeconds > 0
  - Link to support docs for fatal errors
  - File: `packages/frontend/src/components/ErrorMessage.tsx` (new)

- [ ] T023 [P] [US3] Create unit tests for OAuth error mapper
  - Test all 7 error codes mapped to user-friendly messages
  - Verify retryable flag set correctly (transient vs fatal errors)
  - Test retry delay calculation for different error types
  - File: `packages/frontend/src/utils/oauthErrorMapper.test.ts` (new)

- [ ] T024 [US3] Integrate ErrorMessage component into landing page
  - Add error state to LandingPage.tsx (useState for current error)
  - Display ErrorMessage below "Sign in with Google" button when error exists
  - Pass onRetry callback that triggers OAuth re-init
  - Pass onDismiss callback that clears error state
  - File: `packages/frontend/src/pages/LandingPage.tsx`

**Independent Test Criteria for US3:**
- ✅ Error mapper converts all 7 OAuth error codes to user messages
- ✅ ErrorMessage component renders with retry button for transient errors
- ✅ Countdown timer shows for propagation delay errors
- ✅ Landing page displays errors below sign-in button

---

## Phase 6: User Story 4 - Retry Mechanism with Exponential Backoff

**Goal:** Automatically retry failed OAuth initialization with exponential backoff.

**User Story:** As a user experiencing transient authentication failures, I want the system to automatically retry, so I don't have to manually reload the page.

**Acceptance Criteria:**
- Automatic retry up to 3 times with delays: 2s, 4s, 8s
- Loading indicator shows during retry with countdown
- Manual retry button after automatic retries exhausted
- Stop retrying if error is non-transient (e.g., invalid Client ID)

**Tasks:**

- [ ] T025 [US4] Create useRetry custom hook for retry logic
  - Implement exponential backoff: delays = [2000, 4000, 8000] ms
  - Track retry count (max 3 attempts)
  - Return { retry, isRetrying, retryCount, nextRetryIn }
  - Stop retrying if error.retryable = false
  - File: `packages/frontend/src/hooks/useRetry.ts` (new)

- [ ] T026 [US4] Create useGoogleAuth custom hook wrapping @react-oauth/google
  - Initialize GoogleOAuthProvider with client ID from config
  - Handle OAuth success callback → exchange code for JWT
  - Handle OAuth error callback → map to user-friendly error via oauthErrorMapper
  - Integrate useRetry hook for automatic retries
  - Return { login, isLoading, error, retryCount }
  - File: `packages/frontend/src/hooks/useGoogleAuth.ts` (new)

- [ ] T027 [US4] Add loading indicator to AuthButton component
  - Show spinner icon during OAuth initialization
  - Display "Retrying... (attempt X/3)" during automatic retries
  - Show countdown timer "Next retry in 4s..."
  - Disable button during loading
  - File: `packages/frontend/src/components/AuthButton.tsx` (new)

- [ ] T028 [P] [US4] Create E2E test for retry mechanism
  - Mock OAuth API to fail first 2 attempts, succeed on 3rd
  - Verify automatic retry with exponential backoff
  - Verify loading indicator shows "Retrying... (attempt 1/3)"
  - Verify success after 3rd attempt
  - File: `tests/e2e-claude/auth/error-handling.spec.ts` (new)

**Independent Test Criteria for US4:**
- ✅ useRetry hook implements exponential backoff (2s, 4s, 8s)
- ✅ useGoogleAuth integrates retry logic with OAuth flow
- ✅ Loading indicator shows retry count and countdown
- ✅ E2E test verifies retry behavior with mock failures

---

## Phase 7: User Story 5 - Browser Cache Management Guidance

**Goal:** Detect browser cache issues and provide browser-specific clearing instructions.

**User Story:** As a user experiencing persistent authentication failures, I want guidance on clearing my browser cache, so I can resolve OAuth configuration caching issues.

**Acceptance Criteria:**
- Detect repeated failures (2+ within 5 minutes)
- Suggest cache clearing after 2nd failure
- Provide browser-specific instructions (Chrome, Firefox, Safari, Edge)
- Track whether cache clearing resolved issue

**Tasks:**

- [ ] T029 [US5] Add browser detection and cache guidance to error mapper
  - Detect user agent: Chrome, Firefox, Safari, Edge
  - Generate browser-specific cache clearing instructions
  - For Chrome: "Settings → Privacy → Clear browsing data → Cookies (All time)"
  - For Firefox: "Ctrl+Shift+Delete → Cookies → Clear"
  - For Safari: "Safari → Preferences → Privacy → Manage Website Data"
  - For Edge: Similar to Chrome (Chromium-based)
  - File: `packages/frontend/src/utils/oauthErrorMapper.ts` (enhance)

- [ ] T030 [US5] Track failure count in localStorage for cache detection
  - Store failure count with timestamp: `{ count: 2, firstFailure: "2025-01-22T10:00:00Z" }`
  - Reset count to 0 on successful authentication
  - If count >= 2 within 5 minutes, trigger cache guidance
  - File: `packages/frontend/src/hooks/useGoogleAuth.ts` (enhance)

- [ ] T031 [US5] Display cache clearing instructions in ErrorMessage component
  - Add "cacheGuidance" prop to ErrorMessage
  - Show expandable section "Troubleshooting: Clear Browser Cache"
  - Display browser-specific instructions with keyboard shortcuts
  - Include "Did this help?" feedback button
  - File: `packages/frontend/src/components/ErrorMessage.tsx` (enhance)

**Independent Test Criteria for US5:**
- ✅ Error mapper generates browser-specific cache instructions
- ✅ localStorage tracks failure count and timestamp
- ✅ Cache guidance appears after 2 failures within 5 minutes
- ✅ ErrorMessage displays expandable cache instructions

---

## Phase 8: User Story 6 - Test User Mode Support

**Goal:** Handle Google OAuth "Testing" mode restrictions gracefully.

**User Story:** As a developer, I want clear messaging when non-whitelisted users try to authenticate in Testing mode, so I can guide them to request access.

**Acceptance Criteria:**
- Detect "Access Blocked: Authorization Error" responses
- Display "This app is in testing mode. Contact support to be added as a test user."
- Provide support email or request form
- Differentiate test mode errors from config errors

**Tasks:**

- [ ] T032 [US6] Add test mode error detection to OAuth error mapper
  - Detect error code "access_blocked" or message containing "Authorization Error"
  - Map to user message: "This app is in testing mode. Only approved test users can sign in."
  - Include support contact: "Email support@restoreassist.com.au to request test user access."
  - Mark as non-retryable (retryable: false)
  - File: `packages/frontend/src/utils/oauthErrorMapper.ts` (enhance)

- [ ] T033 [US6] Log test mode restriction hits to backend
  - When "access_blocked" error occurs, send to POST /api/auth/attempt (new endpoint)
  - Record attempt with: email (if known), error code, user agent, IP address
  - Mark success = false, oauth_error_code = "access_blocked"
  - File: `packages/backend/src/routes/authRoutes.ts` (add POST /api/auth/attempt)

- [ ] T034 [P] [US6] Create E2E test for test mode restriction
  - Mock OAuth to return "access_blocked" error
  - Verify user message shows "testing mode" explanation
  - Verify support email displayed
  - Verify retry button NOT shown (non-retryable)
  - File: `tests/e2e-claude/auth/error-handling.spec.ts` (add test case)

**Independent Test Criteria for US6:**
- ✅ "access_blocked" error maps to test mode explanation
- ✅ Support email provided in error message
- ✅ Backend logs test mode restriction attempts
- ✅ E2E test verifies test mode error handling

---

## Phase 9: User Story 7 - Trial Activation Fraud Detection

**Goal:** Integrate trial activation with existing fraud detection service.

**User Story:** As a system, I want to validate trial eligibility using fraud detection, so we prevent abuse while allowing legitimate users.

**Acceptance Criteria:**
- Check if user exceeded MAX_TRIALS_PER_EMAIL (1)
- Validate device fingerprint against MAX_TRIALS_PER_DEVICE (1)
- Calculate fraud score and block if >= 70
- Provide clear messaging if trial denied
- Log fraud detection decisions for audit

**Tasks:**

- [ ] T035 [US7] Create trial eligibility check in auth service
  - Call freeTrialService.validateTrialEligibility(userId, email, deviceHash)
  - Return { eligible: boolean, fraudScore: number, reason: string }
  - Log decision to trial_fraud_flags table if blocked
  - File: `packages/backend/src/services/authService.ts` (enhance)

- [ ] T036 [US7] Integrate trial check into POST /api/auth/google endpoint
  - After successful OAuth token exchange, check trial eligibility
  - If eligible: Create free_trial_token, activate trial
  - If blocked: Return 403 with { error: "trial_limit_exceeded", fraudScore, reason }
  - Log auth attempt to auth_attempts table with trial status
  - File: `packages/backend/src/routes/authRoutes.ts` (enhance)

- [ ] T037 [US7] Map fraud detection errors to user-friendly messages
  - Error "trial_limit_exceeded" → "You have already used your free trial. Please sign in to continue."
  - Error "fraud_detected" → "Unable to activate trial. Please contact support."
  - Include support email for manual review
  - Mark as non-retryable (user cannot fix by retrying)
  - File: `packages/frontend/src/utils/oauthErrorMapper.ts` (enhance)

- [ ] T038 [P] [US7] Create integration test for fraud detection
  - Test user with 0 trials → eligible, trial activated
  - Test user with 1 trial → blocked, error returned
  - Test device with 1 trial → blocked, error returned
  - Verify fraud_score calculation: email (40) + device (30) = 70 → blocked
  - File: `packages/backend/src/services/authService.test.ts` (new or existing)

- [ ] T039 [US7] Add admin override endpoint POST /api/admin/grant-trial/:email
  - Require admin authentication (check role = "admin")
  - Manually create free_trial_token for email
  - Reset device_fingerprint trial_count to 0
  - Log override action to audit trail
  - File: `packages/backend/src/routes/adminTrialRoutes.ts` (enhance existing)

**Independent Test Criteria for US7:**
- ✅ Trial eligibility check integrated into auth flow
- ✅ Users exceeding trial limit see clear error message
- ✅ Fraud scores calculated correctly (email 40 + device 30)
- ✅ Admin override allows manual trial grants

---

## Phase 10: User Story 8 - Monitoring & Logging

**Goal:** Track all authentication attempts for observability and debugging.

**User Story:** As a developer, I want comprehensive logging of authentication attempts, so I can diagnose issues quickly and track success rates.

**Acceptance Criteria:**
- All auth attempts logged to auth_attempts table
- Success rate metrics tracked (successful auths / total attempts)
- Errors reported to Sentry with full context
- Analytics queries available for top errors, suspicious IPs

**Tasks:**

- [ ] T040 [US8] Implement auth attempt logging in POST /api/auth/google
  - Before OAuth processing, create auth_attempt record with: user_email (null initially), ip_address, user_agent, success=false
  - After OAuth success, update attempt with: user_email, success=true
  - After OAuth error, update attempt with: oauth_error_code, oauth_error_message, success=false
  - Track retry_count if user retrying
  - File: `packages/backend/src/routes/authRoutes.ts` (enhance)

- [ ] T041 [US8] Add Sentry error reporting for auth failures
  - Send to Sentry: error code, user agent, anonymized email (first 3 chars + hash)
  - Include context: retry count, fraud score (if applicable), device fingerprint hash
  - Tag with: "auth_failure", error type (config, oauth, fraud, etc.)
  - Do NOT send secrets (client secret, JWT tokens)
  - File: `packages/backend/src/utils/errorLogger.ts` (enhance)

- [ ] T042 [P] [US8] Create analytics queries for auth success rate
  - Query: Success rate last 24h = (COUNT success=true / COUNT *) * 100
  - Query: Top 5 OAuth error codes by occurrence
  - Query: Suspicious IPs (>10 failures, 0 successes in 1 hour)
  - Query: Average time to successful auth (attempted_at to success)
  - File: `.speckit/features/current/data-model.md` (add to Analytics section)

- [ ] T043 [US8] Add success rate logging to backend startup
  - On server start, query last 24h success rate
  - Log: "Auth Success Rate (24h): 95.3%"
  - If rate < 90%, log warning: "⚠️ Auth success rate below target"
  - File: `packages/backend/src/index.ts`

**Independent Test Criteria for US8:**
- ✅ auth_attempts table populated on every auth attempt
- ✅ Sentry receives errors with sanitized context
- ✅ Analytics queries return correct success rates
- ✅ Backend logs success rate on startup

---

## Phase 11: Polish & Cross-Cutting Concerns

**Goal:** Final integration, testing, and deployment preparation.

**Tasks:**

- [ ] T044 Create comprehensive E2E test for full OAuth flow
  - Test: User clicks button → OAuth popup → Google consent → redirect → dashboard
  - Verify JWT token stored in httpOnly cookie
  - Verify trial activated (free_trial_token created)
  - Verify user session created
  - Verify dashboard shows user name and profile picture
  - File: `tests/e2e-claude/auth/oauth-flow.spec.ts` (new)

- [ ] T045 [P] Update README with OAuth troubleshooting guide
  - Add section: "Google OAuth Troubleshooting"
  - Document common errors and solutions
  - Link to quickstart.md for detailed setup
  - Include test user whitelisting instructions
  - File: `README.md`

- [ ] T046 Run full test suite and verify 80%+ coverage
  - Execute: `npm test` (backend unit tests)
  - Execute: `npm run test:e2e` (Playwright E2E tests)
  - Generate coverage report: `npm run test:coverage`
  - Verify coverage >= 80% for new auth code
  - Fix: Add tests if coverage below threshold

- [ ] T047 Deploy to staging environment and smoke test
  - Deploy backend to Vercel staging
  - Deploy frontend to Vercel staging
  - Update Google Cloud Console with staging URLs
  - Wait 15 minutes for propagation
  - Test OAuth flow with real Google account
  - Verify monitoring dashboards show data

**Independent Test Criteria for Polish:**
- ✅ Full E2E test passes from button click to dashboard
- ✅ README includes troubleshooting guide
- ✅ Test coverage >= 80% for auth code
- ✅ Staging deployment successful, OAuth working

---

## Dependencies & Execution Order

### User Story Dependencies

```
Setup Phase
    ↓
Foundational Phase (Environment + Database)
    ↓
    ├──→ US1 (Single-Click) ────────────────────────┐
    ├──→ US2 (OAuth Config) ────────────────────────┤
    │       ↓                                       │
    │       ├──→ US3 (Error Messages) ──────────────┤
    │       │       ↓                               │
    │       │       ├──→ US4 (Retry Logic) ────────┤
    │       │       └──→ US5 (Cache Guidance) ─────┤
    │       │                                       │
    │       ├──→ US6 (Test Mode Support) ──────────┤
    │       └──→ US7 (Fraud Detection) ────────────┤
    │                                               │
    └──→ US8 (Monitoring) ─────────────────────────┤
                                                    ↓
                                            Polish Phase
```

### Parallel Execution Opportunities

**Setup Phase (can run in parallel):**
- T002 (audit env files) || T003 (create .env.example) || T004 (update .gitignore) || T005 (generate JWT secrets)

**Foundational Phase:**
- T008 (Prisma schema) → T009 (run migration) [sequential]
- T010 (error logger) [parallel with T008-T009]

**User Story 1:**
- T012 (E2E test clicks) || T013 (E2E test touch) [both parallel]

**User Story 2:**
- T018 (unit tests configValidator) || T019 (integration tests /auth/config) [both parallel]

**User Story 3:**
- T023 (unit tests error mapper) [parallel with T022 component creation]

**User Story 4:**
- T028 (E2E retry test) [parallel after T027 complete]

**User Story 7:**
- T038 (integration tests fraud) [parallel with T037 error mapping]

**User Story 8:**
- T042 (analytics queries) [parallel with T040-T041]

**Polish Phase:**
- T045 (README update) || T046 (run test suite) [both parallel]

---

## Success Metrics & Validation

### Quantitative Metrics (from spec.md)

| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Authentication Success Rate | ≥95% | (successful auths / total attempts) * 100 | TBD |
| OAuth Initialization Time | <2s | Time from button click to popup | TBD |
| Total Auth Flow Time | <7s | Button click to dashboard redirect | TBD |
| Error Recovery Rate | ≥80% | Users who retry after error and succeed | TBD |
| First-Click Activation | 100% | E2E tests verify single-click | ✅ |
| Trial Activation Rate | ≥90% | Successful auths that activate trials | TBD |

### Qualitative Metrics

- User satisfaction: ≥4.5/5 rating for sign-up experience
- Error messages comprehensible to non-technical users
- Support tickets: ≥70% reduction after deployment
- Developer experience: Clear logs enable quick debugging

---

## Risk Mitigation

| Risk | Mitigation Task(s) | Status |
|------|-------------------|--------|
| Google propagation delay | T001 (document timestamp, wait 15 min) | Planned |
| Browser cache issues | T029-T031 (cache guidance) | Planned |
| Fraud false positives | T039 (admin override endpoint) | Planned |
| Rate limiting too strict | Monitor via T040-T043, adjust thresholds | Planned |
| Third-party cookie blocking | T031 (browser-specific guidance) | Planned |
| Google API downtime | T025-T028 (retry with exponential backoff) | Planned |

---

## Rollback Plan

If critical issues arise post-deployment:

1. **Immediate Rollback:**
   - Revert to commit before OAuth changes
   - Redeploy backend and frontend
   - Monitor error rates return to baseline

2. **Investigation:**
   - Check Sentry for error spike patterns
   - Review auth_attempts table for failure details
   - Verify Google Cloud Console configuration

3. **Hotfix Process:**
   - Create hotfix branch from main
   - Apply minimal fix (guided by monitoring data)
   - Test in staging
   - Deploy hotfix to production

---

## Task Summary

**Total Tasks:** 47

**By Phase:**
- Setup: 5 tasks (3h)
- Foundational: 5 tasks (2h)
- US1 (Single-Click): 4 tasks (2h)
- US2 (OAuth Config): 6 tasks (4h)
- US3 (Error Messages): 4 tasks (3h)
- US4 (Retry Logic): 4 tasks (3h)
- US5 (Cache Guidance): 3 tasks (2h)
- US6 (Test Mode): 3 tasks (2h)
- US7 (Fraud Detection): 5 tasks (3h)
- US8 (Monitoring): 4 tasks (2h)
- Polish: 4 tasks (2h)

**Parallel Opportunities:** 15 tasks marked [P]

**MVP Scope (US1 + US2):** 10 tasks, 6 hours

**Full Implementation:** 47 tasks, 26 hours (3-5 days)

---

**Ready for Implementation:** All tasks are actionable and independently testable.

**Next Step:** Run `/speckit.implement` to begin systematic task execution, or manually execute tasks T001-T047 in order.
