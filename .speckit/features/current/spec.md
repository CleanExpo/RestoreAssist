# Feature Specification: Fix Google OAuth Authentication

**Feature ID:** fix-oauth-authentication
**Created:** 2025-01-22
**Status:** Draft
**Priority:** P0 (Critical - Blocking user onboarding)

## Overview

### Problem Statement

Users are unable to authenticate using Google OAuth on the RestoreAssist landing page, resulting in a complete blocker for trial activation. The authentication flow has been failing for 3 days with the error "Trial Activation Failed - An unexpected error occurred" for test users. Additionally, all clickable elements on the landing page required double-clicks to activate due to an invisible cookie consent backdrop blocking pointer events.

**Impact:**
- 100% of new users cannot sign up or activate trials
- Existing users attempting to log in via Google OAuth are blocked
- Business is unable to acquire new customers
- Trial activation fraud detection system cannot be tested properly

### Business Value

Fixing the authentication flow is mission-critical for RestoreAssist's go-to-market strategy. Without functional OAuth authentication:
- Revenue is blocked (no new subscriptions)
- User onboarding funnel is broken
- Professional credibility is damaged
- Google OAuth integration (primary authentication method) is non-functional

Successful resolution will:
- Restore user acquisition capabilities
- Enable trial-to-paid conversion funnel
- Demonstrate reliability and professional quality
- Support proper testing of fraud detection mechanisms

### Background Context

RestoreAssist uses Google OAuth 2.0 via `@react-oauth/google` library for user authentication. The system is configured with:
- Client ID: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
- Authorized JavaScript origins include `http://localhost:5173` (development) and production domains
- Test users include `phil.mcgurk@gmail.com` and `zedhfrash25@gmail.com`
- Publishing status set to "Testing" in Google Cloud Console

**Recent Changes:**
1. Cookie consent backdrop blocking pointer events was fixed by adding `pointer-events-none` when invisible
2. Google Cloud Console configuration was updated to include authorized origins and test users
3. Multiple .env files exist (backend/.env and backend/.env.local) with potential configuration conflicts

**Known Issues:**
- Google OAuth configuration propagation delay (5-15 minutes)
- Browser caching of OAuth tokens and configuration
- Inconsistent environment variable precedence (.env vs .env.local)
- Error messages lack actionable guidance for users

## User Scenarios & Testing

### Primary User Flow: Google OAuth Sign-In

**Actor:** New restoration professional visiting RestoreAssist landing page

**Scenario:**
1. User lands on https://restoreassist.app homepage
2. User clicks "Start Free Trial" or "Sign in with Google" button with single click
3. Google OAuth consent screen appears showing requested permissions
4. User approves permissions and selects Google account
5. User is redirected back to RestoreAssist dashboard
6. Trial is activated automatically with proper fraud detection checks
7. User sees welcome message and can begin creating reports

**Acceptance Criteria:**
- Single click activates button (no double-click required)
- OAuth popup appears within 2 seconds
- Consent screen shows correct app name "RestoreAssist Landing Page"
- Redirect completes within 5 seconds
- User session is established with JWT token
- Trial activation completes without errors
- Dashboard shows user's name and profile picture from Google

### Error Handling Flow: Configuration Issues

**Actor:** User attempting sign-in during Google propagation delay or configuration issues

**Scenario:**
1. User clicks "Sign in with Google"
2. OAuth initialization fails due to configuration error
3. User sees clear error message explaining the issue
4. Error message suggests waiting 10-15 minutes if recently configured
5. User can retry authentication after waiting
6. Retry attempt succeeds after propagation completes

**Acceptance Criteria:**
- Error message is user-friendly (no technical jargon like "GSI_LOGGER")
- Message explains why the error occurred
- Suggests specific actions (wait time, browser cache clearing)
- Provides retry button without page reload
- Logs detailed error to monitoring system for debugging

### Edge Case: Test User in "Testing" Mode

**Actor:** Developer or QA tester using test Google account

**Scenario:**
1. App is set to "Testing" in Google Cloud Console
2. Only whitelisted test users can authenticate
3. Test user (phil.mcgurk@gmail.com) attempts sign-in
4. Authentication succeeds without "Access Blocked" error
5. Trial activation completes with test user flagged appropriately

