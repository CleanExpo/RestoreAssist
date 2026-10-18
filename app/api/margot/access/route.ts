/**
 * GET /api/margot/access — confirms the caller may use founder Margot surfaces.
 *
 * Platform-staff only. `role: "ADMIN"` is every self-registered business, so
 * a non-operator gets 403 like every other Margot route, and the operator
 * allowlist / dev-open configuration is never described to them.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  // Platform-owned surface: tenant ADMIN is every self-registered owner.
  const operator = verifyPlatformSupportOperator(auth);
  if (operator.response) return operator.response;

  const allowlistConfigured =
    (process.env.PLATFORM_SUPPORT_USER_IDS ?? "").trim().length > 0;
  const devOpen =
    process.env.NODE_ENV === "development" &&
    process.env.PLATFORM_SUPPORT_DEV_OPEN === "true" &&
    !allowlistConfigured;

  return Response.json({
    allowed: true,
    userId: auth.user!.id,
    role: auth.user!.role,
    devOpen,
  });
}
