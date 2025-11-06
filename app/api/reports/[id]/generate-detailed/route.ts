import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateDetailedReport } from "@/lib/anthropic"

/**
 * POST /api/reports/[id]/generate-detailed
 *
 * Generate detailed IICRC-compliant report using AI
 *
 * @param {Object} params - Route parameters
 * @param {string} params.id - Report ID
 *
 * @returns {Object} Generated report data
 * @property {boolean} success - Whether generation was successful
 * @property {Object} report - Report data
 * @property {string} report.id - Report ID
 * @property {string} report.detailedContent - Generated detailed report content
 * @property {string} report.generatedAt - ISO timestamp of generation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const reportId = params.id

    // Validate report ID
    if (!reportId) {
      return NextResponse.json(
        { error: "Report ID is required" },
        { status: 400 }
      )
    }

    // Fetch report from database
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        user: {
          select: {
            id: true,
            subscriptionStatus: true,
            creditsRemaining: true,
          }
        }
      }
    })

    // Verify report exists
    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      )
    }

    // Verify user owns this report
    if (report.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden: You don't have access to this report" },
        { status: 403 }
      )
    }

    // Check if detailed report already exists
    if (report.detailedReport) {
      return NextResponse.json({
        success: true,
        report: {
          id: report.id,
          detailedContent: report.detailedReport,
          generatedAt: report.updatedAt.toISOString(),
        },
        message: "Detailed report already exists"
      })
    }

    // Check subscription/credits (for trial users)
    if (report.user.subscriptionStatus === 'TRIAL' &&
        report.user.creditsRemaining < 1) {
      return NextResponse.json(
        {
          error: "Insufficient credits to generate detailed report",
          upgradeRequired: true,
          creditsRemaining: report.user.creditsRemaining
        },
        { status: 402 }
      )
    }

    // Prepare data for AI generation
    const reportData = {
      basicInfo: {
        title: report.title,
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        dateOfLoss: report.inspectionDate?.toISOString() || new Date().toISOString(),
        waterCategory: report.waterCategory || 'Category 1',
        waterClass: report.waterClass || 'Class 1',
        hazardType: report.hazardType,
        insuranceType: report.insuranceType,
      },
      remediationData: {
        safetyPlan: report.safetyPlan,
        containmentSetup: report.containmentSetup,
        decontaminationProcedures: report.decontaminationProcedures,
        postRemediationVerification: report.postRemediationVerification,
      },
      dryingPlan: {
        targetHumidity: report.targetHumidity,
        targetTemperature: report.targetTemperature,
        estimatedDryingTime: report.estimatedDryingTime,
        equipmentPlacement: report.equipmentPlacement,
      },
      equipmentSizing: {
        dehumidificationCapacity: report.dehumidificationCapacity,
        airmoversCount: report.airmoversCount,
        equipmentUsed: report.equipmentUsed,
      },
      monitoringData: {
        psychrometricReadings: report.psychrometricReadings
          ? JSON.parse(report.psychrometricReadings)
          : null,
        moistureReadings: report.moistureReadings
          ? JSON.parse(report.moistureReadings)
          : null,
      },
      insuranceData: {
        propertyCover: report.propertyCover
          ? JSON.parse(report.propertyCover)
          : null,
        contentsCover: report.contentsCover
          ? JSON.parse(report.contentsCover)
          : null,
        liabilityCover: report.liabilityCover
          ? JSON.parse(report.liabilityCover)
          : null,
        businessInterruption: report.businessInterruption
          ? JSON.parse(report.businessInterruption)
          : null,
        additionalCover: report.additionalCover
          ? JSON.parse(report.additionalCover)
          : null,
      }
    }

    // Generate detailed report using Anthropic AI
    let detailedContent: string
    try {
      console.log(`Generating detailed report for report ID: ${reportId}`)
      detailedContent = await generateDetailedReport(reportData)
      console.log(`Successfully generated detailed report, length: ${detailedContent.length}`)
    } catch (aiError) {
      console.error("AI generation error:", aiError)
      return NextResponse.json(
        {
          error: "Failed to generate detailed report",
          details: aiError instanceof Error ? aiError.message : "Unknown AI error"
        },
        { status: 500 }
      )
    }

    // Update report with generated content
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        detailedReport: detailedContent,
        updatedAt: new Date(),
      }
    })

    // Deduct credits for trial users
    if (report.user.subscriptionStatus === 'TRIAL') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          creditsRemaining: Math.max(0, report.user.creditsRemaining - 1),
          totalCreditsUsed: {
            increment: 1
          }
        }
      })
    }

    // Return success response
    return NextResponse.json({
      success: true,
      report: {
        id: updatedReport.id,
        detailedContent: updatedReport.detailedReport,
        generatedAt: updatedReport.updatedAt.toISOString(),
      }
    }, { status: 200 })

  } catch (error) {
    console.error("Error generating detailed report:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
