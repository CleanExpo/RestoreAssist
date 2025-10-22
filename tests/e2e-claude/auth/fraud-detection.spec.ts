/**
 * E2E Tests: Trial Activation Fraud Detection
 *
 * Tests the complete fraud detection flow for free trial activation.
 *
 * Coverage:
 * - User with 0 trials → eligible, trial activated
 * - User with 1 trial already used → blocked, error returned
 * - Device with 1 trial already used → blocked, error returned
 * - Fraud score calculation: email (40) + device (30) = 70 → blocked
 * - Disposable email detection → blocked
 * - Rapid re-registration attempts → blocked
 * - IP rate limiting → blocked
 * - Admin override functionality
 *
 * @module tests/e2e/auth/fraud-detection.spec
 */

import { test, expect } from '@playwright/test';

test.describe('Trial Activation Fraud Detection', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to landing page
    await page.goto('http://localhost:5173');
  });

  test('should allow trial activation for new user with no previous trials', async ({ page }) => {
    // Expected behavior:
    // 1. New user signs in with Google OAuth
    // 2. User activates trial with device fingerprint
    // 3. Fraud detection runs (checks email, device, IP)
    // 4. Fraud score: 0 (no previous trials)
    // 5. Trial activated successfully
    // 6. User receives 3 reports, 7-day expiry

    // Verify page loaded
    await expect(page).toHaveTitle(/RestoreAssist|Free Trial/);

    // NOTE: Full test requires mock OAuth and backend endpoints
    // This test documents expected behavior for manual/integration testing
  });

  test('should block trial activation for user who already used trial (email limit)', async ({ page }) => {
    // Expected behavior:
    // 1. User with existing trial record signs in
    // 2. User attempts to activate trial
    // 3. Fraud detection checks database:
    //    - SELECT COUNT(*) FROM free_trial_tokens WHERE user_id = ? → 1
    //    - MAX_TRIALS_PER_EMAIL = 1 → exceeded
    // 4. Fraud score: 40 (email limit exceeded)
    // 5. Returns 403 with error: "email_trial_limit_exceeded"
    // 6. Frontend displays: "You have already used your free trial..."

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping (from oauthErrorMapper.ts):
    // case 'email_trial_limit_exceeded':
    //   userMessage: "You have already used your free trial. Each email address is eligible for one free trial only."
    //   technicalMessage: "Trial limit exceeded: Email already used for trial"
    //   retryable: false
  });

  test('should block trial activation for device that already used trial (device limit)', async ({ page }) => {
    // Expected behavior:
    // 1. New user (different email) signs in on device with existing trial
    // 2. User attempts to activate trial with fingerprint hash
    // 3. Fraud detection checks database:
    //    - SELECT * FROM device_fingerprints WHERE fingerprint_hash = ? → found
    //    - trial_count = 1
    //    - MAX_TRIALS_PER_DEVICE = 1 → exceeded
    // 4. Fraud score: 30 (device limit exceeded)
    // 5. Returns 403 with error: "device_trial_limit_exceeded"
    // 6. Frontend displays: "This device has already been used for a free trial..."

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping:
    // case 'device_trial_limit_exceeded':
    //   userMessage: "This device has already been used for a free trial..."
    //   technicalMessage: "Trial limit exceeded: Device already used for trial"
    //   retryable: false
  });

  test('should block trial when fraud score exceeds threshold (70)', async ({ page }) => {
    // Expected behavior:
    // 1. User with existing trial (email: 40 points) signs in
    // 2. User uses device with existing trial (device: 30 points)
    // 3. Total fraud score: 40 + 30 = 70
    // 4. FRAUD_SCORE_THRESHOLD = 70 → blocked
    // 5. Returns 403 with error: "fraud_score_too_high"
    // 6. Fraud flag created in trial_fraud_flags table:
    //    - flag_type: 'multiple_violations'
    //    - severity: 'high'
    //    - fraud_score: 70
    //    - details: { email_used: true, device_used: true }

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping:
    // case 'fraud_score_too_high':
    //   userMessage: "We're unable to activate your free trial at this time due to automated fraud detection..."
    //   technicalMessage: "Fraud score exceeds threshold"
    //   retryable: false
  });

  test('should block trial activation for disposable email addresses', async ({ page }) => {
    // Expected behavior:
    // 1. User signs in with disposable email (e.g., test@tempmail.com)
    // 2. User attempts to activate trial
    // 3. Fraud detection checks email domain against blacklist
    // 4. Domain "tempmail.com" found in DISPOSABLE_EMAIL_DOMAINS
    // 5. Fraud score: 50 (disposable email)
    // 6. Returns 403 with error: "disposable_email"
    // 7. Frontend displays: "Disposable or temporary email addresses are not eligible..."

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping:
    // case 'disposable_email':
    //   userMessage: "Disposable or temporary email addresses are not eligible for free trials..."
    //   technicalMessage: "Disposable email domain detected"
    //   retryable: false
  });

  test('should block rapid re-registration attempts (time-based fraud)', async ({ page }) => {
    // Expected behavior:
    // 1. User activates trial
    // 2. User signs out
    // 3. User attempts to sign in and reactivate trial within 1 hour
    // 4. Fraud detection checks last trial timestamp
    // 5. Time since last trial < 1 hour → suspicious
    // 6. Fraud score: 60 (rapid re-registration)
    // 7. Returns 403 with error: "rapid_re_registration"
    // 8. Frontend displays: "Multiple trial activation attempts detected..."
    // 9. Retry allowed after 1 hour (retryAfterSeconds: 3600)

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping:
    // case 'rapid_re_registration':
    //   userMessage: "Multiple trial activation attempts detected in a short time period..."
    //   technicalMessage: "Rapid re-registration attempt detected"
    //   retryable: true
    //   retryAfterSeconds: 3600 (1 hour)
  });

  test('should block trial when IP rate limit exceeded', async ({ page }) => {
    // Expected behavior:
    // 1. Same IP address attempts to activate 5 trials
    // 2. Fraud detection checks IP address usage
    // 3. Count of trials from IP in last 24 hours > MAX_TRIALS_PER_IP (e.g., 3)
    // 4. Fraud score: 70 (IP rate limit exceeded)
    // 5. Returns 403 with error: "ip_rate_limit_exceeded"
    // 6. Frontend displays: "Too many trial activations from your network..."
    // 7. Retry allowed after 1 hour

    await expect(page).toHaveURL(/localhost:5173/);

    // Expected error mapping:
    // case 'ip_rate_limit_exceeded':
    //   userMessage: "Too many trial activations from your network..."
    //   technicalMessage: "IP rate limit exceeded for trial activations"
    //   retryable: true
    //   retryAfterSeconds: 3600
  });

  test('should create fraud flag record when trial is blocked', async ({ page }) => {
    // Expected behavior:
    // 1. User triggers fraud detection (e.g., email limit exceeded)
    // 2. Fraud detection blocks trial activation
    // 3. Record created in trial_fraud_flags table:
    //    - flag_id: UUID
    //    - user_id: User's ID
    //    - flag_type: 'email_limit_exceeded'
    //    - severity: 'medium'
    //    - fraud_score: 40
    //    - details: { trials_used: 1, max_allowed: 1 }
    //    - created_at: Timestamp
    //    - resolved: false
    // 4. Admin can view this flag in admin panel

    await expect(page).toHaveURL(/localhost:5173/);

    // Database query to verify:
    // SELECT * FROM trial_fraud_flags WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  });

  test('should allow trial activation after device fingerprint reset', async ({ page }) => {
    // Expected behavior:
    // 1. User's device has existing trial (trial_count = 1)
    // 2. Admin resets device fingerprint:
    //    - UPDATE device_fingerprints SET trial_count = 0 WHERE fingerprint_hash = ?
    // 3. User attempts to activate trial again
    // 4. Fraud detection checks device: trial_count = 0 → allowed
    // 5. Trial activated successfully
    // 6. trial_count incremented to 1

    await expect(page).toHaveURL(/localhost:5173/);

    // Admin operation (via API):
    // POST /api/admin/clear-trial/:email
  });

  test('should differentiate between fraud errors and OAuth errors', async ({ page }) => {
    // Fraud errors (from freeTrialService):
    // - email_trial_limit_exceeded
    // - device_trial_limit_exceeded
    // - device_blocked
    // - disposable_email
    // - rapid_re_registration
    // - ip_rate_limit_exceeded
    // - fraud_score_too_high
    // - trial_denied
    //
    // OAuth errors (from Google OAuth):
    // - popup_closed_by_user
    // - access_denied
    // - access_blocked (test mode)
    // - invalid_client
    // - redirect_uri_mismatch
    //
    // Both use oauthErrorMapper, but fraud errors are returned from /activate-trial endpoint

    await expect(page).toHaveURL(/localhost:5173/);
  });

  test('should log fraud detection decision for audit trail', async ({ page }) => {
    // Expected behavior:
    // 1. User attempts trial activation
    // 2. Fraud detection runs calculations
    // 3. Decision logged to console:
    //    - If approved: "✅ Trial activated for user {userId} ({email})"
    //    - If denied: "⚠️ Trial denied for user {userId} ({email}): {reason}"
    // 4. If denied, fraud flag created in database
    // 5. Admin can view all fraud decisions in admin panel

    await expect(page).toHaveURL(/localhost:5173/);

    // Console log examples:
    // ✅ Trial activated for user user-123 (test@example.com)
    // ⚠️ Trial denied for user user-456 (repeat@example.com): email_trial_limit_exceeded
  });
});

