import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canCreateReport } from "@/lib/report-limits";
import { hasReportGenerationCredential } from "@/lib/ai/platform-trial-credential";
import { apiError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-6801 — BYOK or a funded platform trial both count as a generation
    // credential. This route never spends a key; it only reports whether the
    // workspace may proceed. Paid / expired / zero-credit accounts without
    // BYOK still get hasApiKey: false (D-022).
    const hasApiKey = await hasReportGenerationCredential(session.user.id);

    const result = await canCreateReport(session.user.id);

    return NextResponse.json({
      canCreate: result.allowed,
      reason: result.reason,
      hasApiKey,
    });
  } catch (error) {
    console.error("Error checking credits:", error);
    return NextResponse.json(
      { error: "Failed to check credits", canCreate: false, hasApiKey: false },
      { status: 500 },
    );
  }
}