**Acceptance Criteria:**
- Test users listed in Google Console can authenticate
- Non-test users see appropriate "Access Restricted" message
- Error messages distinguish between test mode restrictions and configuration errors
- Test user sessions are tracked separately for analytics

### Edge Case: Multiple Failed Attempts

**Actor:** User experiencing persistent authentication failures

**Scenario:**
1. User attempts Google sign-in multiple times
2. Each attempt fails with same or different errors
3. After 3 failed attempts, system suggests alternative troubleshooting
4. Fallback authentication method is offered (if available)
5. Support contact information is displayed

**Acceptance Criteria:**
- System tracks failed authentication attempts per session
- After 3 failures, enhanced troubleshooting guidance appears
- User is not locked out permanently
- Failed attempts are logged for support team investigation

## Functional Requirements

### FR-1: Single-Click Button Activation

All interactive elements (buttons, links, form inputs) on the landing page MUST respond to single mouse clicks without requiring double-clicks.

**Details:**
- Cookie consent backdrop MUST use `pointer-events-none` when invisible
- No overlay elements should block click events when hidden
- Touch events on mobile devices MUST activate on first tap
- Keyboard navigation (Tab + Enter) MUST work on first keypress

**Testability:** Automated Playwright test verifies button activation on first click event.

### FR-2: Google OAuth Configuration Validation

The system MUST validate Google OAuth configuration before initializing the sign-in flow and provide actionable feedback if misconfigured.

**Details:**
- Verify Client ID is set and matches expected format
- Check that current origin is in authorized JavaScript origins list
- Display configuration status in developer console for debugging
- Prevent sign-in button from appearing if critically misconfigured

**Testability:** Unit tests verify configuration validation logic; E2E tests confirm proper error handling.

### FR-3: User-Friendly Error Messages

When authentication fails, users MUST see clear, non-technical error messages that explain the problem and suggest specific remediation steps.

**Details:**
- Replace technical errors like "[GSI_LOGGER]: The given origin is not allowed" with "Authentication is being set up. Please wait 10-15 minutes and try again."
- Map OAuth error codes to user-friendly messages
- Include timestamp of when user can retry
- Provide link to support documentation
- Never expose API keys, secrets, or internal error traces to users

**Testability:** Error message content verified through E2E tests simulating various failure scenarios.

### FR-4: Retry Mechanism with Exponential Backoff

The system MUST implement automatic retry logic for transient OAuth failures with user-visible retry controls.

**Details:**
- Automatically retry failed OAuth init up to 3 times with 2s, 4s, 8s delays
- Show loading indicator during retries with countdown
- Allow user to manually trigger retry without page reload
- Stop retrying if error is non-transient (e.g., Client ID invalid)
- Log retry attempts for debugging

**Testability:** Unit tests verify backoff timing; manual testing confirms UX during retries.

### FR-5: Browser Cache Management Guidance

When authentication fails, the system MUST detect potential browser cache issues and guide users to clear cached OAuth data.

**Details:**
- Detect repeated failures for same user/browser combination
- Suggest cache clearing after 2 failures within 5 minutes
- Provide browser-specific instructions (Chrome, Firefox, Safari, Edge)
- Include option to open browser cache settings directly
- Track whether cache clearing resolved the issue

**Testability:** E2E tests verify cache detection logic and instruction display.

### FR-6: Test User Mode Support

The authentication flow MUST properly handle Google OAuth "Testing" mode restrictions and provide appropriate feedback to non-whitelisted users.

**Details:**
- Detect "Access Blocked: Authorization Error" responses
- Display message: "This app is in testing mode. Contact support to be added as a test user."
- Provide email address or form to request test user access
- Log test user restriction hits for product team visibility
- Clearly differentiate test mode errors from configuration errors

**Testability:** Manual testing with test and non-test Google accounts.

### FR-7: Trial Activation Fraud Detection

After successful OAuth authentication, the system MUST validate trial eligibility using the existing fraud detection service while handling edge cases gracefully.

**Details:**
- Check if user has exceeded MAX_TRIALS_PER_EMAIL (currently 1)
- Validate device fingerprint against MAX_TRIALS_PER_DEVICE (currently 1)
- Calculate fraud score and block if above FRAUD_SCORE_THRESHOLD (70)
- Provide clear messaging if trial is denied due to fraud detection
- Allow admin override for legitimate users flagged incorrectly
- Log all fraud detection decisions for audit trail

