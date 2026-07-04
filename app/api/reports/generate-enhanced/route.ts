import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import {
  generateEnhancedReport,
  type GenerateEnhancedInput,
} from "@/lib/services/ai/generate-enhanced-report";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// Helper functions for standards retrieval query building
function determineReportType(notes: string): string {
  const lower = notes.toLowerCase();
  if (
    lower.includes("mould") ||
    lower.includes("mold") ||
    lower.includes("remediation")
  )
    return "mould";
  if (lower.includes("fire") || lower.includes("smoke")) return "fire";
  return "water";
}
function extractKeywords(notes: string): string[] {
  return (
    notes
      .toLowerCase()
      .match(/\b\w{5,}\b/g)
      ?.slice(0, 20) ?? []
  );
}
function extractMaterials(notes: string): string[] {
  const materials = [
    "timber",
    "concrete",
    "carpet",
    "plasterboard",
    "drywall",
    "vinyl",
    "tile",
    "insulation",
    "fibrous cement",
  ];
  return materials.filter((m) => notes.toLowerCase().includes(m));
}

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
    prefix: "gen-enhanced",
    key: userId,
    failClosedOnUpstashError: true,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: enhanced AI report generation — credits-deducting and
  // expensive Anthropic call. Retry without idempotency double-bills.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const {
        reportId,
        technicianNotes,
        dateOfAttendance,
        clientContacted,
        clientName,
        propertyAddress,
        clientEmail,
        clientPhone,
        photos,
        conversationHistory,
      } = body;

      if (!technicianNotes || !technicianNotes.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Technician notes are required",
          status: 400,
        });
      }

      // Check credits and get user info (including technician name)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          subscriptionStatus: true,
          creditsRemaining: true,
          totalCreditsUsed: true,
        },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      // Subscription gate — applies unconditionally, even when a reportId is supplied for update.
      // CANCELED/PAST_DUE users must not run AI generation (incurs real API cost).
      const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
      if (
        !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
      ) {
        return NextResponse.json(
          {
            error: "Active subscription required to generate reports",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }

      // RA-1298: pre-check credits BEFORE the Anthropic call so a zero-credit
      // user does not burn tokens we have to eat. Actual atomic deduct happens
      // AFTER prisma.report.create succeeds, so a post-AI DB failure does not
      // waste the user's credit either.
      if (!reportId) {
        const { canCreateReport } = await import("@/lib/report-limits");
        const canCreate = await canCreateReport(userId);
        if (!canCreate.allowed) {
          return NextResponse.json(
            {
              error: canCreate.reason || "No credits remaining",
              upgradeRequired: true,
            },
            { status: 402 },
          );
        }
      }

      // RA-6932 (P0) — resolve the calling workspace's own BYOK Anthropic key.
      // Never falls through to the platform ANTHROPIC_API_KEY — a workspace
      // without a configured key gets a hard 402 PAYMENT_REQUIRED.
      let anthropicApiKey: string;
      try {
        anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC"))
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

      // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
      let standardsContext = "";
      try {
        const { retrieveRelevantStandards, buildStandardsContextPrompt } =
          await import("@/lib/standards-retrieval");

        // Determine report type from technician notes
        const reportType = determineReportType(technicianNotes);

        const retrievalQuery = {
          reportType,
          keywords: extractKeywords(technicianNotes),
          materials: extractMaterials(technicianNotes),
          technicianNotes: technicianNotes.substring(0, 1000),
        };

        // Use the appropriate Anthropic API key to retrieve and analyze standards
        const retrievedStandards = await retrieveRelevantStandards(
          retrievalQuery as any,
          anthropicApiKey,
        );
        standardsContext = buildStandardsContextPrompt(retrievedStandards);
      } catch (error: any) {
        console.error(
          "[Generate Enhanced Report] Error retrieving standards from Google Drive:",
          error.message,
        );
        // Error retrieving standards from Google Drive (continuing without)
      }

      // Get technician name
      const technicianName = user?.name || session.user?.name || "Technician";

      const serviceInput: GenerateEnhancedInput = {
        technicianNotes,
        technicianName,
        dateOfAttendance,
        clientContacted,
        clientName,
        propertyAddress,
        clientEmail,
        clientPhone,
        photos: photos || [],
        conversationHistory: conversationHistory || [],
        standardsContext,
      };

      const result = await generateEnhancedReport({
        apiKey: anthropicApiKey,
        input: serviceInput,
      });

      if (!result.ok) {
        console.error("[generate-enhanced]", {
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
                : "Failed to generate enhanced report",
          },
          { status, headers },
        );
      }

      const enhancedReport = result.data.enhancedReport;

      // Save or update report
      let savedReport;
      if (reportId) {
        // Update existing report - don't deduct credits
        // RA-6961: scope by userId — an unscoped `where: { id: reportId }`
        // let any authenticated caller overwrite another tenant's report.
        // A foreign/missing id now throws P2025, mapped to 404 by the
        // fromException handler below.
        savedReport = await prisma.report.update({
          where: { id: reportId, userId },
          data: {
            detailedReport: enhancedReport,
            ...(clientName && { clientName }),
            ...(propertyAddress && { propertyAddress }),
            equipmentUsed: JSON.stringify({
              technicianNotes,
              dateOfAttendance,
              clientContacted,
              technicianName,
              clientEmail,
              clientPhone,
              photos: photos || [],
            }),
          },
        });
      } else {
        // RA-6982 — charge BEFORE creating the report. The canCreateReport
        // pre-check above is advisory (and avoids burning AI tokens for an
        // at-cap user); the authoritative atomic charge is here. At-cap, or in
        // the race window past that gate, the atomic deduct throws
        // INSUFFICIENT_CREDITS → 402 and NO report row is created — the previous
        // "create then deduct, swallow the throw" gave a free report. A
        // post-charge create failure is compensated with a single refund.
        const { deductCreditsAndTrackUsage, refundCreditsAndTrackUsage } =
          await import("@/lib/report-limits");
        try {
          await deductCreditsAndTrackUsage(userId);
        } catch (creditError) {
          if (
            creditError instanceof Error &&
            creditError.message === "INSUFFICIENT_CREDITS"
          ) {
            return NextResponse.json(
              {
                error: "No credits remaining. Please subscribe to continue.",
                upgradeRequired: true,
              },
              { status: 402 },
            );
          }
          throw creditError;
        }

        try {
          savedReport = await prisma.report.create({
            data: {
              title: `WD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
              clientName: clientName || "To be completed",
              propertyAddress: propertyAddress || "To be completed",
              hazardType: "Water",
              insuranceType: "Building and Contents Insurance",
              status: "DRAFT",
              userId: userId,
              detailedReport: enhancedReport,
              equipmentUsed: JSON.stringify({
                technicianNotes,
                dateOfAttendance,
                clientContacted,
                technicianName,
                clientEmail,
                clientPhone,
                photos: photos || [],
              }),
            },
          });
        } catch (createError) {
          // Charged but the report never persisted — refund the slot
          // (best-effort, never throws) before re-raising.
          await refundCreditsAndTrackUsage(userId);
          throw createError;
        }
      }

      return NextResponse.json({
        success: true,
        reportId: savedReport.id,
        enhancedReport,
        message: "Enhanced professional report generated successfully",
      });
    } catch (error: any) {
      return fromException(request, error, { stage: "generate-enhanced" });
    }
  });
}
