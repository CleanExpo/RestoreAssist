/**
 * API Route: Gap Analysis for Claims
 *
 * Processes PDFs and returns gap analysis results.
 * Supports streaming mode (stream: true) for per-document progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listDriveItems, downloadDriveFile } from "@/lib/google-drive";
import { performGapAnalysis } from "@/lib/gap-analysis";
import { performRevolutionaryGapAnalysis } from "@/lib/revolutionary-gap-analysis";
import {
  retrieveRelevantStandards,
  buildStandardsContextPrompt,
} from "@/lib/standards-retrieval";
import type { GapAnalysisResult } from "@/lib/gap-analysis";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import { verifyAdminFromDb, verifyPlatformSupportOperator } from "@/lib/admin-auth";
import { hasActiveSubscription } from "@/lib/billing/subscription-gate";
import { reportError } from "@/lib/observability";

const ROUTE = "/api/claims/analyze-batch";

/**
 * RA-8043e: every batch this route creates is analysed through the shared
 * platform service account, so it never carries a firm. Only the firm OAuth
 * route (Slice 1c) may set organizationId, and the database CHECK
 * claim_batch_source_org refuses a service-account batch that has one.
 */
const CLAIM_BATCH_SOURCE = "PLATFORM_SERVICE_ACCOUNT" as const;

/** RA-8043e: most documents one batch may analyse. */
const MAX_DOCUMENTS_PER_BATCH = 100;

const SAVE_FAILED_MESSAGE =
  "Saving the analysis results failed. The batch has been marked as failed.";

/**
 * A whole number from 1 to MAX_DOCUMENTS_PER_BATCH, or MAX_DOCUMENTS_PER_BATCH
 * when omitted. Anything else, an explicit null included, is null (the caller
 * returns 400).
 */
function parseDocumentLimit(value: unknown): number | null {
  if (value === undefined) return MAX_DOCUMENTS_PER_BATCH;
  const n =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= 1 && n <= MAX_DOCUMENTS_PER_BATCH ? n : null;
}

/**
 * Error-level log for a failed write, whatever status the client later sees
 * (apiError only reports 5xx, so a P2002 mapped to 409 would otherwise be
 * silent).
 */
function logSaveFailure(
  err: unknown,
  context: { batchId: string | null; userId: string; stage: string },
) {
  reportError(err, { route: ROUTE, source: CLAIM_BATCH_SOURCE, ...context });
}

/** Log a failed save and mark its batch FAILED so it never hangs as PROCESSING. */
async function markBatchFailed(batchId: string, userId: string, err: unknown) {
  logSaveFailure(err, { batchId, userId, stage: "save-results" });
  try {
    await prisma.claimAnalysisBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        errorMessage: SAVE_FAILED_MESSAGE,
        completedAt: new Date(),
      },
    });
  } catch (updateErr) {
    logSaveFailure(updateErr, { batchId, userId, stage: "mark-failed" });
  }
}

const CATEGORY_MAP: Record<
  string,
  | "IICRC_COMPLIANCE"
  | "OH_S_POLICY"
  | "BILLING_ITEM"
  | "DOCUMENTATION"
  | "SCOPE_OF_WORKS"
  | "OTHER"
