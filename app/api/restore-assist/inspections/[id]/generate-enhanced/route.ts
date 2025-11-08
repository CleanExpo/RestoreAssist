import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { generateInspectionReport, InspectionReportData } from "@/lib/reportGenerator";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const inspectionId = params.id;

    // Get inspection with question responses
    const inspection = await prisma.inspectionReport.findFirst({
      where: {
        id: inspectionId,
        userId,
      },
      include: {
        questionResponses: true,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 }
      );
    }

    // Get user with API key
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        anthropicApiKey: true,
        email: true,
      },
    });

    // Check for API key (with admin bypass)
    const userIsAdmin = isAdmin(session.user.email);
    let apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!userIsAdmin) {
      if (!user?.anthropicApiKey) {
        return NextResponse.json(
          {
            error: "Anthropic API key required",
            message: "Please add your Anthropic API key in Settings → API Key Management to generate reports.",
            requiresApiKey: true,
          },
          { status: 403 }
        );
      }
      apiKey = user.anthropicApiKey;
    } else if (!user?.anthropicApiKey && !apiKey) {
      return NextResponse.json(
        { error: "No API key available for report generation" },
        { status: 400 }
      );
    }

    // Build report data from inspection and question responses
    const reportData: InspectionReportData = {
      property: {
        clientName: inspection.clientName,
        propertyAddress: inspection.propertyAddress,
        dateOfLoss: inspection.incidentDate?.toISOString() || new Date().toISOString(),
        dateOfInspection: inspection.attendanceDate?.toISOString() || new Date().toISOString(),
        lossSource: inspection.waterCategory || 'Unknown',
        propertyType: inspection.propertyType || 'Residential',
        occupancyStatus: inspection.occupancyStatus || 'Occupied',
        constructionYear: inspection.constructionYear || 'Unknown',
      },
      techReport: {
        findings: inspection.technicianReport || '',
        areasAffected: [],
        visualObservations: '',
        moistureReadings: '',
        immediateActionsToken: '',
      },
      responses: {
        waterCategory: 'Category 1',
        waterClass: 'Class 2',
        structuralDamageAssessment: '',
        hazardFlags: [],
        hvacAffected: false,
        electricalHazards: '',
        stopWorkConditions: false,
        authorityNotifications: [],
      },
    };

    // Parse question responses to enrich report data
    if (inspection.questionResponses && inspection.questionResponses.length > 0) {
      inspection.questionResponses.forEach((response) => {
        const answer = typeof response.answerValue === 'string'
          ? response.answerValue
          : JSON.stringify(response.answerValue);

        if (response.questionId === 'T1_Q3') { // Water source/category
          reportData.responses.waterCategory = answer.includes('Category 2') ? 'Category 2'
            : answer.includes('Category 3') ? 'Category 3'
            : 'Category 1';
        }
        if (response.questionId === 'T1_Q7') { // Hazards
          reportData.responses.hazardFlags = Array.isArray(response.answerValue)
            ? response.answerValue as string[]
            : [answer];
        }
      });
    }

    // Generate enhanced report using AI
    console.log(`[RestoreAssist] Generating enhanced report for inspection ${inspectionId}`);
    const generatedReport = await generateInspectionReport(reportData, apiKey);

    // Update inspection with generated content
    const updatedInspection = await prisma.inspectionReport.update({
      where: { id: inspectionId },
      data: {
        executiveSummary: generatedReport.substring(0, 1000), // First 1000 chars as summary
        standardsCompliance: JSON.stringify({ generated: true }),
        dryingProtocol: JSON.stringify({ protocol: 'IICRC S500' }),
        safetyConsiderations: JSON.stringify({ generated: true }),
        authorityNotifications: JSON.stringify({ generated: true }),
        recommendations: generatedReport,
        reportDepth: 'ENHANCED',
        status: 'PRELIMINARY',
        updatedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionReportId: inspectionId,
        userId,
        action: 'GENERATED',
        changes: JSON.stringify({
          reportDepth: 'ENHANCED',
          apiKeyUsed: userIsAdmin ? 'SYSTEM' : 'USER',
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Enhanced report generated successfully",
      report: updatedInspection,
      generatedContent: generatedReport,
    }, { status: 200 });

  } catch (error: any) {
    console.error("[RestoreAssist] Error generating enhanced report:", error);
    return NextResponse.json({
      error: "Failed to generate enhanced report",
      message: error.message || "An unexpected error occurred",
    }, { status: 500 });
  }
}
