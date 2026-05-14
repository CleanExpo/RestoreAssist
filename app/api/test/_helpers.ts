/**
 * TEST-ONLY helpers for forging NextAuth session cookies in the E2E
 * test-helper routes under app/api/test/. Mirrors the JWT shape produced
 * by lib/auth.ts callbacks so middleware + getServerSession accept it.
 *
 * Never imported outside app/api/test/.
 */
import { encode } from "next-auth/jwt";

// Always the dev cookie name — these routes 404 in production, so the
// __Secure- prefix path is unreachable.
export const SESSION_COOKIE_NAME = "next-auth.session-token";

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
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