**Testability:** Integration tests with mock fraud detection responses; E2E tests verify user-facing messages.

### FR-8: Environment Configuration Validation

The backend MUST validate that all required environment variables are set correctly at startup and fail fast with clear error messages if misconfigured.

**Details:**
- Check for GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
- Verify database connection settings (USE_POSTGRES, DB_HOST, etc.)
- Validate JWT secrets are set and sufficiently complex
- Ensure .env.local takes precedence over .env consistently
- Log configuration status at startup (sanitize secrets in logs)
- Exit with error code and actionable message if critical config missing

**Testability:** Unit tests verify validation logic; startup scripts confirm fail-fast behavior.

## Non-Functional Requirements

### NFR-1: Performance

- OAuth initialization MUST complete within 2 seconds on 4G connection
- Sign-in flow (click to dashboard redirect) MUST complete within 7 seconds total
- Error messages MUST appear within 500ms of failure
- Retry attempts MUST not block UI thread (use loading indicators)

### NFR-2: Security

- OAuth tokens MUST never be logged or exposed in error messages
- Client secrets MUST remain in backend environment only
- CSRF protection MUST be enabled for OAuth callback endpoint
- Session tokens MUST use httpOnly cookies with secure flag
- Failed authentication attempts MUST be rate-limited (max 10/hour per IP)

### NFR-3: Reliability

- System MUST gracefully handle Google API downtime (5xx errors)
- Network failures MUST trigger retry logic automatically
- Partial failures (e.g., trial activation fails after auth succeeds) MUST be recovered
- User data MUST not be lost if authentication completes but trial creation fails

### NFR-4: Observability

- All authentication attempts MUST be logged with anonymized user identifier
- OAuth errors MUST be reported to Sentry with full context
- Success rate metrics MUST be tracked (successful auths / total attempts)
- Configuration validation results MUST be logged at startup
- Fraud detection decisions MUST be auditable with timestamps and reasoning

### NFR-5: Compatibility

- Solution MUST work on Chrome 100+, Firefox 100+, Safari 15+, Edge 100+
- Mobile browsers (iOS Safari, Chrome Mobile) MUST support OAuth popup flow
- Cookie consent interaction MUST not interfere with OAuth flow
- Works correctly with browser extensions that block third-party cookies (with appropriate error messaging)

## Success Criteria

### Measurable Outcomes

1. **Authentication Success Rate:** ≥95% of sign-in attempts complete successfully within 7 seconds
2. **Error Recovery Rate:** ≥80% of users who encounter errors successfully authenticate after following error message guidance
3. **Trial Activation Rate:** ≥90% of successful authentications result in activated trials (fraud detection accounted for)
4. **User Satisfaction:** Post-authentication survey shows ≥4.5/5 rating for ease of sign-up
5. **First-Click Success:** 100% of button interactions activate on first click (no double-clicks)
6. **Support Ticket Reduction:** Authentication-related support tickets decrease by ≥70% after deployment

### Qualitative Outcomes

1. Users report sign-up process as "smooth" and "professional"
2. Error messages are understandable by non-technical restoration professionals
3. Retry mechanisms feel responsive and provide clear feedback
4. Test users can authenticate without confusion about test mode restrictions
5. Development team can diagnose OAuth issues quickly using improved logging
6. No user data is lost due to partial authentication failures

## Assumptions

1. **Google OAuth Configuration:** Assumes Google Cloud Console configuration has propagated (10-15 minute delay acceptable)
2. **User Browser Environment:** Assumes users have cookies enabled and allow third-party cookies for OAuth
3. **Network Stability:** Assumes users have stable internet connection during 7-second authentication window
4. **Database Availability:** Assumes PostgreSQL database (or in-memory fallback) is available for trial creation
5. **Email Uniqueness:** Assumes Google email addresses are unique identifiers for users
6. **Fraud Detection Service:** Assumes existing fraud detection service is functional and returns timely responses
7. **Environment Variables:** Assumes .env.local file is properly configured with correct Client ID and Secret
8. **Browser Compatibility:** Assumes users are on supported modern browsers (released within last 2 years)

## Scope

### In Scope

- Fixing Google OAuth configuration and initialization errors
- Implementing user-friendly error messages and retry mechanisms
- Validating cookie consent backdrop does not block clicks
- Supporting Google OAuth "Testing" mode with proper test user handling
- Integrating trial activation with fraud detection
- Environment configuration validation and fail-fast startup
- Comprehensive error logging and monitoring
- Browser cache management guidance
- E2E test coverage for authentication flows

