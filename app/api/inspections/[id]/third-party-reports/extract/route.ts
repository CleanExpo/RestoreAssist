/**
 * POST /api/inspections/[id]/third-party-reports/extract
 * RA-7687 slice 1 - read a third-party laboratory PDF and PROPOSE facts.
 *
 * Request: multipart/form-data with a `file` field (PDF, max 20 MB).
 * Response: { proposal: { fileName, sha256, document, facts, gaps, rejectedCount } }
 *
 * This route never writes job data. The technician reviews each fact and the
 * sibling /confirm route writes only what they accept. The PDF is not stored
 * in this slice (follow-up: private storage and a virus-scan decision).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { applyRateLimit } from "@/lib/rate-limiter";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { logAiUsage, estimateCostUsd } from "@/lib/usage/log-usage";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import { formDataFromBytes, readBoundedBody } from "@/lib/media/bounded-body";
import {
  checkPdfBytes,
  extractLabReport,
  LAB_EXTRACT_MODEL,
  MAX_PDF_BYTES,
  sha256Hex,
  type ExtractLabReason,
} from "@/lib/third-party-report/extract";
import { compareFacts } from "@/lib/third-party-report/compare";

// A document block of a few pages costs well under this; used for the
// pre-call workspace budget check only. Actual cost is logged after the call.
const READ_COST_ESTIMATE_USD = 0.05;
const MAX_REQUEST_BYTES = MAX_PDF_BYTES + 1024 * 1024;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const REASON_STATUS: Record<ExtractLabReason, number> = {
  KEY_MISSING: 402,
  KEY_INVALID: 402,
  RATE_LIMITED: 429,
  MODEL_OVERLOADED: 503,
  TIMEOUT: 504,
  PARSE_FAILED: 502,
  API_ERROR: 502,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;
    const { id: inspectionId } = await params;

    const tenancy = await assertInspectionAssignedWrite(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Rule 8 - subscription gate before the AI call.
    const gate = await requireActiveSubscription(userId);
    if (gate) return gate;

    const rateLimited = await applyRateLimit(request, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX,
      prefix: "third-party-report",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    // Read and validate the upload before any spend.
    let formData: FormData;
    try {
      const body = await readBoundedBody(request, MAX_REQUEST_BYTES);
      if (!body) {
        return apiError(request, {
          code: "VALIDATION",
          message: "File too large - maximum 20 MB",
          status: 400,
        });
      }
      formData = await formDataFromBytes(request, body);
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid multipart body",
        status: 400,
      });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Missing file field",
        status: 400,
      });
    }
    const pdf = Buffer.from(await file.arrayBuffer());
    const check = checkPdfBytes(pdf);
    if (!check.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: check.error,
        status: 400,
      });
    }

    // Workspace daily AI budget (own key, own ceiling).
    const workspace = await getWorkspaceForUser(userId);
    if (workspace) {
      const budget = await checkWorkspaceBudget({
        workspaceId: workspace.id,
        estimatedCostUsd: READ_COST_ESTIMATE_USD,
      });
      if (!budget.ok) {
        return NextResponse.json(
          {
            error: budget.error,
            remainingUsd: budget.remainingUsd,
            budgetUsd: budget.budgetUsd,
          },
          { status: 429 },
        );
      }
    }

    // RA-6921 - the workspace's own key; never the platform key.
    let apiKey: string;
    try {
      apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (!(err instanceof NoWorkspaceKeyError)) throw err;
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "AI service unavailable",
        status: 402,
      });
    }

    const callStart = Date.now();
    const result = await extractLabReport({ apiKey, pdf });

    if (!result.ok) {
      console.error("[ThirdPartyReportExtract]", {
        userId,
        inspectionId,
        reason: result.reason,
      });
      if (workspace) {
        logAiUsage({
          workspaceId: workspace.id,
          provider: "ANTHROPIC",
          model: LAB_EXTRACT_MODEL,
          taskType: "third_party_report_extract",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: Date.now() - callStart,
          success: false,
          errorType: result.reason,
          metadata: { inspectionId },
        });
      }
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json(
        { error: result.reason },
        { status: REASON_STATUS[result.reason] ?? 502, headers },
      );
    }

    const { inputTokens, outputTokens } = result.data.usage;
    if (workspace) {
      logAiUsage({
        workspaceId: workspace.id,
        provider: "ANTHROPIC",
        model: LAB_EXTRACT_MODEL,
        taskType: "third_party_report_extract",
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(
          "ANTHROPIC",
          LAB_EXTRACT_MODEL,
          inputTokens,
          outputTokens,
        ),
        latencyMs: Date.now() - callStart,
        success: true,
        metadata: { inspectionId },
      });
    }

    // Read-only comparison with what the job holds today.
    const job = await prisma.mouldRemediationAssessment.findFirst({
      where: { inspectionId, inspection: tenancy.data.childInspectionFilter },
      select: {
        labName: true,
        labReportReference: true,
        samplingDate: true,
        sporeType: true,
        sporeCountPreRemediation: true,
        outdoorBaselineCount: true,
        sporeCountPostRemediation: true,
      },
    });
    const { facts, gaps } = compareFacts(result.data.facts, job);

    return NextResponse.json({
      proposal: {
        fileName: file.name.slice(0, 255),
        sha256: sha256Hex(pdf),
        document: result.data.document,
        facts,
        gaps,
        rejectedCount: result.data.rejectedCount,
      },
    });
  } catch (err) {
    return fromException(request, err, {
      stage: "third-party-reports:extract",
    });
  }
}
