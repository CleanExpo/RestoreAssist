import { test, expect } from "@playwright/test";

// TODO(setup-wizard sub-project #2): un-skip when the invited-technician
// onboarding flow lands. Requires:
//   - User.role = 'TECHNICIAN' invite flow
//   - app/onboarding/technician/page.tsx
//   - Middleware already routes TECHNICIAN role here (Phase 6 ships that)
test.skip("invited technician → routes to /onboarding/technician, NOT /setup", async ({
  page,
}) => {
  // This test would seed a technician user (via test fixture or invite acceptance)
  // and verify the middleware redirects them to /onboarding/technician.
  //
  // Pseudocode (depends on invite mechanism being built):
  //   1. Admin signs up + activates
  //   2. Admin invites a technician via /api/team/invite or similar
  //   3. Test extracts invite token (via test API or DB fixture)
  //   4. Test follows invite link → signs up as technician
  //   5. Test expects redirect to /onboarding/technician (not /setup)

  // For now, the assertion is documentary:
  await page.goto("/signup");
  expect(true).toBe(true); // placeholder
});
