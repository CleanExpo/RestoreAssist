/**
 * Admin route authentication helpers.
 *
 * Problem: NextAuth JWT sessions cache `session.user.role` at sign-in time.
 * If an admin is demoted in the database, their existing session still carries
 * the old `role: "ADMIN"` value until the JWT expires (up to 30 days by default).
 *
 * Solution: After the JWT role check, do a lightweight secondary DB lookup to
 * confirm the role is still current. This adds ~1 DB round-trip per admin request
 * which is acceptable for infrequently-used admin routes.
 */

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export interface AdminAuthResult {
  /** Set when authentication is valid — contains the DB-verified user record */
  user?: {
    id: string;
    role: string;
    organizationId: string | null;
  };
  /** Set when authentication fails — return this response immediately */
  response?: NextResponse;
}

/**
 * Verify that the current session user is an ADMIN and that this role is still
 * current in the database (not a stale JWT claim).
 *
 * Returns `{ user }` on success or `{ response }` to return immediately on failure.
 *
 * Usage:
 * ```ts
 * const auth = await verifyAdminFromDb(session)
 * if (auth.response) return auth.response
 * const { user } = auth
 * ```
 */
export async function verifyAdminFromDb(
  session: Session | null,
): Promise<AdminAuthResult> {
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // JWT role is a fast pre-check — avoids DB call for non-admin sessions
  if (session.user.role !== "ADMIN") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  // Secondary DB lookup — re-validates the role is still current
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    user: {
      id: dbUser.id,
      role: dbUser.role,
      organizationId: dbUser.organizationId,
    },
  };
}

/**
 * Server-page gate for admin UI segments.
 *
 * Prefer this over JWT-only checks in `page.tsx` / client layouts: demoted
 * admins with a stale session are redirected before any admin UI or Prisma
 * reads run. Shared by `/dashboard/admin/**`, governance, margot, and
 * mission-control layouts.
 */
export async function requireAdminPage(): Promise<{
  id: string;
  role: string;
  organizationId: string | null;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const auth = await verifyAdminFromDb(session);
  if (!auth.user) {
    redirect("/dashboard");
  }

  return auth.user;
}

/**
 * Store publishing mutates RestoreAssist's platform-owned App Store and Google
 * Play listings, so tenant ADMIN is not sufficient authority. Operators must
 * be explicitly allowlisted by stable User.id in server configuration.
 * Missing or empty configuration deliberately fails closed.
 */
export function verifyStorePublishingOperator(
  auth: AdminAuthResult,
): AdminAuthResult {
  const operatorIds = new Set(
    (process.env.STORE_PUBLISHING_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (!auth.user || !operatorIds.has(auth.user.id)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth;
}