> = {
  iicrc: "IICRC_COMPLIANCE",
  compliance: "IICRC_COMPLIANCE",
  ohs: "OH_S_POLICY",
  "oh&s": "OH_S_POLICY",
  billing: "BILLING_ITEM",
  documentation: "DOCUMENTATION",
  scope: "SCOPE_OF_WORKS",
  "scope of works": "SCOPE_OF_WORKS",
};
function mapCategory(
  category: string,
):
  | "IICRC_COMPLIANCE"
  | "OH_S_POLICY"
  | "BILLING_ITEM"
  | "DOCUMENTATION"
  | "SCOPE_OF_WORKS"
  | "OTHER" {
  const key = (category || "").toLowerCase().trim();
  return (CATEGORY_MAP[key] ?? "OTHER") as any;
}
function mapSeverity(severity: string): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const s = (severity || "MEDIUM").toUpperCase();
  return (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(s) ? s : "MEDIUM") as
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "LOW";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-8043d: one Drive service account is shared by every firm, so any
    // folder a firm shares with it is visible to whoever can browse it. Every
    // self-signup is ADMIN, so browsing that Drive is platform staff work.
    const operator = verifyPlatformSupportOperator(
      await verifyAdminFromDb(session),
    );
    if (operator.response) return operator.response;

    // RA-8043e: staff switch for maintenance windows (Slice 1a-ii). Only the
    // exact value "1" pauses; checked before any batch, Drive or model work.
    if (process.env.CLAIMS_ANALYSIS_PAUSED === "1") {
      return apiError(request, {
        code: "CLAIMS_ANALYSIS_PAUSED",
        message:
          "Claims analysis is paused for maintenance. Please try again later.",
        status: 503,
      });
    }

    // Rate limit: 5 batch analyses per 15 minutes per user (heavy operation)
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      prefix: "analyze-batch",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    // Rule 5 — subscription gate before any AI call. Both the standards
    // retrieval (retrieveRelevantStandards) and the per-file Anthropic calls
    // below incur real API cost; CANCELED/PAST_DUE users must not reach them.
    // Allowlist mirrors the generate-enhanced report route. RA-7893: an
    // invited technician uses the business owner's plan.
    if (!(await hasActiveSubscription(session.user.id))) {
      return NextResponse.json(
        {
          error: "Active subscription required to analyze claims",
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }

    const body = await request.json();
    const { folderId, maxDocuments, stream } = body;

    if (!folderId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "folderId is required",
        status: 400,
      });
    }

    // RA-8043e: cap the batch before any Drive listing or model call.
    const documentLimit = parseDocumentLimit(maxDocuments);
    if (documentLimit === null) {
      return apiError(request, {
        code: "VALIDATION",
        message: `maxDocuments must be a whole number from 1 to ${MAX_DOCUMENTS_PER_BATCH}`,
        status: 400,
      });
    }

    const userId = session.user.id;

    // Get integrations
    const { getIntegrationsForUser } = await import("@/lib/ai-provider");
    const integrations = await getIntegrationsForUser(userId, {
      status: "CONNECTED",
      nameContains: ["Anthropic", "OpenAI", "Gemini", "Claude", "GPT"],
    });
    const integration = integrations[0];

    if (!integration || !integration.apiKey) {
      return NextResponse.json(
        {
          error: "No connected API integration found",
          details:
            "Please connect an Anthropic, OpenAI, or other AI API integration in the Integrations page during onboarding.",
        },
        { status: 400 },
      );
    }

    const anthropicApiKey = integration.apiKey;

    // Retrieve IICRC standards from Google Drive
    let standardsContext = "";
    try {
      const retrievalQuery = {
        reportType: "water" as const,
        keywords: [
          "S500",
          "S520",
          "S540",
          "IICRC",
          "ANSI/IICRC",
          "AS/NZS 3000",
          "AS/NZS 3500",
          "AS 1668",
          "AS/NZS 3666",
          "NCC",
          "QDC",
          "WHS",
          "OH&S",
          "Work Health and Safety",
          "Insurance",
          "ICA",
          "APRA",
          "compliance",
          "standards",
          "billing",
          "scope of works",
          "equipment",
          "monitoring",
          "psychrometric",
          "drying",
          "restoration",
          "remediation",
        ],
        technicianNotes:
          "Comprehensive revolutionary gap analysis of completed claim reports against all Australian and IICRC standards",
      };

      const retrievedStandards = await retrieveRelevantStandards(
        retrievalQuery,
        anthropicApiKey,
      );
      standardsContext = buildStandardsContextPrompt(retrievedStandards);
    } catch (error: any) {
      console.error(
        "[Gap Analysis] Error retrieving standards:",
        error.message,
      );
    }

    // List PDF files
    const items = await listDriveItems(folderId);
    let pdfFiles = items.files.filter(
      (file) =>
        file.mimeType === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );

    pdfFiles = pdfFiles.slice(0, documentLimit);

    if (pdfFiles.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No PDF files found in the folder",
        status: 400,
      });
    }

    // --- Streaming mode: process one-by-one with progress events ---
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          };

          let batch: { id: string };
          try {
            batch = await prisma.claimAnalysisBatch.create({
              data: {
                userId,
                source: CLAIM_BATCH_SOURCE,
                folderId,
                folderName: null,
                status: "PROCESSING",
                totalFiles: pdfFiles.length,
                processedFiles: 0,
                failedFiles: 0,
              },
              select: { id: true },
            });
          } catch (err) {
            logSaveFailure(err, { batchId: null, userId, stage: "batch-create" });
            sendEvent({
              type: "error",
              error: "The analysis batch could not be created.",
            });
            controller.close();
            return;
          }

          sendEvent({
            type: "start",
            total: pdfFiles.length,
            batchId: batch.id,
          });

          const analysisResults: GapAnalysisResult[] = [];

          for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i];
            sendEvent({
              type: "progress",
              file: file.name,
              index: i,
              status: "processing",
            });

            try {
              const { buffer } = await downloadDriveFile(file.id);
              const revResult = await performRevolutionaryGapAnalysis(
                { id: file.id, name: file.name, buffer },
                anthropicApiKey,
                standardsContext,
              );

              // Convert revolutionary format to standard
              const result: GapAnalysisResult = {
                fileName: revResult.fileName,
                fileId: revResult.fileId,
                issues: revResult.issues.map((issue: any) => ({
                  category: issue.category,
                  elementName: issue.elementName,
                  description: issue.description,
                  severity: issue.severity,
                  standardReference: issue.standardReference,
                  isBillable: issue.isBillable,
                  estimatedCost: issue.estimatedCost,
                  estimatedHours: issue.estimatedHours,
                  suggestedLineItem: issue.suggestedLineItem,
                })),
                missingElements: revResult.missingElements,
                scores: {
                  completeness: revResult.scores.completeness,
                  compliance: revResult.scores.compliance,
                  standardization: revResult.scores.standardization,
                  scopeAccuracy: revResult.scores.scopeAccuracy,
                  billingAccuracy: revResult.scores.billingAccuracy,
                },
                estimatedMissingRevenue: revResult.estimatedMissingRevenue,
                standardsReferenced: revResult.standardsReferenced,
                complianceGaps: revResult.complianceGaps,
                reportStructure: revResult.reportStructure,
                technicianPattern: revResult.technicianPattern,
              };

              analysisResults.push(result);
              sendEvent({
                type: "progress",
                file: file.name,
                index: i,
                status: "done",
              });
            } catch (error: any) {
              console.error(
                `[Gap Analysis] Failed to analyze ${file.name}:`,
                error.message,
              );
              analysisResults.push({
                fileName: file.name,
                fileId: file.id,
                issues: [],
                missingElements: {
                  iicrc: 0,
                  australianStandards: 0,
                  ohs: 0,
                  whs: 0,
                  scopeOfWorks: 0,
                  billing: 0,
                  documentation: 0,
                  equipment: 0,
                  monitoring: 0,
                },
                scores: {
                  completeness: 0,
                  compliance: 0,
                  standardization: 0,
                  scopeAccuracy: 0,
                  billingAccuracy: 0,
                },
                estimatedMissingRevenue: 0,
              });
              sendEvent({
                type: "progress",
                file: file.name,
                index: i,
                status: "failed",
                error: "Analysis failed",
              });
            }
          }

          // Calculate summary and persist to DB
          const summary = buildSummary(analysisResults);
          const completed = analysisResults.filter(
            (r) => (r.scores?.completeness ?? 0) > 0 || r.issues?.length > 0,
          ).length;
          const failed = pdfFiles.length - completed;

          try {
            await prisma.$transaction(async (tx) => {
              for (const r of analysisResults) {
                const analysisData = {
                  batchId: batch.id,
                  fileName: r.fileName,
                  completenessScore: Math.round(r.scores?.completeness ?? 0),
                  complianceScore: Math.round(r.scores?.compliance ?? 0),
                  standardizationScore: Math.round(
                    r.scores?.standardization ?? 0,
                  ),
                  billingAccuracyScore: Math.round(
                    r.scores?.billingAccuracy ?? 0,
                  ),
                  missingIICRCElements: r.missingElements?.iicrc ?? 0,
                  missingOHSElements: r.missingElements?.ohs ?? 0,
                  missingBillingItems: r.missingElements?.billing ?? 0,
                  missingDocumentation: r.missingElements?.documentation ?? 0,
                  estimatedMissingRevenue: r.estimatedMissingRevenue ?? null,
                  fullAnalysisData: JSON.stringify({
                    issues: r.issues,
                    reportStructure: r.reportStructure,
                    technicianPattern: r.technicianPattern,
                  }),
                  status:
                    (r.issues?.length ?? 0) === 0 &&
                    (r.scores?.completeness ?? 0) === 0
                      ? ("FAILED" as const)
                      : ("COMPLETED" as const),
                  processedAt: new Date(),
                };
                const analysis = await tx.claimAnalysis.upsert({
                  where: { googleDriveFileId: r.fileId },
                  create: { googleDriveFileId: r.fileId, ...analysisData },
                  update: analysisData,
                });
                await tx.missingElement.deleteMany({
                  where: { analysisId: analysis.id },
                });
                const issues = r.issues ?? [];
                if (issues.length > 0) {
                  await tx.missingElement.createMany({
                    data: issues.map((issue) => ({
                      analysisId: analysis.id,
                      category: mapCategory(issue.category),
                      elementType: issue.category || "Other",
                      elementName: issue.elementName || "Unknown",
                      description: issue.description ?? null,
                      severity: mapSeverity(issue.severity),
                      standardReference: issue.standardReference ?? null,
                      isBillable: !!issue.isBillable,
                      estimatedCost: issue.estimatedCost ?? null,
                      estimatedHours: issue.estimatedHours ?? null,
                      suggestedLineItem: issue.suggestedLineItem ?? null,
                    })),
                  });
                }
              }
              await tx.claimAnalysisBatch.update({
                where: { id: batch.id },
                data: {
                  status:
                    failed > 0 && completed > 0
                      ? "PARTIAL"
                      : failed === pdfFiles.length
                        ? "FAILED"
                        : "COMPLETED",
                  processedFiles: completed,
                  failedFiles: failed,
                  completedAt: new Date(),
                  averageCompletenessScore: summary.averageScores.completeness,
                  averageComplianceScore: summary.averageScores.compliance,
                  totalMissingElements:
                    summary.totalMissingElements.iicrc +
                    summary.totalMissingElements.ohs +
                    summary.totalMissingElements.billing +
                    summary.totalMissingElements.documentation,
                  estimatedRevenueRecovery: summary.totalEstimatedMissingRevenue,
                },
              });
            },
            // Batches can carry many files × issues; give the interactive tx
            // headroom beyond the 5s default so a large batch can't roll back.
            { timeout: 20_000, maxWait: 10_000 });
          } catch (err) {
            // RA-8043e: a failed save must not leave the batch PROCESSING.
            await markBatchFailed(batch.id, userId, err);
            sendEvent({
              type: "error",
              batchId: batch.id,
              error: SAVE_FAILED_MESSAGE,
            });
            controller.close();
            return;
          }

          sendEvent({
            type: "complete",
            results: analysisResults,
            summary,
            batchId: batch.id,
          });
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // --- Non-streaming mode (backward compat) ---
    // RA-1318 — Promise.all over all PDFs downloads every file in parallel.
    // At 50+ PDFs (typical claim folder) × 2-5 MB each × no Drive-side
    // rate limit = OOM + HTTP 429 from Google. Cap at 4 concurrent.
    const DOWNLOAD_CONCURRENCY = 4;
    const pdfData: Array<{ id: string; name: string; buffer: Buffer }> = [];
    for (let i = 0; i < pdfFiles.length; i += DOWNLOAD_CONCURRENCY) {
      const slice = pdfFiles.slice(i, i + DOWNLOAD_CONCURRENCY);
      const batch = await Promise.all(
        slice.map(async (file) => {
          const { buffer } = await downloadDriveFile(file.id);
          return { id: file.id, name: file.name, buffer };
        }),
      );
      pdfData.push(...batch);
    }

    const analysisResults = await performGapAnalysis(
      pdfData,
      anthropicApiKey,
      standardsContext,
    );
    const summary = buildSummary(analysisResults);

    const completed = analysisResults.filter(
      (r) => (r.scores?.completeness ?? 0) > 0 || (r.issues?.length ?? 0) > 0,
    ).length;
    const failed = pdfFiles.length - completed;

    // RA-8043e: the batch starts PROCESSING; its final status is written in
    // the same transaction as its rows, so a failed save can never leave a
    // COMPLETED or PARTIAL batch with no rows (even if markBatchFailed fails).
    const batch = await prisma.claimAnalysisBatch.create({
      data: {
        userId,
        source: CLAIM_BATCH_SOURCE,
        folderId,
        folderName: null,
        status: "PROCESSING",
        totalFiles: pdfFiles.length,
        processedFiles: 0,
        failedFiles: 0,
      },
    });

    try {
      await prisma.$transaction(async (tx) => {
        for (const r of analysisResults) {
          const analysisData = {
            batchId: batch.id,
            fileName: r.fileName,
            completenessScore: Math.round(r.scores?.completeness ?? 0),
            complianceScore: Math.round(r.scores?.compliance ?? 0),
            standardizationScore: Math.round(r.scores?.standardization ?? 0),
            billingAccuracyScore: Math.round(r.scores?.billingAccuracy ?? 0),
            missingIICRCElements: r.missingElements?.iicrc ?? 0,
            missingOHSElements: r.missingElements?.ohs ?? 0,
            missingBillingItems: r.missingElements?.billing ?? 0,
            missingDocumentation: r.missingElements?.documentation ?? 0,
            estimatedMissingRevenue: r.estimatedMissingRevenue ?? null,
            fullAnalysisData: JSON.stringify({
              issues: r.issues,
              reportStructure: r.reportStructure,
              technicianPattern: r.technicianPattern,
            }),
            status:
              (r.issues?.length ?? 0) === 0 && (r.scores?.completeness ?? 0) === 0
                ? ("FAILED" as const)
                : ("COMPLETED" as const),
            processedAt: new Date(),
          };
          const analysis = await tx.claimAnalysis.upsert({
            where: { googleDriveFileId: r.fileId },
            create: { googleDriveFileId: r.fileId, ...analysisData },
            update: analysisData,
          });
          await tx.missingElement.deleteMany({
            where: { analysisId: analysis.id },
          });
          const issues = r.issues ?? [];
          if (issues.length > 0) {
            await tx.missingElement.createMany({
              data: issues.map((issue) => ({
                analysisId: analysis.id,
                category: mapCategory(issue.category),
                elementType: issue.category || "Other",
                elementName: issue.elementName || "Unknown",
                description: issue.description ?? null,
                severity: mapSeverity(issue.severity),
                standardReference: issue.standardReference ?? null,
                isBillable: !!issue.isBillable,
                estimatedCost: issue.estimatedCost ?? null,
                estimatedHours: issue.estimatedHours ?? null,
                suggestedLineItem: issue.suggestedLineItem ?? null,
              })),
            });
          }
        }
        await tx.claimAnalysisBatch.update({
          where: { id: batch.id },
          data: {
            status:
              failed > 0 && completed > 0
                ? "PARTIAL"
                : failed === pdfFiles.length
                  ? "FAILED"
                  : "COMPLETED",
            processedFiles: completed,
            failedFiles: failed,
            completedAt: new Date(),
            averageCompletenessScore: summary.averageScores.completeness,
            averageComplianceScore: summary.averageScores.compliance,
            totalMissingElements:
              summary.totalMissingElements.iicrc +
              summary.totalMissingElements.ohs +
              summary.totalMissingElements.billing +
              summary.totalMissingElements.documentation,
            estimatedRevenueRecovery: summary.totalEstimatedMissingRevenue,
          },
        });
      },
      // Headroom beyond the 5s default for large batches (files × issues).
      { timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      // RA-8043e: a failed save must not leave the batch PROCESSING.
      await markBatchFailed(batch.id, userId, err);
      return apiError(request, {
        code: "INTERNAL",
        message: SAVE_FAILED_MESSAGE,
        status: 500,
        stage: "save-results",
        context: { batchId: batch.id },
      });
    }

    return NextResponse.json({
      success: true,
      results: analysisResults,
      summary,
      batchId: batch.id,
    });
  } catch (err) {
    return fromException(request, err, { stage: "analyze-batch" });
  }
}

