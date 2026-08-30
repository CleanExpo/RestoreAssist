import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in to store a floor-plan render.",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Inspection not found",
        status: tenancy.status,
      });
    }
    return apiError(request, {
      code: "FEATURE_UNAVAILABLE",
      message:
        "Client PNG render upload is retired. Canonical floor plans are rendered server-side from saved geometry.",
      status: 409,
    });
  } catch (error) {
    return fromException(request, error, { stage: "sketch-render:store" });
  }
}
