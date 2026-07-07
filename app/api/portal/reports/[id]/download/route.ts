import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import { resolveOrgBrandTheme } from "@/lib/clients/brand";
import {
  claimSketchesToFloors,
  uploadedFloorPlanToFloor,
} from "@/lib/reports/claim-sketch-floors";
import { appendSketchPages } from "@/lib/reports/append-sketch-pages";
import { inspectionPhotosToImages } from "@/lib/reports/inspection-photos-to-images";
import { appendPhotoPages } from "@/lib/reports/append-photo-pages";
import { apiError, fromException } from "@/lib/api-errors";

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
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType !== "client") {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const clientId = session.user.clientId;

    if (!clientId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Client ID not found",
        status: 400,
      });
    }

    const { id: reportId } = await params;

    // Fetch report — verify it belongs to this client — with the same artifact
    // relations the dashboard PDF pipeline reads.
    const report = await prisma.report.findFirst({
      where: { id: reportId, clientId },
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

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Don't expose draft reports to clients
    if (report.status === "DRAFT") {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Report is not available for download",
        status: 403,
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
    let pdfBytes = await generateIICRCReportPDF(reportData as any, { theme });

    // Append floor-plan sketches + any uploaded floor-plan image (Gap 6).
    const floors = await claimSketchesToFloors(
      report.inspection?.claimSketches ?? [],
    );
    const uploadedFloor = await uploadedFloorPlanToFloor(
      report.inspection?.floorPlanImageUrl,
    );
    pdfBytes = await appendSketchPages(
      pdfBytes,
      uploadedFloor ? [...floors, uploadedFloor] : floors,
      {
        propertyAddress: report.propertyAddress ?? undefined,
        reportNumber: report.reportNumber ?? undefined,
      },
    );

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

    const filename =
      `report-${report.reportNumber || report.id}.pdf`.replace(
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
