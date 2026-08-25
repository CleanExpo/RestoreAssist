import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import { PilotContractError, requirePilotWorkspace } from "@/lib/pilot-tester/budget-contract";
import { resolveUnresolvedPilotAdjuster } from "@/lib/ai/adjuster-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  try {
    const csrfError = validateCsrf(request, { requireOrigin: true });
    if (csrfError) return csrfError;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    await requirePilotWorkspace(session.user.id, workspaceId);
    const { receiptId } = await params;
    return NextResponse.json(await resolveUnresolvedPilotAdjuster({
      workspaceId, receiptId,
      outcome: body.outcome === "CHARGED" ? "CHARGED"
        : body.outcome === "CONFIRMED_NOT_CHARGED" ? "CONFIRMED_NOT_CHARGED" : "" as never,
      costUsd: typeof body.costUsd === "number" ? body.costUsd : Number.NaN,
      evidenceReference: typeof body.evidenceReference === "string" ? body.evidenceReference : "",
      actorUserId: session.user.id,
    }));
  } catch (error) {
    if (error instanceof PilotContractError) {
      return apiError(request, {
        code: error.status === 400 ? "VALIDATION" : error.status === 409 ? "CONFLICT" : "NOT_FOUND",
        message: error.status === 404 ? "Pilot sandbox workspace not found" : error.message,
        status: error.status,
      });
    }
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return apiError(request, { code: "VALIDATION", message: error.message, status: 400 });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return apiError(request, { code: "NOT_FOUND", message: error.message, status: 404 });
    }
    if (error instanceof Error && (error.message.includes("unresolved") || error.message.includes("Conflicting") || error.message.includes("reconciled") || error.message.includes("raced"))) {
      return apiError(request, { code: "CONFLICT", message: error.message, status: 409 });
    }
    return fromException(request, error, { stage: "pilot-adjuster:recovery" });
  }
}
