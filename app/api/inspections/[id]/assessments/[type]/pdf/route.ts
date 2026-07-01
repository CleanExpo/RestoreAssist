/**
 * GET /api/inspections/[id]/assessments/[type]/pdf — RA-1717 follow-up.
 *
 * Streams the most recent persisted AssessmentGeneration row as an
 * A4-portrait PDF. No regeneration here — just a render of what's
 * already stored. If the caller wants a fresh artefact, they POST to
 * /generate first.
 *
 * Tenancy: assertInspectionTenancy (owner / workspace member / admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { isRegisteredDomain } from "@/lib/assessments/registry";
import { generateAssessmentPdf } from "@/lib/assessments/generate-assessment-pdf";
import type {
  AssessmentReport,
  EstimateLine,
  EstimateTotals,
  ScopeItem,
  StandardCitation,
} from "@/lib/assessments/types";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(_request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const { id: inspectionId, type } = await params;
    if (!isRegisteredDomain(type)) {
      return apiError(_request, {
        code: "VALIDATION",
        message: `Unknown assessment domain "${type}"`,
        status: 400,
      });
    }

    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const [latest, inspection] = await Promise.all([
      prisma.assessmentGeneration.findFirst({
        where: { inspectionId, assessmentType: type },
        orderBy: { generatedAt: "desc" },
      }),
      prisma.inspection.findUnique({
        where: { id: inspectionId },
        select: { inspectionNumber: true, propertyAddress: true },
      }),
    ]);

    if (!latest) {
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "No generation persisted yet for this assessment",
        status: 404,
      });
    }

    // Persisted JSON shape comes back as `unknown` to TS. The generators
    // wrote in the canonical shape — assert through.
    const reportSections =
      (
        latest.reportSections as { sections?: unknown } as {
          sections?: unknown;
        }
      ).sections ?? (latest.reportSections as unknown);

    const report: AssessmentReport = Array.isArray(reportSections)
      ? { sections: reportSections as AssessmentReport["sections"] }
      : (latest.reportSections as unknown as AssessmentReport);

    const scopeItems = latest.scopeItems as unknown as ScopeItem[];
    const estimateLinesRaw = latest.estimateLines as unknown as
      | EstimateLine[]
      | { lines: EstimateLine[]; totals?: EstimateTotals };
    const lines = Array.isArray(estimateLinesRaw)
      ? estimateLinesRaw
      : estimateLinesRaw.lines;
    // Recompute totals from the stored lines for safety.
    const subtotalExGst = lines.reduce(
      (sum, l) => sum + (l.lineTotalExGst ?? 0),
      0,
    );
    const gstTotal = lines.reduce(
      (sum, l) => sum + ((l.lineTotalIncGst ?? 0) - (l.lineTotalExGst ?? 0)),
      0,
    );
    const totals: EstimateTotals = {
      subtotalExGst,
      gstTotal,
      totalIncGst: subtotalExGst + gstTotal,
      gstRate: 0.1,
      currency: "AUD",
    };

    const citations = latest.citations as unknown as StandardCitation[];

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateAssessmentPdf({
        domain: type,
        report,
        scope: { items: scopeItems },
        estimate: { lines, totals },
        citations,
        meta: {
          assessmentGenerationId: latest.id,
          generatedAt: latest.generatedAt,
          modelUsed: latest.modelUsed,
          latencyMs: latest.latencyMs,
          propertyAddress: inspection?.propertyAddress ?? null,
          inspectionNumber: inspection?.inspectionNumber ?? null,
        },
      });
    } catch (err) {
      return fromException(_request, err, { stage: "assessments:pdf:render" });
    }

    const filename = `${type}-${latest.id}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return fromException(_request, err, { stage: "assessments:pdf" });
  }
}