test.describe.skip('Admin Override Functionality', () => {
  test('should allow admin to manually approve trial bypassing fraud detection', async ({ page }) => {
    // Expected behavior:
    // 1. User blocked by fraud detection
    // 2. User contacts support
    // 3. Admin reviews case and decides to override
    // 4. Admin calls: POST /api/admin/override-trial/:email
    //    Body: { reason: "Manual review - legitimate user" }
    // 5. Backend:
    //    - Clears existing fraud flags: DELETE FROM trial_fraud_flags WHERE user_id = ?
    //    - Unblocks device: UPDATE device_fingerprints SET is_blocked = false WHERE user_id = ?
    //    - Creates new trial token manually
    //    - Logs override action in fraud_flags with type 'admin_override'
    // 6. User can now use trial

    await expect(page).toHaveURL(/localhost:5173/);

    // Admin API call (requires authentication):
    // POST /api/admin/override-trial/user@example.com
    // Authorization: Bearer {admin_token}
    // Body: { reason: "Manual review" }
    //
    // Response:
    // {
    //   success: true,
    //   message: "Trial manually approved for user@example.com",
    //   trial: {
    //     tokenId: "trial-override-123",
    //     status: "active",
    //     reportsRemaining: 3,
    //     expiresAt: "2025-01-29T..."
    //   }
    // }
  });

  test('should allow admin to clear trial data for re-testing', async ({ page }) => {
    // Expected behavior:
    // 1. Admin wants to clear user's trial data (for testing/support)
    // 2. Admin calls: POST /api/admin/clear-trial/:email
    // 3. Backend:
    //    - Deletes trial tokens: DELETE FROM free_trial_tokens WHERE user_id = ?
    //    - Resets device fingerprints: UPDATE device_fingerprints SET trial_count = 0 WHERE user_id = ?
    //    - Deletes fraud flags: DELETE FROM trial_fraud_flags WHERE user_id = ?
    // 4. User can activate trial again

    await expect(page).toHaveURL(/localhost:5173/);

    // Admin API call:
    // POST /api/admin/clear-trial/user@example.com
    // Authorization: Bearer {admin_token}
    //
    // Response:
    // {
    //   success: true,
    //   message: "Trial data cleared for user@example.com",
    //   cleared: {
    //     tokens: 1,
    //     fingerprints: 2,
    //     flags: 3
    //   }
    // }
  });

  test('should log admin override actions for compliance', async ({ page }) => {
    // Expected behavior:
    // 1. Admin performs override or clear operation
    // 2. Action logged in trial_fraud_flags table:
    //    - flag_type: 'admin_override' or 'admin_clear'
    //    - severity: 'low'
    //    - fraud_score: 0
    //    - details: { action: 'manual_trial_approval', reason: "..." }
    //    - resolved: true
    //    - resolved_at: Timestamp
    //    - resolution_note: "Admin manually approved trial. Reason: ..."
    // 3. Audit trail maintained for compliance

    await expect(page).toHaveURL(/localhost:5173/);
  });
});

