import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateEnhancedReportPDF } from "@/lib/generate-enhanced-report-pdf";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Fetch report
    const report = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        reportNumber: true,
        clientName: true,
        propertyAddress: true,
        detailedReport: true,
        equipmentUsed: true,
        userId: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Check ownership
    if (report.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Unauthorized",
        status: 403,
      });
    }

    if (!report.detailedReport) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Enhanced report not found",
        status: 404,
      });
    }

    // Parse equipmentUsed to get technician notes
    let technicianNotes = "";
    let dateOfAttendance = "";
    let clientContacted = "";

    try {
      if (report.equipmentUsed) {
        const equipmentData = JSON.parse(report.equipmentUsed);
        technicianNotes = equipmentData.technicianNotes || "";
        dateOfAttendance = equipmentData.dateOfAttendance || "";
        clientContacted = equipmentData.clientContacted || "";
      }
    } catch (e) {
      console.error("Error parsing equipmentUsed:", e);
    }

    // Generate PDF
    const pdfBytes = await generateEnhancedReportPDF({
      enhancedReport: report.detailedReport,
      technicianNotes,
      dateOfAttendance,
      clientContacted,
      reportNumber: report.reportNumber || report.id,
      clientName: report.clientName,
      propertyAddress: report.propertyAddress,
    });

    // Return PDF
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="enhanced-report-${report.reportNumber || report.id}.pdf"`,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "download-enhanced" });
  }
}
