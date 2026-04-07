// Environment variable validation
const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

const RECOMMENDED_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CLOUDINARY_URL",
  "RESEND_API_KEY",
] as const;

export function validateEnvironment(): boolean {
  // During `next build`, Vercel env vars are not injected — skip the check.
  // Validation runs at request time once the server is live.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return true;
  }

  const missingRequired = REQUIRED_VARS.filter((v) => !process.env[v]);
  const missingRecommended = RECOMMENDED_VARS.filter((v) => !process.env[v]);

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
