import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canCreateReport } from "@/lib/report-limits";
import { hasActiveOperatingProviderConnection } from "@/lib/workspace/provider-connections";
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

    // RA-6932 (P0) — this route only reports whether the workspace has a key
    // configured; it never spends one. Check the BYOK ProviderConnection store
    // (the source of truth for workspace keys) instead of getAnthropicApiKey,
    // which would report `true` off the platform ANTHROPIC_API_KEY fallback and
    // mislead a keyless workspace into thinking it can generate.
    const hasApiKey = await hasActiveOperatingProviderConnection(
      session.user.id,
    );

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