function buildSummary(analysisResults: GapAnalysisResult[]) {
  return {
    totalFiles: analysisResults.length,
    totalIssues: analysisResults.reduce((sum, r) => sum + r.issues.length, 0),
    totalMissingElements: {
      iicrc: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.iicrc || 0),
        0,
      ),
      australianStandards: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.australianStandards || 0),
        0,
      ),
      ohs: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.ohs || 0),
        0,
      ),
      whs: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.whs || 0),
        0,
      ),
      scopeOfWorks: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.scopeOfWorks || 0),
        0,
      ),
      billing: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.billing || 0),
        0,
      ),
      documentation: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.documentation || 0),
        0,
      ),
      equipment: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.equipment || 0),
        0,
      ),
      monitoring: analysisResults.reduce(
        (sum, r) => sum + (r.missingElements?.monitoring || 0),
        0,
      ),
    },
    averageScores: {
      completeness:
        analysisResults.length > 0
          ? analysisResults.reduce(
              (sum, r) => sum + (r.scores?.completeness || 0),
              0,
            ) / analysisResults.length
          : 0,
      compliance:
        analysisResults.length > 0
          ? analysisResults.reduce(
              (sum, r) => sum + (r.scores?.compliance || 0),
              0,
            ) / analysisResults.length
          : 0,
      standardization:
        analysisResults.length > 0
          ? analysisResults.reduce(
              (sum, r) => sum + (r.scores?.standardization || 0),
              0,
            ) / analysisResults.length
          : 0,
      scopeAccuracy:
        analysisResults.length > 0
          ? analysisResults.reduce(
              (sum, r) => sum + (r.scores?.scopeAccuracy || 0),
              0,
            ) / analysisResults.length
          : 0,
      billingAccuracy:
        analysisResults.length > 0
          ? analysisResults.reduce(
              (sum, r) => sum + (r.scores?.billingAccuracy || 0),
              0,
            ) / analysisResults.length
          : 0,
    },
    totalEstimatedMissingRevenue: analysisResults.reduce(
      (sum, r) => sum + (r.estimatedMissingRevenue || 0),
      0,
    ),
    topIssues: analysisResults
      .flatMap((r) => r.issues)
      .reduce((acc: any[], issue) => {
        const existing = acc.find((i) => i.elementName === issue.elementName);
        if (existing) {
          existing.count++;
          existing.totalCost += issue.estimatedCost || 0;
        } else {
          acc.push({ ...issue, count: 1, totalCost: issue.estimatedCost || 0 });
        }
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };
}
