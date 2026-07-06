import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectStateFromPostcode, getStateInfo } from "@/lib/state-detection";
import { getLatestAIIntegration, callAIProvider } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveReportProvider } from "./provider";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import {
  hasValue,
  extractMaterialsFromReport,
} from "@/lib/reports/extract-report-data";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";
import { expandContext } from "@/lib/knowledge";
import { apiError, fromException } from "@/lib/api-errors";
import {
  guardStandardOutput,
  appendCopyrightGroundingInstruction,
} from "@/lib/standards/copyright-guard";
import { localiseForAUNZ } from "@/lib/anz/localisation";
import type { ChunkResult } from "@/lib/rag/retrieve";

// POST - Generate complete professional inspection report with all 13 sections
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-1329 — tightened from 10/15min (=40/hr) to 5/hour to match
    // sibling /reports/[id]/generate-detailed (tightened under RA-1272
    // for the same reason). Each call is a full 13-section report =
    // multi-thousand Claude tokens ≈ AUD 0.30-1.50. Old limit let a
    // compromised session burn AUD 12-60/hr on a single account.
    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 5,
      prefix: "gen-inspection",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
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
      return apiError(request, {
        code: "VALIDATION",
        message: "Report ID is required",
        status: 400,
      });
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
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
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

    // Resolve AI provider — new ProviderConnection store (BYOK) takes priority
    // over the legacy Integration store, so clients who installed a key via
    // Settings → AI Providers are always routed to the provider they chose.

    // Step 1: check the new BYOK store (ProviderConnection) — same store the
    //         setup gate (byokKeysCheck) validates, so a client who passes the
    //         gate will also pass here.
    let aiIntegration = await resolveReportProvider(user.id);

    // Step 2: fall back to the legacy Integration store (old BYOK path)
    if (!aiIntegration) {
      aiIntegration = await getLatestAIIntegration(user.id);
    }

    // Step 3 (RA-6932 P0): NO platform-key fallback. If neither BYOK store
    //         yields a key, resolve the workspace's own key — which itself
    //         never falls through to the platform ANTHROPIC_API_KEY. A
    //         workspace without a configured key gets a hard 402.
    let anthropicApiKey: string;
    if (!aiIntegration) {
      try {
        anthropicApiKey = (await resolveWorkspaceAiKey(user.id, "ANTHROPIC"))
          .apiKey;
        aiIntegration = {
          id: "workspace-anthropic",
          name: "Anthropic Claude (Workspace Key)",
          apiKey: anthropicApiKey,
          provider: "anthropic" as const,
        };
      } catch (error: unknown) {
        if (error instanceof NoWorkspaceKeyError) {
          return apiError(request, {
            code: "PAYMENT_REQUIRED",
            message: error.message,
            status: 402,
          });
        }
        // RA-786: do not leak error.message to clients
        console.error(
          "Generate-inspection-report: no working AI provider key:",
          error,
        );
        return apiError(request, {
          code: "VALIDATION",
          message:
            "No working AI provider key. Add an Anthropic or OpenAI key in Settings → AI Providers.",
          status: 400,
        });
      }
    } else {
      anthropicApiKey = aiIntegration.apiKey;
    }

    // Use the API key for standards retrieval
    const standardsApiKey = anthropicApiKey;

    // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
    let standardsContext = "";
    // RA-7000: source passages the output-side copyright guard checks the
    // generated report against (Drive-extracted sections + RAG chunk contents).
    const standardsSourceTexts: string[] = [];
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

      // RA-6934: never degrade silently. If standards could not be grounded from
      // the IICRC Standards Drive folder, the report free-generates standards
      // content from general knowledge — surface that loudly for ops instead of
      // proceeding quietly. (The composer also fires its own alert; this records
      // it against this report/route so the ungrounded report is traceable.)
      if (retrievedStandards.degraded) {
        const { reportError } = await import("@/lib/observability");
        reportError(
          new Error(
            `Report generated WITHOUT grounded IICRC standards (${retrievedStandards.degradedReason})`,
          ),
          {
            route: "/api/reports/generate-inspection-report",
            stage: "standards-ungrounded-report",
            reportId: report.id,
            reportType,
            degradedReason: retrievedStandards.degradedReason,
          },
        );
      }

      standardsContext = buildStandardsContextPrompt(retrievedStandards);
      for (const doc of retrievedStandards.documents) {
        if (doc.extractedContent) standardsSourceTexts.push(doc.extractedContent);
        standardsSourceTexts.push(...doc.relevantSections);
      }
    } catch (error: any) {
      // Retrieval threw before returning a degraded context (e.g. dynamic import
      // failure) — still never swallow silently. RA-6934.
      const { reportError } = await import("@/lib/observability");
      reportError(error, {
        route: "/api/reports/generate-inspection-report",
        stage: "standards-retrieval-threw",
        reportId: report.id,
        reportType,
      });
    }

    // STAGE 1b (RA-7000): retrieve citable chunks from the provenance-tagged
    // RAG. retrieveForCitation returns ONLY AUTHORITATIVE_STANDARD chunks — the
    // single tier a report §-citation may ground on. Best-effort: the corpus is
    // empty until the RA-6934 ingest runs, and an unreachable embedder must
    // never block report generation.
    let citationChunks: ChunkResult[] = [];
    try {
      const { retrieveForCitation, formatChunksAsContext } = await import(
        "@/lib/rag/retrieve"
      );
      const citationQuery = [
        `${reportType} damage restoration standards compliance`,
        report.waterCategory ? `Category ${report.waterCategory}` : "",
        report.waterClass ? `Class ${report.waterClass}` : "",
        ...extractMaterialsFromReport(report),
      ]
        .filter(Boolean)
        .join(" ");
      citationChunks = await retrieveForCitation(citationQuery, { k: 6 });
      if (citationChunks.length > 0) {
        standardsContext += [
          "\n\n--- CITABLE STANDARD PASSAGES (authoritative tier — cite as edition + section, e.g. S500:2021 §12.5; paraphrase, never reproduce) ---\n",
          formatChunksAsContext(citationChunks),
        ].join("");
        standardsSourceTexts.push(...citationChunks.map((c) => c.content));
      }
    } catch {
      // Best-effort enrichment on top of the Drive retriever, which already
      // alerts loudly when the report is ungrounded (RA-6934).
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

    const systemPrompt = appendCopyrightGroundingInstruction(`You are RestoreAssist, an expert water damage restoration documentation system built for Australian restoration company administration teams. Generate comprehensive, professional inspection reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference specific standards, codes, and regulations throughout the report.

CRITICAL: Only use the actual data provided in the REPORT DATA section above. Do NOT:
- Use placeholder text like "Not provided", "Not specified", "N/A", "Unknown", or similar
- Make up or invent information that is not in the provided data
- Include sections for which no data was provided
- Use dummy or default values

Only include information that is explicitly provided in the REPORT DATA section. If a field is not provided, do not mention it in the report.

BUSINESS INFORMATION: If business information is provided in the REPORT DATA section (Business Name, Business Address, Business ABN, Business Phone, Business Email), you MUST include this information in the report header/footer and use the business name as the reporting company name throughout the report. The business logo URL can be referenced if needed for document formatting.`);

    // Generate report using the selected AI provider
    let inspectionReport = "";
    try {
      inspectionReport = await callAIProvider(aiIntegration, {
        system: systemPrompt,
        prompt,
        maxTokens: 16000,
      });
    } catch (error: any) {
      // RA-786: do not leak error.message to clients
      return apiError(request, {
        code: "INTERNAL",
        message: "Failed to generate inspection report",
        status: 500,
        err: error,
        stage: "ai-generate",
      });
    }

    if (!inspectionReport || inspectionReport.trim().length === 0) {
      return apiError(request, {
        code: "INTERNAL",
        message: "Failed to generate inspection report: Empty response from AI",
        status: 500,
        stage: "ai-generate",
      });
    }

    // RA-7000: copyright guard runs on the RAW output first — localisation
    // rewrites spelling/terminology and would defeat verbatim matching.
    if (standardsSourceTexts.length > 0) {
      const guard = guardStandardOutput(
        inspectionReport,
        standardsSourceTexts,
        "report",
      );
      if (!guard.ok) {
        const { reportError } = await import("@/lib/observability");
        reportError(
          new Error(
            `Report reproduced standard text verbatim (${guard.violations.length} span(s), longest ${guard.longestRunWords} words) — redacted`,
          ),
          {
            route: "/api/reports/generate-inspection-report",
            stage: "copyright-guard-redacted",
            reportId: report.id,
            reportType,
          },
        );
        inspectionReport = guard.redactedText;
      }
    }

    // RA-7000: AU/NZ localisation — US electrical vocab, regulatory
    // cross-references, product terms, AU English spelling.
    inspectionReport = localiseForAUNZ(inspectionReport).text;

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
    return fromException(request, error, {
      stage: "generate-inspection-report",
    });
  }
}
