import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectStateFromPostcode, getStateInfo } from "@/lib/state-detection";
import { getLatestAIIntegration, callAIProvider } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  hasValue,
  extractMaterialsFromReport,
} from "@/lib/reports/extract-report-data";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";
import { expandContext } from "@/lib/knowledge";

// POST - Generate complete professional inspection report with all 13 sections
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 inspection report generations per 15 minutes per user
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "gen-inspection",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        subscriptionStatus: true,
        pricingConfig: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Subscription gate — CANCELED/PAST_DUE users must not run AI generation
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

    const { reportId, reportType = "enhanced" } = await request.json();

    if (!reportId) {
      return NextResponse.json(
        { error: "Report ID is required" },
        { status: 400 },
      );
    }

    // Get the complete report with all data, including client information
    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id },
      include: {
        client: {
          select: {
            company: true,
            name: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Parse all stored data
    const analysis = report.technicianReportAnalysis
      ? JSON.parse(report.technicianReportAnalysis)
      : null;
    const tier1 = report.tier1Responses
      ? JSON.parse(report.tier1Responses)
      : null;
    const tier2 = report.tier2Responses
      ? JSON.parse(report.tier2Responses)
      : null;
    const tier3 = report.tier3Responses
      ? JSON.parse(report.tier3Responses)
      : null;
    const psychrometricAssessment = report.psychrometricAssessment
      ? JSON.parse(report.psychrometricAssessment)
      : null;
    const scopeAreas = report.scopeAreas ? JSON.parse(report.scopeAreas) : null;
    const equipmentSelection = report.equipmentSelection
      ? JSON.parse(report.equipmentSelection)
      : null;

    // Detect state from postcode
    const stateCode = detectStateFromPostcode(report.propertyPostcode || "");
    const stateInfo = getStateInfo(stateCode);

    // Get appropriate API key based on subscription status
    // Free users: uses ANTHROPIC_API_KEY from .env
    // Upgraded users: uses API key from integrations
    const { getAnthropicApiKey, getLatestAIIntegration } =
      await import("@/lib/ai-provider");

    // Try to get integration first (for upgraded users)
    let aiIntegration = await getLatestAIIntegration(user.id);
    let anthropicApiKey: string;

    if (!aiIntegration) {
      // For free users, get API key from .env
      try {
        anthropicApiKey = await getAnthropicApiKey(user.id);
        // Create a synthetic integration object for callAIProvider
        aiIntegration = {
          id: "env-anthropic",
          name: "Anthropic Claude (Free Tier)",
          apiKey: anthropicApiKey,
          provider: "anthropic" as const,
        };
      } catch (error: any) {
        return NextResponse.json(
          {
            error:
              error.message ||
              "Failed to get Anthropic API key. Please ensure ANTHROPIC_API_KEY is configured in environment variables.",
          },
          { status: 400 },
        );
      }
    } else {
      // For upgraded users, use the integration's API key
      anthropicApiKey = aiIntegration.apiKey;
    }

    // Use the API key for standards retrieval
    const standardsApiKey = anthropicApiKey;

    // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
    let standardsContext = "";
    try {
      const { retrieveRelevantStandards, buildStandardsContextPrompt } =
        await import("@/lib/standards-retrieval");

      // Determine report type
      const retrievalReportType:
        | "mould"
        | "fire"
        | "commercial"
        | "water"
        | "general" =
        reportType === "mould"
          ? "mould"
          : reportType === "fire"
            ? "fire"
            : reportType === "commercial"
              ? "commercial"
              : "water";

      const retrievalQuery = {
        reportType: retrievalReportType,
        waterCategory: report.waterCategory as "1" | "2" | "3" | undefined,
        keywords: [
          report.waterCategory ? `Category ${report.waterCategory}` : "",
          report.waterClass ? `Class ${report.waterClass}` : "",
        ].filter(Boolean),
        materials: extractMaterialsFromReport(report),
        technicianNotes: report.technicianFieldReport?.substring(0, 1000) || "",
      };

      const retrievedStandards = await retrieveRelevantStandards(
        retrievalQuery,
        standardsApiKey,
      );

      standardsContext = buildStandardsContextPrompt(retrievedStandards);

      if (standardsContext.length > 0) {
      } else {
      }
    } catch (error: any) {
      // Continue without standards - report will use general knowledge
    }

    // Get NIR data from Report model (stored in moistureReadings field as JSON)
    let inspectionData = null;
    try {
      // Parse NIR data from Report.moistureReadings JSON field
      if (report.moistureReadings) {
        const nirData = JSON.parse(report.moistureReadings);

        inspectionData = {
          moistureReadings: nirData.moistureReadings || [],
          affectedAreas: nirData.affectedAreas || [],
          scopeItems: nirData.scopeItems || [],
          photos: nirData.photos || [],
          environmentalData: null, // Not stored in NIR data, will use psychrometric fallback
          classifications: [],
          costEstimates: [],
        };
      }
    } catch (error) {
      // Continue without NIR data - report generation will use other Report model data
      inspectionData = null;
    }

    // For basic and enhanced reports, use structured data directly from Report model (no AI - ensures 100% accurate data)
    if (reportType === "basic" || reportType === "enhanced") {
      // Build structured data directly from actual Report model data - NO AI, ensures all real data is used
      const structuredReportData = buildStructuredBasicReport({
        report,
        analysis,
        stateInfo,
        psychrometricAssessment,
        scopeAreas,
        equipmentSelection,
        inspectionData,
        tier1,
        tier2,
        tier3,
        businessInfo: {
          businessName: user.businessName,
          businessAddress: user.businessAddress,
          businessLogo: user.businessLogo,
          businessABN: user.businessABN,
          businessPhone: user.businessPhone,
          businessEmail: user.businessEmail,
        },
      });

      // Save the structured report as JSON
      await prisma.report.update({
        where: { id: reportId },
        data: {
          detailedReport: JSON.stringify(structuredReportData),
          reportDepthLevel: reportType === "basic" ? "Basic" : "Enhanced",
          status: "PENDING",
        },
      });

      return NextResponse.json({
        report: {
          id: reportId,
          structuredData: structuredReportData,
        },
        message: `${reportType === "basic" ? "Basic" : "Enhanced"} inspection report generated successfully`,
      });
    }

    // For optimised reports, use AI generation
    // Expand knowledge-graph context from linked Inspection (RA-624)
    let knowledgeContext = "";
    try {
      const linkedInspection = await prisma.inspection.findUnique({
        where: { reportId },
        select: { id: true },
      });
      if (linkedInspection) {
        const kgContext = await expandContext({
          inspectionId: linkedInspection.id,
          k: 3,
          includeInactive: false,
        });
        const evidenceCount = kgContext.nodes.filter(
          (n) => n.type === "EvidenceItem",
        ).length;
        const iicrcChunks = kgContext.nodes.filter(
          (n) => n.type === "IicrcChunk",
        );
        if (evidenceCount > 0 || iicrcChunks.length > 0) {
          const byClass = Object.entries(kgContext.summary.evidenceByClass)
            .map(([cls, count]) => `${cls}(${count})`)
            .join(", ");
          knowledgeContext = [
            `\n\n--- KNOWLEDGE GRAPH CONTEXT (${evidenceCount} evidence items, ${kgContext.edges.length} relationships) ---`,
            byClass ? `Evidence classes: ${byClass}` : "",
            kgContext.summary.workflowStepCount > 0
              ? `Workflow: ${kgContext.summary.workflowStepCount} steps (submission score: ${kgContext.summary.workflowSubmissionScore ?? "n/a"}%)`
              : "",
            iicrcChunks.length > 0
              ? `Relevant IICRC sections: ${iicrcChunks.map((n) => n.label).join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
        }
      }
    } catch {
      // Knowledge graph enrichment is best-effort; never block report generation
    }

    const prompt =
      buildInspectionReportPrompt({
        report,
        analysis,
        tier1,
        tier2,
        tier3,
        stateInfo,
        reportType,
        standardsContext,
        psychrometricAssessment,
        scopeAreas,
        equipmentSelection,
        businessInfo: {
          businessName: user.businessName,
          businessAddress: user.businessAddress,
          businessLogo: user.businessLogo,
          businessABN: user.businessABN,
          businessPhone: user.businessPhone,
          businessEmail: user.businessEmail,
        },
      }) + knowledgeContext;

    const systemPrompt = `You are RestoreAssist, an expert water damage restoration documentation system built for Australian restoration company administration teams. Generate comprehensive, professional inspection reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference specific standards, codes, and regulations throughout the report.

CRITICAL: Only use the actual data provided in the REPORT DATA section above. Do NOT:
- Use placeholder text like "Not provided", "Not specified", "N/A", "Unknown", or similar
- Make up or invent information that is not in the provided data
- Include sections for which no data was provided
- Use dummy or default values

Only include information that is explicitly provided in the REPORT DATA section. If a field is not provided, do not mention it in the report.

BUSINESS INFORMATION: If business information is provided in the REPORT DATA section (Business Name, Business Address, Business ABN, Business Phone, Business Email), you MUST include this information in the report header/footer and use the business name as the reporting company name throughout the report. The business logo URL can be referenced if needed for document formatting.`;

    // Generate report using the selected AI provider
    let inspectionReport = "";
    try {
      inspectionReport = await callAIProvider(aiIntegration, {
        system: systemPrompt,
        prompt,
        maxTokens: 16000,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Failed to generate inspection report",
          details: error.message || "Unknown error occurred",
        },
        { status: 500 },
      );
    }

    if (!inspectionReport || inspectionReport.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Failed to generate inspection report: Empty response from AI",
        },
        { status: 500 },
      );
    }

    // Save the generated report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        detailedReport: inspectionReport,
        reportDepthLevel: report.reportDepthLevel || "Enhanced",
        status: "PENDING",
      },
    });

    return NextResponse.json({
      report: {
        id: reportId,
        detailedReport: inspectionReport,
      },
      message: "Inspection report generated successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate inspection report" },
      { status: 500 },
    );
  }
}
