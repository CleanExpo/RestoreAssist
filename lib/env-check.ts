// Environment variable validation
//
// REQUIRED  — production startup throws if missing. Vercel deploy fails fast
//             instead of bringing the app up in a broken state.
// RECOMMENDED — features degrade silently if missing; surfaced via /api/health
//               so monitoring can catch them.
//
// Promotion criteria for REQUIRED:
//   1. Without it, an entire feature class returns HTTP 500 on real users
//   2. Silent failure carries data-integrity risk (e.g. webhook events lost)
//   3. The env var is owner-controlled (not user-supplied), so its presence
//      is a deploy concern, not a runtime concern
//
// Stripe webhook is REQUIRED because RA-1801 demonstrated that a missing
// secret causes Stripe's retry loop to drop subscription state changes after
// 72h, silently corrupting User.subscriptionStatus for paying customers.

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_WEBHOOK_SECRET", // RA-1801 — missing webhook secret silently drifts subscription state
] as const;

const RECOMMENDED_VARS = [
  "STRIPE_SECRET_KEY",
  "CLOUDINARY_URL",
  "RESEND_API_KEY",
  // TURNSTILE_SECRET_KEY removed — replaced by Vercel BotID (no env var needed).
  "XERO_WEBHOOK_KEY", // RA-1802 — without it, Xero invoice/payment events return 500
  "GITHUB_WEBHOOK_SECRET", // RA-1803 — without it, auto-release-notes returns 500
] as const;

export interface EnvStatus {
  missingRequired: readonly string[];
  missingRecommended: readonly string[];
  ok: boolean;
}

/**
 * Snapshot the env-var validation state. Used by /api/health to surface
 * missing-secret warnings to operators + uptime monitoring.
 *
 * Read-only. Does not throw, regardless of NODE_ENV.
 */
export function getEnvStatus(): EnvStatus {
  const missingRequired = REQUIRED_VARS.filter((v) => !process.env[v]);
  const missingRecommended = RECOMMENDED_VARS.filter((v) => !process.env[v]);
  return {
    missingRequired,
    missingRecommended,
    ok: missingRequired.length === 0 && missingRecommended.length === 0,
  };
}

export function validateEnvironment(): boolean {
  // During `next build`, Vercel env vars are not injected — skip the check.
  // Validation runs at request time once the server is live.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return true;
  }

  const { missingRequired, missingRecommended } = getEnvStatus();

  if (missingRequired.length > 0) {
    console.error(
      `[env-check] Missing REQUIRED env vars: ${missingRequired.join(", ")}`,
    );
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Cannot start in production without: ${missingRequired.join(", ")}`,
      );
    }
    return false;
  }

  if (missingRecommended.length > 0) {
    console.warn(
      `[env-check] Missing recommended env vars (some features disabled): ${missingRecommended.join(", ")}`,
    );
  }

  return true;
}

// Validate on module load — safe because build phase is guarded above
validateEnvironment();
