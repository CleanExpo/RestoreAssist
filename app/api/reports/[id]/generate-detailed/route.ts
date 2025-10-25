import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateDetailedReport } from "@/lib/anthropic"

// Helper function to safely parse JSON
function safeJsonParse(jsonString: string | null, defaultValue: any) {
  if (!jsonString) return defaultValue
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, 'Error:', error)
    return defaultValue
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Get the existing report
    const report = await prisma.report.findUnique({
      where: { 
        id: id,
        userId: session.user.id 
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    console.log('Generating detailed report for existing report:', id)
    console.log('Report data:', {
      title: report.title,
      clientName: report.clientName,
      waterCategory: report.waterCategory,
      waterClass: report.waterClass
    })

    // Prepare data for AI generation
    const reportData = {
      basicInfo: {
        title: report.title,
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        dateOfLoss: report.inspectionDate?.toISOString(),
        waterCategory: report.waterCategory || 'Category 1',
        waterClass: report.waterClass || 'Class 1',
        hazardType: report.hazardType || 'None',
        insuranceType: report.insuranceType || 'Homeowners',
      },
      remediationData: safeJsonParse(report.decontaminationProcedures, {}),
      dryingPlan: safeJsonParse(report.dryingPlan, {}),
      equipmentSizing: {
        dehumidificationCapacity: report.dehumidificationCapacity,
        airmoversCount: report.airmoversCount,
        equipmentPlacement: safeJsonParse(report.equipmentPlacement, {}),
      },
      monitoringData: {
        psychrometricReadings: safeJsonParse(report.psychrometricReadings, []),
        moistureReadings: safeJsonParse(report.moistureReadings, []),
      },
      insuranceData: {
        propertyCover: safeJsonParse(report.propertyCover, {}),
        contentsCover: safeJsonParse(report.contentsCover, {}),
        liabilityCover: safeJsonParse(report.liabilityCover, {}),
        businessInterruption: safeJsonParse(report.businessInterruption, {}),
        additionalCover: safeJsonParse(report.additionalCover, {}),
      }
    }

    // Generate detailed report using AI
    const detailedReport = await generateDetailedReport(reportData)

    // Update the report with the detailed report
    const updatedReport = await prisma.report.update({
      where: { id: id },
      data: { detailedReport: detailedReport }
    })

    return NextResponse.json({ 
      success: true,
      detailedReport: detailedReport,
      message: 'Detailed report generated successfully'
    })

  } catch (error) {
    console.error("Error generating detailed report:", error)
    return NextResponse.json({ 
      error: "Failed to generate detailed report",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
