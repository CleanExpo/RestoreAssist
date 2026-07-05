import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { runDeterministicWeaknessChecks } from "@/lib/services/weakness-detection";
import type { WeaknessDetectionInput } from "@/lib/services/weakness-detection";
import { llmContradictionChecker } from "@/lib/services/weakness-detection/llm-contradiction-check";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

/**
 * RA-5041 (PR2): POST /api/reports/[id]/weakness-check
 *
 * Runs the weakness-detection pass over a single report before Senior PM
 * handover. The deterministic layer (redline language, field completeness,
 * category separation, scope expansion) ALWAYS runs — it costs nothing. The
 * LLM contradiction/causation pass runs only when the calling workspace has
 * its own BYOK key: no key returns the deterministic findings plus a note
 * rather than a hard failure, because the deterministic value exists without
 * any spend (BYOK-mandatory policy — the platform never spends its own key).
 *
 * Advisory only: the API flags, the human decides (UI hard-stop surfacing is
 * the ticket's follow-up).
 */

// The BYOK model the premium `weakness_detection` task routes to when a
// workspace Anthropic key resolves (mirrors the report routes' default).
const WEAKNESS_CHECK_MODEL = "claude-sonnet-4-6" as const;

/** Map the flat Report row to the deterministic layer's structured input. */
function mapReportToWeaknessInput(report: {
  incidentDate: Date | null;
  technicianAttendanceDate: Date | null;
  waterCategory: string | null;
  waterClass: string | null;
  sourceOfWater: string | null;
  biologicalMouldDetected: boolean;
  biologicalMouldCategory: string | null;
  technicianFieldReport: string | null;
  reportInstructions: string | null;
}): WeaknessDetectionInput {
  return {
    incident: {
      dateOfLoss: report.incidentDate ? report.incidentDate.toISOString() : null,
      technicianAttendanceDate: report.technicianAttendanceDate
        ? report.technicianAttendanceDate.toISOString()
        : null,
      waterCategory: report.waterCategory,
      waterClass: report.waterClass,
      waterSource: report.sourceOfWater,
    },
    classification: {
      category: report.waterCategory,
      class: report.waterClass,
    },
    hazards: {
      biologicalMouldDetected: report.biologicalMouldDetected,
      biologicalMouldCategory: report.biologicalMouldCategory,
    },
    technicianNotes: report.technicianFieldReport,
    reportInstructions: report.reportInstructions,
  };
}

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
    const { id } = await params;

    // CLAUDE.md rule 8 — rate-limit on session.user.id, mirroring the sibling
    // report AI routes (reports/[id]/synopsis).
    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      prefix: "reports-weakness-check",
      key: userId,
      failClosedOnUpstashError: true,
    });
    if (rateLimited) return rateLimited;

    // CLAUDE.md rule 5 — subscription gate before any AI call, via the shared
    // helper (not an inline copy).
    const gate = await requireActiveSubscription(userId);
    if (gate) return gate;

    // Ownership-scoped fetch — only the fields the checks read.
    const report = await prisma.report.findFirst({
      where: { id, userId },
      select: {
        id: true,
        incidentDate: true,
        technicianAttendanceDate: true,
        waterCategory: true,
        waterClass: true,
        sourceOfWater: true,
        biologicalMouldDetected: true,
        biologicalMouldCategory: true,
        technicianFieldReport: true,
        reportInstructions: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Deterministic layer: always runs, zero spend.
    const input = mapReportToWeaknessInput(report);
    const deterministic = runDeterministicWeaknessChecks(input);

    // LLM pass only when the workspace's own key resolves. No key is NOT a
    // failure — deterministic findings still have value without any spend.
    let apiKey: string | null = null;
    try {
      apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (!(err instanceof NoWorkspaceKeyError)) throw err;
    }

    if (!apiKey) {
      return NextResponse.json({
        data: {
          findings: deterministic.findings,
          pendingLlmReview: deterministic.pendingLlmReview,
          llmReviewApplied: false,
          note: "No workspace AI key configured — returning deterministic findings only. Add your own key in Workspace Settings -> AI Providers to enable the LLM contradiction pass.",
        },
      });
    }

    const causationCandidates = deterministic.findings.filter(
      (f) => f.checkClass === "unsupported_causation",
    );
    const llmFindings = await llmContradictionChecker.review({
      report: input,
      pendingLlmReview: deterministic.pendingLlmReview,
      causationCandidates,
      apiKey,
      byokModel: WEAKNESS_CHECK_MODEL,
    });

    return NextResponse.json({
      data: {
        findings: [...deterministic.findings, ...llmFindings],
        pendingLlmReview: deterministic.pendingLlmReview,
        llmReviewApplied: true,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "report-weakness-check" });
  }
}
