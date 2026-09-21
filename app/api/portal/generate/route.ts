import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";

/**
 * RETIRED (RA-7634). This route minted stateless HMAC portal links that staff
 * could not revoke or rotate, so a link sent to the wrong person stayed live
 * until it expired. It now mints nothing.
 *
 * Staff share a claim through POST /api/inspections/[id]/client-portal-link,
 * which issues a revocable, expiring ClientPortalAccount link. HMAC links
 * already in the wild still open read-only until their 7-day expiry (see
 * lib/portal/resolve-portal-inspection.ts).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  return apiError(request, {
    code: "GONE",
    message:
      "This way of sharing a claim has been retired. Use Send to Client on the inspection instead.",
    status: 410,
  });
}
