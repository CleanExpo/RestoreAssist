import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import { getIdempotencyKey } from "@/lib/idempotency";
import { PilotContractError, requirePilotWorkspace } from "@/lib/pilot-tester/budget-contract";
import { judgePilotAssessment, PilotJudgeError } from "@/lib/pilot-tester/judge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request, { requireOrigin: true });
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    const idempotency = getIdempotencyKey(request);
    if (!idempotency.ok) return apiError(request, { code: "VALIDATION", message: idempotency.reason, status: 400 });
    if (!idempotency.key) {
      return apiError(request, { code: "VALIDATION", message: "Idempotency-Key is required", status: 400 });
    }
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    await requirePilotWorkspace(session.user.id, workspaceId);
    const receipt = await judgePilotAssessment({
      actorUserId: session.user.id,
      workspaceId,
      inspectionId: typeof body.inspectionId === "string" ? body.inspectionId : "",
      assessmentGenerationId: typeof body.assessmentGenerationId === "string" ? body.assessmentGenerationId : "",
      assessmentSha256: typeof body.assessmentSha256 === "string" ? body.assessmentSha256 : "",
      idempotencyKey: idempotency.key,
    });
    return NextResponse.json(receipt);
  } catch (error) {
    if (error instanceof PilotContractError) return apiError(request, {
      code: error.status === 400 ? "VALIDATION" : error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : error.status === 429 ? "RATE_LIMITED" : "INTERNAL",
      message: error.message,
      status: error.status,
    });
    if (error instanceof PilotJudgeError) return apiError(request, {
      code: error.status === 400 ? "VALIDATION" : error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : "UPSTREAM_FAILED",
      message: error.message,
      status: error.status,
    });
    return fromException(request, error, { stage: "pilot-judge" });
  }
}
