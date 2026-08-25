import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import { getIdempotencyKey } from "@/lib/idempotency";
import {
  PilotContractError,
  requirePilotWorkspace,
  reservePilotBudget,
} from "@/lib/pilot-tester/budget-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request, { requireOrigin: true });
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const idempotency = getIdempotencyKey(request);
    if (!idempotency.ok) return apiError(request, { code: "VALIDATION", message: idempotency.reason, status: 400 });
    if (!idempotency.key) {
      return apiError(request, { code: "VALIDATION", message: "Idempotency-Key is required", status: 400 });
    }
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const workspace = await requirePilotWorkspace(session.user.id, workspaceId);
    const ceilingUsd = typeof body.ceilingUsd === "number" ? body.ceilingUsd : Number.NaN;
    // The client does not get to choose a larger (or smaller) effective cap:
    // its receipt must prove the exact persisted workspace ceiling.
    if (workspace.aiDailyBudgetUsd === null || workspace.aiDailyBudgetUsd !== ceilingUsd) {
      return apiError(request, { code: "PRECONDITION_FAILED", message: "Pilot workspace budget must match the requested ceiling", status: 412 });
    }
    const receipt = await reservePilotBudget({
      actorUserId: session.user.id,
      workspaceId,
      runId: typeof body.runId === "string" ? body.runId : "",
      companyKey: typeof body.companyKey === "string" ? body.companyKey : "",
      jobKey: typeof body.jobKey === "string" ? body.jobKey : "",
      ceilingUsd,
      idempotencyKey: idempotency.key,
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    if (error instanceof PilotContractError) {
      return apiError(request, {
        code: error.status === 400 ? "VALIDATION" : error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : error.status === 429 ? "RATE_LIMITED" : "INTERNAL",
        message: error.message,
        status: error.status,
      });
    }
    return fromException(request, error, { stage: "pilot-budget:reserve" });
  }
}
