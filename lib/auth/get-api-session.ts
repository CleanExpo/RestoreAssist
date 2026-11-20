import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

type ApiSession = {
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    role?: string;
  };
};

/**
 * Session for App Router API handlers.
 *
 * `getServerSession(authOptions)` is the primary path (CLAUDE.md / RULES).
 * In Next.js 16 route handlers the cookie store can come back without a
 * usable `user.id` even when the request still carries
 * `next-auth.session-token`. Fall back to `getToken({ req })` so dashboard
 * GETs do not 401 a logged-in operator.
 */
export async function getApiSession(
  req?: NextRequest,
): Promise<ApiSession | null> {
  const session = (await getServerSession(authOptions)) as ApiSession | null;
  if (session?.user?.id) return session;
  if (!req) return session;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.sub) return session;

  // Apply the same limits as the session() callback in lib/auth.ts, which
  // strips the user past customExp or after a revoke. Without this, the
  // fallback would bring back a session the callback just ended. A token
  // with no customExp has no absolute lifetime, so it is refused here too:
  // GET /api/user/profile relies on every accepted token expiring within
  // 90 days, before the cleanup cron purges the ACCOUNT_DELETED tombstone.
  const customExp = (token as { customExp?: unknown }).customExp;
  if (
    (token as { revoked?: unknown }).revoked ||
    typeof customExp !== "number" ||
    Math.floor(Date.now() / 1000) > customExp
  ) {
    return session;
  }

  return {
    ...session,
    user: {
      ...(session?.user ?? {}),
      id: token.sub,
      email: token.email ?? session?.user?.email,
      name: typeof token.name === "string" ? token.name : session?.user?.name,
      role:
        typeof (token as { role?: string }).role === "string"
          ? (token as { role: string }).role
          : session?.user?.role,
    },
  };
}
