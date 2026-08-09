import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientAuth } from "@/lib/portal/require-client-auth";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import { isAiDraftPending } from "@/lib/reports/ai-ownership";
import { resolveOrgBrandTheme } from "@/lib/clients/brand";
import {
  claimSketchesToFloorPlanOutput,
  uploadedFloorPlanToOutput,
} from "@/lib/reports/claim-sketch-floors";
import { appendFloorPlanPagesWithDisclosure } from "@/lib/reports/append-sketch-pages";
import { inspectionPhotosToImages } from "@/lib/reports/inspection-photos-to-images";
import { appendPhotoPages } from "@/lib/reports/append-photo-pages";
import { apiError, fromException } from "@/lib/api-errors";
import { isPortalReportPublished } from "@/lib/portal/report-publication";

// GET /api/portal/reports/[id]/download - Download PDF for client portal users.
//
// RA-7006 Gap 2: previously fed report.detailedReport into
// generateEnhancedReportPDF, which (a) embedded none of the captured artifacts
// (floor plans, photos, waivers) and (b) had no raw-JSON guard, so a structured
// Basic/Enhanced report (detailedReport = JSON) rendered as a PDF of raw JSON
// for the client. This now mirrors the dashboard /api/reports/[id]/pdf pipeline:
// the artifact-aware IICRC generator + sketch + photo appenders, with the same
// JSON guard — so the client gets the exact same complete document.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;

    const { id: reportId } = await params;

    // Fetch report — verify it belongs to this client — with the same artifact
    // relations the dashboard PDF pipeline reads.
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
        status: "COMPLETED",
        OR: [
          { inspectionPdfUrl: { not: null } },
          { detailedReport: { not: null } },
          { scopeOfWorksDocument: { not: null } },
          { costEstimationDocument: { not: null } },
        ],
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
            businessAddress: true,
            businessABN: true,
            organization: {
              select: { logoUrl: true, primaryColor: true },
            },
          },
        },
        client: {
          select: { name: true, email: true, phone: true, company: true },
        },
        inspection: {
          select: {
            floorPlanImageUrl: true,
            claimSketches: {
              select: {
                floorNumber: true,
                floorLabel: true,
                renderedPngUrl: true,
                sketchData: true,
                moisturePoints: true,
              },
            },
            photos: {
              select: {
                url: true,
                thumbnailUrl: true,
                description: true,
                location: true,
                roomType: true,
                mimeType: true,
              },
              orderBy: { timestamp: "asc" },
            },
          },
        },
      },
    });

    if (!report || !isPortalReportPublished(report)) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Parse JSON fields before passing to the PDF generator, mirroring
    // /api/reports/[id]/pdf. The raw-JSON guard prevents a structured
    // detailedReport (JSON) from leaking into the client PDF.
    const reportData = {
      ...report,
      detailedReport: report.detailedReport?.trimStart().startsWith("{")
        ? null
        : report.detailedReport,
      moistureReadings: report.moistureReadings
        ? JSON.parse(report.moistureReadings as string)
        : null,
      psychrometricReadings: report.psychrometricReadings
        ? JSON.parse(report.psychrometricReadings as string)
        : null,
      psychrometricAssessment: report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment as string)
        : null,
      equipmentSelection: report.equipmentSelection
        ? JSON.parse(report.equipmentSelection as string)
        : null,
      scopeAreas: report.scopeAreas
        ? JSON.parse(report.scopeAreas as string)
        : null,
    };

    const theme = resolveOrgBrandTheme(report.user?.organization);
    let pdfBytes = await generateIICRCReportPDF(reportData as any, {
      theme,
      showAiDraftWatermark: isAiDraftPending(report),
    });

    // Append valid floor plans independently, then name every missing,
    // unreadable, or unembeddable render on an availability page.
    const floorPlanOutput = await claimSketchesToFloorPlanOutput(
      report.inspection?.claimSketches ?? [],
    );
    const uploadedFloorPlan = await uploadedFloorPlanToOutput(
      report.inspection?.floorPlanImageUrl,
    );
    const appendedFloorPlans = await appendFloorPlanPagesWithDisclosure(
      pdfBytes,
      uploadedFloorPlan
        ? [...floorPlanOutput, uploadedFloorPlan]
        : floorPlanOutput,
      {
        propertyAddress: report.propertyAddress ?? undefined,
        reportNumber: report.reportNumber ?? undefined,
      },
    );
    pdfBytes = appendedFloorPlans.pdfBytes;

    // Append inspection evidence photos (a broken image is skipped).
    const photos = await inspectionPhotosToImages(
      report.inspection?.photos ?? [],
    );
    pdfBytes = await appendPhotoPages(pdfBytes, photos, {
      propertyAddress: report.propertyAddress ?? undefined,
      reportNumber: report.reportNumber ?? undefined,
    });

    const MAX_PDF_BYTES = 60 * 1024 * 1024; // 60 MB (RA-1331 OOM guard)
    if (pdfBytes.length > MAX_PDF_BYTES) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This report is too large to generate inline. Please contact your restoration provider for a copy.",
        status: 413,
      });
    }

    const filename = `report-${report.reportNumber || report.id}.pdf`.replace(
      /[^a-zA-Z0-9.\-_]/g,
      "-",
    );

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    // RA-786: do not leak error.message to clients
    console.error("[Portal Download] Error:", error);
    return fromException(request, error, {
      stage: "portal/reports/download:get",
    });
  }
}
