import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import { PilotContractError, requirePilotWorkspace } from "@/lib/pilot-tester/budget-contract";
import { PilotJudgeError, resolveUnresolvedPilotJudge } from "@/lib/pilot-tester/judge";

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
    const result = await resolveUnresolvedPilotJudge({
      workspaceId, receiptId,
      outcome: body.outcome === "CHARGED" ? "CHARGED"
        : body.outcome === "CONFIRMED_NOT_CHARGED" ? "CONFIRMED_NOT_CHARGED" : "" as never,
      costUsd: typeof body.costUsd === "number" ? body.costUsd : Number.NaN,
      evidenceReference: typeof body.evidenceReference === "string" ? body.evidenceReference : "",
      actorUserId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PilotContractError) return apiError(request, {
      code: error.status === 400 ? "VALIDATION" : error.status === 409 ? "CONFLICT" : "NOT_FOUND",
      message: error.status === 404 ? "Pilot sandbox workspace not found" : error.message,
      status: error.status,
    });
    if (error instanceof PilotJudgeError) return apiError(request, {
      code: error.status === 400 ? "VALIDATION" : error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : "INTERNAL",
      message: error.message, status: error.status,
    });
    return fromException(request, error, { stage: "pilot-judge:recovery" });
  }
}
