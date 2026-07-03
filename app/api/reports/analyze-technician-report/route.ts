import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import {
  analyseTechnicianReport,
  type TechReportAnalysis,
} from "@/lib/services/ai/analyse-technician-report";
import { apiError } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// POST - Analyze technician report using AI
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "analyze-tech",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: AI analysis — retry doubles spend on identical report input.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      // Subscription gate — CANCELED/PAST_DUE users must not run AI generation
      const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
      if (
        !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Active subscription required",
          status: 402,
        });
      }

      let parsed: { reportId?: string } = {};
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { reportId } = parsed;

      if (!reportId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Report ID is required",
          status: 400,
        });
      }

      // Get the report
      const report = await prisma.report.findUnique({
        where: { id: reportId, userId: user.id },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      if (!report.technicianFieldReport) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Technician field report is required for analysis",
          status: 400,
        });
      }

      // RA-6932 (P0) — resolve the calling workspace's own BYOK Anthropic key.
      // Never falls through to the platform ANTHROPIC_API_KEY — a workspace
      // without a configured key gets a hard 402 PAYMENT_REQUIRED.
      let anthropicApiKey: string;
      try {
        anthropicApiKey = (await resolveWorkspaceAiKey(user.id, "ANTHROPIC"))
          .apiKey;
      } catch (error) {
        if (error instanceof NoWorkspaceKeyError) {
          return apiError(request, {
            code: "PAYMENT_REQUIRED",
            message: error.message,
            status: 402,
          });
        }
        throw error;
      }

      const result = await analyseTechnicianReport({
        apiKey: anthropicApiKey,
        report: {
          technicianFieldReport: report.technicianFieldReport!,
          propertyAddress: report.propertyAddress,
          propertyPostcode: report.propertyPostcode,
          incidentDate: report.incidentDate,
          technicianAttendanceDate: report.technicianAttendanceDate,
        },
      });

      if (!result.ok) {
        console.error("[analyze-technician-report]", {
          reportId,
          userId,
          reason: result.reason,
          detail: result.detail,
        });
        const status =
          result.reason === "RATE_LIMITED"
            ? 429
            : result.reason === "MODEL_OVERLOADED"
              ? 503
              : 500;
        const headers: Record<string, string> =
          result.retryAfterMs != null
            ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
            : {};
        return NextResponse.json(
          {
            error:
              result.reason === "RATE_LIMITED" ||
              result.reason === "MODEL_OVERLOADED"
                ? "AI service temporarily unavailable. Please try again."
                : "Failed to analyze technician report",
          },
          { status, headers },
        );
      }

      const analysis: TechReportAnalysis = result.data.analysis;

      // Save analysis to report
      await prisma.report.update({
        where: { id: reportId },
        data: {
          technicianReportAnalysis: JSON.stringify(analysis),
        },
      });

      return NextResponse.json({
        analysis,
        message: "Technician report analyzed successfully",
      });
    } catch (error: any) {
      console.error("Error analyzing technician report:", error);
      return NextResponse.json(
        {
          error: "Failed to analyze technician report",
          message:
            "An error occurred while analyzing the report. Please try again or contact support if the issue persists.",
        },
        { status: 500 },
      );
    }
  });
}
