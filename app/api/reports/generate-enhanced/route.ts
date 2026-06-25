import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import {
  generateEnhancedReport,
  type GenerateEnhancedInput,
} from "@/lib/services/ai/generate-enhanced-report";
import { apiError, fromException } from "@/lib/api-errors";

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

      // Get API key (required for all users in Integrations; trial has unlimited reports during 15-day period)
      let anthropicApiKey: string;
      try {
        anthropicApiKey = await getAnthropicApiKey(userId);
      } catch (error: any) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Failed to get Anthropic API key",
          status: 400,
        });
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
        savedReport = await prisma.report.update({
          where: { id: reportId },
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
        // Create new report first; deduct credit only after it lands.
        // RA-1298: previously deducted then created, so a post-deduct create
        // failure wasted the user's credit with nothing to show for it.
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

        try {
          const { deductCreditsAndTrackUsage } =
            await import("@/lib/report-limits");
          await deductCreditsAndTrackUsage(userId);
        } catch (creditError) {
          console.error(
            "[generate-enhanced] Credit deduction failed after report create",
            { reportId: savedReport.id, error: creditError },
          );
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
