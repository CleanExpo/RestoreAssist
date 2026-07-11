/**
 * TEST-ONLY helpers for forging NextAuth session cookies in the E2E
 * test-helper routes under app/api/test/. Mirrors the JWT shape produced
 * by lib/auth.ts callbacks so middleware + getServerSession accept it.
 *
 * Never imported outside app/api/test/.
 */
import { encode } from "next-auth/jwt";

// Vercel preview/sandbox deploys run with NODE_ENV=production, which makes
// NextAuth read `__Secure-next-auth.session-token` and refuse cookies missing
// the `Secure` flag. The test helpers are gated by ALLOW_TEST_HELPERS (not
// NODE_ENV), so they DO run on sandbox — we must mirror NextAuth's prod
// cookie name + Secure flag, otherwise getServerSession can't see the
// session and the page renders the logged-out shell.
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

interface ForgeArgs {
  userId: string;
  email: string;
  role: "USER" | "ADMIN" | "MANAGER";
  setupCompletedAt?: Date | null;
}

const MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // matches authOptions.session.maxAge

/**
 * Mint a NextAuth-compatible JWT for the given user. The payload mirrors
 * the shape lib/auth.ts assembles in its jwt() callback so downstream
 * middleware + session() callback treat it as a valid login.
 */
export async function forgeSessionJwt(args: ForgeArgs): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");

  const nowSeconds = Math.floor(Date.now() / 1000);

  const token = await encode({
    secret,
    maxAge: MAX_AGE_SECONDS,
    token: {
      sub: args.userId,
      email: args.email,
      role: args.role,
      // Custom claims mirrored from lib/auth.ts callbacks
      mintedAt: nowSeconds,
      rememberMe: true,
      customExp: nowSeconds + MAX_AGE_SECONDS,
      needsOnboarding: false,
      revocationChecked: true,
      setupCompletedAt:
        args.setupCompletedAt instanceof Date
          ? args.setupCompletedAt.toISOString()
          : null,
    },
  });

  return token;
}

export function sessionCookieAttributes(maxAgeSeconds: number = MAX_AGE_SECONDS): string {
  const base = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
  // NextAuth requires the Secure flag in production; the `__Secure-` cookie
  // prefix is also browser-enforced HTTPS-only.
  return process.env.NODE_ENV === "production" ? `${base}; Secure` : base;
}

/**
 * Single source of truth for the test-helper route guard (RA-6680 / RA-6940).
 * Returns `true` when the helpers MUST be blocked (the route returns 404).
 *
 * Two INDEPENDENT env conditions must BOTH hold for the helpers to run:
 *
 *  1. `ALLOW_TEST_HELPERS === "true"` — the opt-in the sandbox project sets and
 *     the real production app never does.
 *  2. The deployment is not a locked-down production environment. Vercel runs
 *     BOTH the real production project AND the throwaway `restoreassist-sandbox`
 *     project with `VERCEL_ENV=production` (each is its own project's production
 *     target), so `VERCEL_ENV` alone cannot tell them apart. We therefore
 *     hard-block whenever `VERCEL_ENV === "production"` UNLESS the deployment
 *     ALSO opts in via `ALLOW_TEST_HELPERS_IN_PROD_ENV === "true"` — a second
 *     env the sandbox project sets and the real production app never does.
 *
 * Defense-in-depth invariant (unchanged from RA-6680): enabling session forging
 * on the REAL production app requires TWO independent env misconfigurations
 * (`ALLOW_TEST_HELPERS` AND `ALLOW_TEST_HELPERS_IN_PROD_ENV`), never one. The
 * sandbox — a throwaway environment with no real user data — sets both flags
 * deliberately so its E2E suite can forge sessions against its own prod-target
 * deploy.
 */
export function testHelpersBlocked(): boolean {
  const enabled = process.env.ALLOW_TEST_HELPERS === "true";
  const isVercelProduction = process.env.VERCEL_ENV === "production";
  const prodEnvOptIn = process.env.ALLOW_TEST_HELPERS_IN_PROD_ENV === "true";
  return !enabled || (isVercelProduction && !prodEnvOptIn);
}
