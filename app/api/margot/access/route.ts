/**
 * GET /api/margot/access — whether the caller may use founder Margot surfaces.
 * Returns stable User.id for local PLATFORM_SUPPORT_USER_IDS setup.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const userId = auth.user!.id;
  const allowed = isPlatformSupportOperator(userId);
  const allowlistConfigured =
    (process.env.PLATFORM_SUPPORT_USER_IDS ?? "").trim().length > 0;
  const devOpen =
    process.env.NODE_ENV === "development" &&
    process.env.PLATFORM_SUPPORT_DEV_OPEN === "true" &&
    !allowlistConfigured;

  return Response.json({
    allowed,
    userId,
    role: auth.user!.role,
    allowlistConfigured,
    devOpen,
    hint: allowed
      ? null
      : allowlistConfigured
        ? `Add ${userId} to PLATFORM_SUPPORT_USER_IDS in .env and restart the dev server.`
        : "Set PLATFORM_SUPPORT_USER_IDS to your User.id, or PLATFORM_SUPPORT_DEV_OPEN=true for local dev (empty allowlist only).",
  });
}
