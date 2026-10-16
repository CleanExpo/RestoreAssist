import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";
import { lookupAbn } from "@/lib/integrations/abr/client";
import { apiError, fromException } from "@/lib/api-errors";

/** GET /api/admin/integrations/abr/ping — staff-only ABR configuration check. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Re-read the role from the DB (a JWT claim outlives a demotion), then
    // require the staff allowlist: tenant ADMIN is not RestoreAssist staff.
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    if (!auth.user || !isPlatformSupportOperator(auth.user.id)) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    if (!process.env.ABR_API_GUID?.trim()) {
      return NextResponse.json({
        ok: false,
        reason: "CONFIG_ERROR",
        message: "ABR_API_GUID is not set on this environment.",
      });
    }

    // Known-valid test ABN (checksum passes); ABR may still return NOT_FOUND for fake entity.
    const probe = await lookupAbn("51824753556");
    if (probe.ok) {
      return NextResponse.json({
        ok: true,
        reason: "REACHABLE",
        legalName: probe.data.legalName,
      });
    }

    return NextResponse.json({
      ok: probe.reason !== "CONFIG_ERROR",
      reason: probe.reason,
      message:
        probe.reason === "CONFIG_ERROR"
          ? "ABR GUID misconfigured."
          : probe.reason === "MALFORMED"
            ? "Internal probe ABN invalid."
            : "ABR reachable but lookup did not return entity data (acceptable for probe).",
    });
  } catch (error) {
    return fromException(request, error, { stage: "abr-ping" });
  }
}
