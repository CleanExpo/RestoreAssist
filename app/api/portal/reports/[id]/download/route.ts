import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateEnhancedReportPDF } from "@/lib/generate-enhanced-report-pdf";

// GET /api/portal/reports/[id]/download - Download PDF for client portal users
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.userType !== "client") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = session.user.clientId;

    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID not found" },
        { status: 400 },
      );
    }

    const { id: reportId } = await params;

    // Fetch report — verify it belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
      select: {
        id: true,
        reportNumber: true,
        clientName: true,
        propertyAddress: true,
        detailedReport: true,
        equipmentUsed: true,
        status: true,
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Don't expose draft reports to clients
    if (report.status === "DRAFT") {
      return NextResponse.json(
        { error: "Report is not available for download" },
        { status: 403 },
      );
    }

    if (!report.detailedReport) {
      return NextResponse.json(
        { error: "Report PDF content not available" },
        { status: 404 },
      );
    }

    // Parse equipmentUsed to extract optional metadata
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
      console.error("[Portal Download] Error parsing equipmentUsed:", e);
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

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${report.reportNumber || report.id}.pdf"`,
      },
    });
  } catch (error: unknown) {
    // RA-786: do not leak error.message to clients
    console.error("[Portal Download] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
