import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

interface Section {
  name: string;
  score: number; // 0-100
  status: "complete" | "partial" | "missing";
  issues: string[];
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

  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "reportId is required",
        status: 400,
      });
    }

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: session.user.id },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        inspection: {
          include: {
            // Only `.length` is read for each list relation below; selecting
            // just `id` keeps payload minimal while preserving array length.
            moistureReadings: { select: { id: true } },
            affectedAreas: { select: { id: true } },
            classifications: { select: { id: true } },
            scopeItems: { select: { id: true } },
            costEstimates: { select: { id: true } },
            photos: { select: { id: true } },
            // RA-7003: floor-plan presence (sketches only count when rendered).
            claimSketches: { select: { id: true, renderedPngUrl: true } },
            // RA-7006 Gap 5: contents manifest presence.
            contentsManifestDraft: true,
          },
        },
        // RA-7003: signed client authorisations.
        authorityForms: {
          where: { status: "COMPLETED" },
          select: { id: true },
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

    const sections: Section[] = [];

    // --- Client Information ---
    const clientIssues: string[] = [];
    if (!report.client?.name) clientIssues.push("Client name missing");
    if (!report.client?.email) clientIssues.push("Client email missing");
    if (!report.client?.phone) clientIssues.push("Client phone missing");
    sections.push({
      name: "Client Information",
      score:
        clientIssues.length === 0 ? 100 : clientIssues.length === 1 ? 66 : 33,
      status:
        clientIssues.length === 0
          ? "complete"
          : clientIssues.length <= 1
            ? "partial"
            : "missing",
      issues: clientIssues,
    });

    // --- Inspection Data ---
    const insp = report.inspection;
    const inspIssues: string[] = [];
    if (!insp) {
      inspIssues.push("No inspection linked to this report");
    } else {
      if (!(insp as any).environmentalData)
        inspIssues.push("Environmental data not recorded");
      if (insp.moistureReadings.length === 0)
        inspIssues.push("No moisture readings recorded");
      if (insp.affectedAreas.length === 0)
        inspIssues.push("No affected areas defined");
    }
    sections.push({
      name: "Inspection Data",
      score:
        inspIssues.length === 0
          ? 100
          : Math.max(0, 100 - inspIssues.length * 25),
      status:
        inspIssues.length === 0
          ? "complete"
          : inspIssues.length <= 1
            ? "partial"
            : "missing",
      issues: inspIssues,
    });

    // --- IICRC Classification ---
    const classIssues: string[] = [];
    if (!insp || insp.classifications.length === 0)
      classIssues.push("IICRC classification not run");
    sections.push({
      name: "IICRC Classification",
      score: classIssues.length === 0 ? 100 : 0,
      status: classIssues.length === 0 ? "complete" : "missing",
      issues: classIssues,
    });

    // --- Scope of Works ---
    // RA-7006 Gap 7: the deliverable builds from Report.scopeOfWorksDocument
    // (guided flow) OR Inspection.scopeItems (NIR flow) — accept either, else a
    // guided-flow report with a generated scope shows a false "missing".
    const scopeIssues: string[] = [];
    const hasScope =
      (insp?.scopeItems.length ?? 0) > 0 ||
      Boolean((report as any).scopeOfWorksDocument);
    if (!hasScope) scopeIssues.push("No scope of works generated");
    sections.push({
      name: "Scope of Works",
      score: scopeIssues.length === 0 ? 100 : 0,
      status: scopeIssues.length === 0 ? "complete" : "missing",
      issues: scopeIssues,
    });

    // --- Cost Estimates ---
    const costIssues: string[] = [];
    const hasCost =
      (insp?.costEstimates.length ?? 0) > 0 ||
      Boolean((report as any).costEstimationDocument) ||
      Boolean((report as any).totalCost);
    if (!hasCost) costIssues.push("No cost estimate generated");
    sections.push({
      name: "Cost Estimates",
      score: costIssues.length === 0 ? 100 : 0,
      status: costIssues.length === 0 ? "complete" : "missing",
      issues: costIssues,
    });

    // --- Site Photos ---
    const photoIssues: string[] = [];
    if (!insp || insp.photos.length === 0) {
      photoIssues.push("No site photos uploaded");
    } else if (insp.photos.length < 3) {
      photoIssues.push("Consider adding more photos (minimum 3 recommended)");
    }
    sections.push({
      name: "Site Photos",
      score: photoIssues.length === 0 ? 100 : 50,
      status: photoIssues.length === 0 ? "complete" : "partial",
      issues: photoIssues,
    });

    // --- Floor Plan (RA-7003: previously unchecked) ---
    const floorPlanIssues: string[] = [];
    const renderedSketches = (insp?.claimSketches ?? []).filter(
      (s) => s.renderedPngUrl,
    );
    if (!insp || (renderedSketches.length === 0 && !insp.floorPlanImageUrl)) {
      floorPlanIssues.push(
        "No floor plan on file — add a sketch (render it) or upload a floor plan image",
      );
    }
    sections.push({
      name: "Floor Plan",
      score: floorPlanIssues.length === 0 ? 100 : 0,
      status: floorPlanIssues.length === 0 ? "complete" : "missing",
      issues: floorPlanIssues,
    });

    // --- Signed Authorisations (RA-7003: previously unchecked) ---
    const authorityIssues: string[] = [];
    if ((report.authorityForms ?? []).length === 0) {
      authorityIssues.push(
        "No signed client authority forms — send an authority to proceed for signature",
      );
    }
    sections.push({
      name: "Signed Authorisations",
      score: authorityIssues.length === 0 ? 100 : 0,
      status: authorityIssues.length === 0 ? "complete" : "missing",
      issues: authorityIssues,
    });

    // --- Contents Manifest (RA-7006 Gap 5) ---
    // Soft: not every claim involves contents, so absence is a prompt to
    // capture one, not a hard failure.
    const manifestIssues: string[] = [];
    if (!insp || !(insp as any).contentsManifestDraft) {
      manifestIssues.push(
        "No contents manifest — capture one if the claim involves affected contents",
      );
    }
    sections.push({
      name: "Contents Manifest",
      score: manifestIssues.length === 0 ? 100 : 50,
      status: manifestIssues.length === 0 ? "complete" : "partial",
      issues: manifestIssues,
    });

    // --- Site Power Assessment (RA-7005: mandatory before equipment sizing) ---
    const powerIssues: string[] = [];
    if (!insp || !insp.powerCircuits || !insp.powerCircuitRatingA) {
      powerIssues.push(
        "No site power assessment — record available circuits × rating; equipment sizing assumes 2× 20A until captured (AS/NZS 3000 80% derate)",
      );
    }
    sections.push({
      name: "Site Power Assessment",
      score: powerIssues.length === 0 ? 100 : 0,
      status: powerIssues.length === 0 ? "complete" : "missing",
      issues: powerIssues,
    });

    const overallScore = Math.round(
      sections.reduce((sum, s) => sum + s.score, 0) / sections.length,
    );

    return NextResponse.json({
      reportId,
      reportTitle: report.reportNumber ?? reportId,
      overallScore,
      sections,
    });
  } catch (error) {
    return fromException(request, error, { stage: "completeness-check" });
  }
}
