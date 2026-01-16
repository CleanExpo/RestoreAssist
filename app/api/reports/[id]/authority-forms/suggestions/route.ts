import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { suggestAuthorityForms, extractReportAnalysis } from "@/lib/authority-forms-suggestions"

/**
 * GET /api/reports/:id/authority-forms/suggestions
 * Get suggested authority forms for a report based on report data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: reportId } = await params

    // Fetch report with all necessary data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        waterCategory: true,
        waterClass: true,
        scopeOfWorksData: true,
        equipmentSelection: true,
        equipmentUsed: true,
        psychrometricAssessment: true,
        biologicalMouldDetected: true,
        methamphetamineScreen: true,
        userId: true,
        assignedManagerId: true,
        assignedAdminId: true
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check permissions - user must own the report or be assigned to it
    if (
      report.userId !== session.user.id &&
      report.assignedManagerId !== session.user.id &&
      report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Extract analysis from report
    const analysis = extractReportAnalysis(report)

    // Get suggestions
    const suggestions = suggestAuthorityForms(analysis)

    // Check which forms already exist for this report
    const existingForms = await prisma.authorityFormInstance.findMany({
      where: { reportId },
      select: { templateId: true },
      include: {
        template: {
          select: { code: true }
        }
      }
    })

    const existingCodes = new Set(
      existingForms.map(f => f.template.code)
    )

    // Mark which suggestions are already created
    const suggestionsWithStatus = suggestions.map(suggestion => ({
      ...suggestion,
      alreadyCreated: existingCodes.has(suggestion.templateCode)
    }))

    return NextResponse.json({
      suggestions: suggestionsWithStatus,
      analysis // Include analysis for debugging/transparency
    })
  } catch (error) {
    console.error("Error getting authority form suggestions:", error)
    return NextResponse.json(
      { error: "Failed to get suggestions" },
      { status: 500 }
    )
  }
}
