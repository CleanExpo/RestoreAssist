/**
 * RA-8435 — the one owner of "a new Apple/Google account was created" for
 * the activation funnel.
 *
 * Accounts are created on three Apple/Google paths: the NextAuth adapter
 * (web), /api/auth/native-token-exchange (iPhone and Android app) and
 * /api/auth/google-signin (Firebase). Only the adapter path recorded
 * `signup_completed`, so app sign-ups never reached the activation funnel
 * and carried no campaign attribution. Every path calls this instead of
 * writing its own `track` call. `lib/auth/__tests__/oauth-signup.test.ts`
 * fails if a route under app/api/auth creates a user without importing it.
 *
 * Call it once, only after a NEW user row has been committed. Never call it
 * for a returning or newly linked account.
 */
import { parseFirstTouch } from "@/lib/analytics/attribution";
import { track } from "@/lib/analytics/track";

/**
 * Record `signup_completed` for a newly created Apple/Google account.
 *
 * @param userId              id of the User row that was just created
 * @param firstTouchCookieRaw raw value of the `ra_ft` (FIRST_TOUCH_COOKIE)
 *                            cookie from the sign-up request, if any
 *
 * Never throws: analytics must not fail a sign-in.
 */
export async function recordOAuthSignupCompleted(
  userId: string,
  firstTouchCookieRaw: string | undefined | null,
): Promise<void> {
  try {
    await track(userId, "signup_completed", {
      hasOrganization: false,
      method: "oauth",
      attribution: parseFirstTouch(firstTouchCookieRaw),
    });
  } catch (err) {
    console.error("[oauth-signup] signup_completed tracking failed:", err);
  }
}
