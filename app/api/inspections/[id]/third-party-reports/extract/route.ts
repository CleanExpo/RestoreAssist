/**
 * POST /api/inspections/[id]/third-party-reports/extract
 * RA-7687 slice 1 - read a third-party laboratory PDF and PROPOSE facts.
 *
 * Request: multipart/form-data with a `file` field (PDF, max 20 MB).
 * Response: { proposal: { proposalToken, fileName, sha256, document, facts, gaps, rejectedCount } }
 *
 * Spend authority is ADMIN or MANAGER (assertFinancialWriter, D-028: AI-key spend) plus write reach to the job. This route never writes job data. The technician reviews each fact and the
 * sibling /confirm route writes only what they accept. The PDF is not stored
 * in this slice (follow-up: private storage and a virus-scan decision).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertFinancialWriter,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { applyRateLimit } from "@/lib/rate-limiter";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { logAiUsage, estimateCostUsd } from "@/lib/usage/log-usage";
import {
  resolveAgentAiKey,
  PlatformKeyRefusedError,
} from "@/lib/agents/ai-bridge";
import { formDataFromBytes, readBoundedBody } from "@/lib/media/bounded-body";
import {
  checkPdfBytes,
  extractLabReport,
  getPdfPageCount,
  LAB_EXTRACT_MODEL,
  MAX_PDF_BYTES,
  sha256Hex,
  usageFromFailure,
  type ExtractLabReason,
} from "@/lib/third-party-report/extract";
import { compareFacts } from "@/lib/third-party-report/compare";
import {
  PROPOSAL_TTL_MS,
  signProposal,
} from "@/lib/third-party-report/proposal-token";

// A document block of a few pages costs well under this; used for the
// pre-call workspace budget check only. Actual cost is logged after the call.
const READ_COST_ESTIMATE_USD = 0.05;
const MAX_REQUEST_BYTES = MAX_PDF_BYTES + 1024 * 1024;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// The provider refused the call before doing any work (bad key, throttled,
// overloaded): nothing was billed. Anything else may have been.
const NO_SPEND_REASONS: readonly ExtractLabReason[] = [
  "KEY_MISSING",
  "KEY_INVALID",
  "RATE_LIMITED",
  "MODEL_OVERLOADED",
];

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

    // D-028: spending the workspace's AI key at a technician's request is a
    // cost decision the founder has not made. assertFinancialWriter is the
    // repo's one "may spend the business's credits" rule (ADMIN or MANAGER,
    // role re-read from the database), so an ordinary workspace member is
    // refused here. Confirming facts (a field write) is not spend and admits
    // the assigned technician.
    const spender = await assertFinancialWriter(session);
    if (!spender.ok) {
      return NextResponse.json(
        { error: spender.reason },
        { status: spender.status },
      );
    }
    // Reach to the job is the product's write reach, the same the confirm
    // route re-checks before it writes.
    const tenancy = await resolveInspectionWrite(session, inspectionId);
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

    // Page references are only shown against a count a real PDF parser
    // verified, so a file it cannot parse is refused before any spend.
    const pageCount = await getPdfPageCount(pdf);
    if (pageCount < 1) {
      return apiError(request, {
        code: "VALIDATION",
        message: "This PDF could not be read. Upload the original report PDF.",
        status: 400,
      });
    }

    // RA-8001 - the workspace's own key and never the funded-trial platform
    // key, through the one shared resolver and refusal rule. The workspace that
    // owns that key is the one whose budget is checked and whose usage is
    // logged, so a manager in several workspaces cannot charge the wrong one
    // and the budget check cannot be skipped.
    const job = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionWhere,
      select: { userId: true, workspaceId: true },
    });
    if (!job) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    let resolved: Awaited<ReturnType<typeof resolveAgentAiKey>>;
    try {
      resolved = await resolveAgentAiKey(job.userId, "byok-only");
    } catch (err) {
      if (!(err instanceof PlatformKeyRefusedError)) throw err;
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message:
          "Reading a report runs on your own Anthropic API key. Add it in Workspace Settings, AI Providers.",
        status: 402,
      });
    }
    if (!resolved.workspaceId) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "AI service unavailable",
        status: 402,
      });
    }
    // The key and the cap must belong to the job's own workspace.
    // Inspection.workspaceId is nullable and no create path writes it, so the
    // job's business is fixed by its owner: the key is resolved for the JOB
    // OWNER, never for the caller. An admin in two workspaces reading a job in
    // workspace B therefore spends B's key and cap, not A's. Where the job does
    // record a workspace it must be the one that owns the resolved key.
    if (job.workspaceId && job.workspaceId !== resolved.workspaceId) {
      return apiError(request, {
        code: "FORBIDDEN",
        message:
          "This job's workspace does not match the AI key available for it.",
        status: 403,
      });
    }
    const workspaceId = resolved.workspaceId;
    const apiKey = resolved.apiKey;

    const budget = await checkWorkspaceBudget({
      workspaceId,
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

    const callStart = Date.now();
    const result = await extractLabReport({ apiKey, pdf, pageCount });

    if (!result.ok) {
      console.error("[ThirdPartyReportExtract]", {
        userId,
        inspectionId,
        reason: result.reason,
      });
      // A read that reached the provider is billed even when its reply is
      // unusable. Charge the usage it reported, or the bounded estimate when
      // none came back (a timeout), so the daily ceiling sees the spend.
      const billed = usageFromFailure(result.cause);
      // Allow-list of reasons that prove the provider did no billable work;
      // every other reason, including any added later, is charged.
      const provedNoSpend = NO_SPEND_REASONS.includes(result.reason);
      logAiUsage({
        workspaceId,
        provider: "ANTHROPIC",
        model: LAB_EXTRACT_MODEL,
        taskType: "third_party_report_extract",
        inputTokens: billed?.inputTokens ?? 0,
        outputTokens: billed?.outputTokens ?? 0,
        estimatedCostUsd: billed
          ? estimateCostUsd(
              "ANTHROPIC",
              LAB_EXTRACT_MODEL,
              billed.inputTokens,
              billed.outputTokens,
            )
          : provedNoSpend
            ? 0
            : READ_COST_ESTIMATE_USD,
        latencyMs: Date.now() - callStart,
        success: false,
        errorType: result.reason,
        metadata: { inspectionId },
      });
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
    logAiUsage({
      workspaceId,
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

    // Read-only comparison with what the job holds today.
    const current = await prisma.mouldRemediationAssessment.findFirst({
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
    const { facts, gaps } = compareFacts(result.data.facts, current);

    const fileName = file.name.slice(0, 255);
    const sha256 = sha256Hex(pdf);
    const proposalToken = signProposal({
      inspectionId,
      userId,
      sha256,
      fileName,
      document: result.data.document,
      facts: result.data.facts,
      exp: Date.now() + PROPOSAL_TTL_MS,
    });

    return NextResponse.json({
      proposal: {
        proposalToken,
        fileName,
        sha256,
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