### Out of Scope

- Implementing alternative authentication methods (email/password, GitHub OAuth)
- Migrating to new Supabase database (separate feature)
- Changing fraud detection thresholds or algorithms (uses existing service)
- Redesigning landing page UI beyond fixing click interactions
- Implementing admin dashboard for trial management
- Supporting OAuth on mobile native apps (web-only for this feature)
- Implementing password reset flows (no password auth yet)
- Multi-factor authentication (future enhancement)

## Dependencies

### External Dependencies

- **Google OAuth 2.0 API:** Requires Google Cloud Console configuration to be properly set
- **Google Account Service:** Users must have valid Google accounts
- **Browser OAuth Support:** Requires modern browsers with popup/redirect support
- **Network Connectivity:** Requires stable connection during authentication
- **Sentry:** For error monitoring and logging (optional but recommended)

### Internal Dependencies

- **Fraud Detection Service:** Backend service at `src/services/freeTrialService.ts`
- **Database:** PostgreSQL or in-memory storage for user and trial data
- **JWT Service:** For session token generation and validation
- **Cookie Consent Component:** Must not block interactions when hidden
- **Environment Configuration:** Properly set .env/.env.local files

### Blocking Issues

- **Google Propagation Delay:** Cannot test configuration changes immediately (10-15 min wait)
- **Test User Access:** Non-whitelisted users cannot authenticate in Testing mode
- **Database Migration:** Supabase host unreachable, using in-memory storage temporarily

## Constraints

### Technical Constraints

- Must use existing `@react-oauth/google` library (v0.12+)
- Must maintain backward compatibility with existing user sessions
- Cannot modify Google OAuth Client ID (would require re-verification)
- Must work with both PostgreSQL and in-memory database modes
- Frontend runs on Vite dev server (http://localhost:5173)
- Backend runs on Express (http://localhost:3001)

### Business Constraints

- Fix must be deployed within 1 week (blocking new user acquisition)
- Cannot disable fraud detection (legal/financial risk)
- Must maintain audit trail for compliance
- Error messages must be suitable for Australian English audience
- Cannot collect additional user data without privacy policy update

### Regulatory Constraints

- Must comply with Australian Privacy Principles (APP) under Privacy Act 1988
- OAuth scopes must be minimal and justified
- User consent must be explicit and revocable
- Data retention must follow stated privacy policy

## Edge Cases

1. **Google API Downtime:** OAuth service returns 5xx errors
   - **Handling:** Display maintenance message, retry with exponential backoff, log to monitoring

2. **Propagation Delay Not Expired:** Configuration changes not yet active
   - **Handling:** Detect "[origin] not allowed" error, suggest 15-minute wait, show retry countdown

3. **Browser Blocks Third-Party Cookies:** OAuth popup fails to load
   - **Handling:** Detect popup blocked, instruct user to enable cookies, provide browser-specific help

4. **User Already Has Trial:** Attempts to activate second trial
   - **Handling:** Fraud detection blocks activation, display "Trial already used" with login option

5. **Partial Failure:** Auth succeeds but trial creation fails
   - **Handling:** Create user record in database, queue trial creation for retry, show partial success message

6. **Test Mode Restriction:** Non-whitelisted user attempts authentication
   - **Handling:** Show "Contact support to be added as test user" with support email

7. **Network Timeout:** OAuth request times out after 10 seconds
   - **Handling:** Show "Connection timeout, please try again" with retry button

8. **Multiple Tabs:** User opens sign-in in multiple browser tabs simultaneously
   - **Handling:** Only first successful auth creates session, others redirect to dashboard

9. **Cookie Consent Interaction:** User accepts/declines cookies during OAuth flow
   - **Handling:** Ensure backdrop dismisses properly, OAuth continues without interference

10. **Device Fingerprint Collision:** Legitimate user flagged due to shared device/network
    - **Handling:** Provide support contact option, log for manual review, maintain fraud block

## Open Questions

[No unresolved clarifications - all requirements are specified with reasonable defaults]

---

**Document Version:** 1.0
**Last Updated:** 2025-01-22
**Next Phase:** `/speckit.plan` to create implementation architecture