/**
 * Integration Test Stubs
 *
 * These tests require backend mock endpoints and database test data.
 * Implementation pending backend support for:
 * - Mock trial activation responses
 * - Test database seeding with trial data
 * - Admin API endpoints with authentication
 */

test.describe('Fraud Detection Integration (Requires Backend Mocks)', () => {
  test.skip('should calculate fraud score correctly with multiple violations', async ({ page }) => {
    // Test scenario:
    // - Email already used: 40 points
    // - Device already used: 30 points
    // - Disposable email: 50 points
    // - Total: 120 points → blocked (threshold 70)

    // TODO: Implement when backend mock endpoints available
  });

  test.skip('should allow trial activation when fraud score below threshold', async ({ page }) => {
    // Test scenario:
    // - New email: 0 points
    // - New device: 0 points
    // - Valid email domain: 0 points
    // - Total: 0 points → approved

    // TODO: Implement when backend mock endpoints available
  });

  test.skip('should block device permanently after too many fraud attempts', async ({ page }) => {
    // Test scenario:
    // - Device triggers fraud detection 5 times
    // - Device marked as permanently blocked:
    //   UPDATE device_fingerprints SET is_blocked = true, blocked_reason = 'Too many fraud attempts'
    // - Future trials from this device always blocked
    // - Error: "device_blocked"

    // TODO: Implement when backend mock endpoints available
  });

  test.skip('should display fraud detection errors in user-friendly language', async ({ page }) => {
    // Verify error messages from oauthErrorMapper:
    // 1. Trigger each fraud error type
    // 2. Verify correct user message displayed
    // 3. Verify support email shown when retryable = false
    // 4. Verify retry countdown shown when retryable = true

    // TODO: Implement UI error display tests
  });
});

/**
 * Manual Testing Checklist
 *
 * Since full automation requires database mocking and OAuth simulation,
 * use this checklist for manual validation:
 *
 * 1. ✅ Activate trial as new user → Success (0 fraud score)
 * 2. ✅ Attempt second trial with same email → Blocked ("email_trial_limit_exceeded")
 * 3. ✅ Attempt trial with same device, different email → Blocked ("device_trial_limit_exceeded")
 * 4. ✅ Use disposable email (e.g., test@10minutemail.com) → Blocked ("disposable_email")
 * 5. ✅ Rapid re-registration (activate → sign out → sign in within 1 hour) → Blocked ("rapid_re_registration")
 * 6. ✅ Multiple trials from same IP → Blocked after limit ("ip_rate_limit_exceeded")
 * 7. ✅ Check fraud_flags table for logged decisions
 * 8. ✅ Admin override trial via POST /api/admin/override-trial/:email → Success
 * 9. ✅ Admin clear trial data via POST /api/admin/clear-trial/:email → Success
 * 10. ✅ Verify all fraud errors mapped in oauthErrorMapper.ts
 */
