import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateEnhancedReportPDF } from "@/lib/generate-enhanced-report-pdf"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

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
        userId: true
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check ownership
    if (report.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (!report.detailedReport) {
      return NextResponse.json({ error: "Enhanced report not found" }, { status: 404 })
    }

    // Parse equipmentUsed to get technician notes
    let technicianNotes = ""
    let dateOfAttendance = ""
    let clientContacted = ""
    
    try {
      if (report.equipmentUsed) {
        const equipmentData = JSON.parse(report.equipmentUsed)
        technicianNotes = equipmentData.technicianNotes || ""
        dateOfAttendance = equipmentData.dateOfAttendance || ""
        clientContacted = equipmentData.clientContacted || ""
      }
    } catch (e) {
      console.error("Error parsing equipmentUsed:", e)
    }

    // Generate PDF
    const pdfBytes = await generateEnhancedReportPDF({
      enhancedReport: report.detailedReport,
      technicianNotes,
      dateOfAttendance,
      clientContacted,
      reportNumber: report.reportNumber || report.id,
      clientName: report.clientName,
      propertyAddress: report.propertyAddress
    })

    // Return PDF
    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="enhanced-report-${report.reportNumber || report.id}.pdf"`
      }
    })
  } catch (error: any) {
    console.error("Error generating enhanced PDF:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

