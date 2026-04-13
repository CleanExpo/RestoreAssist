import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const report = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Parse JSON fields back to objects for frontend use
    const parsedReport = {
      ...report,
      psychrometricReadings: report.psychrometricReadings
        ? JSON.parse(report.psychrometricReadings)
        : null,
      moistureReadings: report.moistureReadings
        ? JSON.parse(report.moistureReadings)
        : null,
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
      // Phase 3 & 4: Parse analysis and tier responses
      technicianReportAnalysis: report.technicianReportAnalysis
        ? JSON.parse(report.technicianReportAnalysis)
        : null,
      tier1Responses: report.tier1Responses
        ? JSON.parse(report.tier1Responses)
        : null,
      tier2Responses: report.tier2Responses
        ? JSON.parse(report.tier2Responses)
        : null,
      tier3Responses: report.tier3Responses
        ? JSON.parse(report.tier3Responses)
        : null,
      // Phase 6 & 7: Parse scope and cost data
      scopeOfWorksData: report.scopeOfWorksData
        ? JSON.parse(report.scopeOfWorksData)
        : null,
      costEstimationData: report.costEstimationData
        ? JSON.parse(report.costEstimationData)
        : null,
      // Equipment Tools: Parse psychrometric and equipment data
      psychrometricAssessment: report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment)
        : null,
      scopeAreas: report.scopeAreas ? JSON.parse(report.scopeAreas) : null,
      equipmentSelection: report.equipmentSelection
        ? JSON.parse(report.equipmentSelection)
        : null,
    };

    return NextResponse.json(parsedReport);
  } catch (error) {
    console.error("Error fetching report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // ── Allowlist validation on the most dangerous scalar fields ─────────────
    const VALID_WATER_CATEGORIES = [
      "Category 1",
      "Category 2",
      "Category 3",
      null,
      undefined,
    ];
    const VALID_WATER_CLASSES = [
      "Class 1",
      "Class 2",
      "Class 3",
      "Class 4",
      null,
      undefined,
    ];
    const VALID_DEPTH_LEVELS = [
      "Basic",
      "Enhanced",
      "Optimised",
      null,
      undefined,
    ];

    if (
      body.waterCategory !== undefined &&
      !VALID_WATER_CATEGORIES.includes(body.waterCategory)
    ) {
      return NextResponse.json(
        { error: `Invalid waterCategory` },
        { status: 400 },
      );
    }
    if (
      body.waterClass !== undefined &&
      !VALID_WATER_CLASSES.includes(body.waterClass)
    ) {
      return NextResponse.json(
        { error: `Invalid waterClass` },
        { status: 400 },
      );
    }
    if (
      body.reportDepthLevel !== undefined &&
      !VALID_DEPTH_LEVELS.includes(body.reportDepthLevel)
    ) {
      return NextResponse.json(
        { error: `Invalid reportDepthLevel` },
        { status: 400 },
      );
    }
    if (body.totalCost !== undefined && body.totalCost !== null) {
      const tc = Number(body.totalCost);
      if (!isFinite(tc) || tc < 0 || tc > 100_000_000) {
        return NextResponse.json(
          {
            error:
              "totalCost must be a non-negative finite number up to 100,000,000",
          },
          { status: 400 },
        );
      }
    }
    if (body.dryingPlan?.targetHumidity !== undefined) {
      const h = Number(body.dryingPlan.targetHumidity);
      if (!isFinite(h) || h < 0 || h > 100) {
        return NextResponse.json(
          { error: "targetHumidity must be between 0 and 100" },
          { status: 400 },
        );
      }
    }
    if (body.dryingPlan?.targetTemperature !== undefined) {
      const t = Number(body.dryingPlan.targetTemperature);
      if (!isFinite(t) || t < -20 || t > 100) {
        return NextResponse.json(
          { error: "targetTemperature must be between -20 and 100" },
          { status: 400 },
        );
      }
    }

    // Check if report exists and belongs to user
    const existingReport = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Sanitise free-text fields — consistent with POST handler (create path)
    const sanitisedTitle =
      body.title !== undefined ? sanitizeString(body.title, 500) : undefined;
    const sanitisedClientName =
      body.clientName !== undefined
        ? sanitizeString(body.clientName, 300)
        : undefined;
    const sanitisedPropertyAddress =
      body.propertyAddress !== undefined
        ? sanitizeString(body.propertyAddress, 500)
        : undefined;
    const sanitisedHazardType =
      body.hazardType !== undefined
        ? sanitizeString(body.hazardType, 200)
        : undefined;
    const sanitisedInsuranceType =
      body.insuranceType !== undefined
        ? sanitizeString(body.insuranceType, 200)
        : undefined;
    const sanitisedDescription =
      body.description !== undefined
        ? sanitizeString(body.description, 5000)
        : undefined;

    // Update the report with the same field mapping as POST
    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        // Basic fields (sanitised)
        title: sanitisedTitle,
        clientName: sanitisedClientName,
        propertyAddress: sanitisedPropertyAddress,
        hazardType: sanitisedHazardType,
        insuranceType: sanitisedInsuranceType,

        // IICRC Assessment fields
        inspectionDate: body.inspectionDate
          ? new Date(body.inspectionDate)
          : existingReport.inspectionDate,
        waterCategory: body.waterCategory,
        waterClass: body.waterClass,
        sourceOfWater: body.sourceOfWater,
        affectedArea: body.affectedArea,
        safetyHazards: body.safetyHazards,

        // Damage assessment fields
        structuralDamage: body.structuralDamage,
        contentsDamage: body.contentsDamage,
        hvacAffected: body.hvacAffected,
        electricalHazards: body.electricalHazards,
        microbialGrowth: body.microbialGrowth,

        // Equipment and drying fields
        targetHumidity: body.dryingPlan?.targetHumidity,
        targetTemperature: body.dryingPlan?.targetTemperature,
        estimatedDryingTime: body.dryingPlan?.estimatedDryingTime,
        equipmentPlacement: body.equipmentSizing?.equipmentPlacement,

        // Monitoring data (stored as JSON strings)
        psychrometricReadings: body.monitoringData?.psychrometricReadings
          ? JSON.stringify(body.monitoringData.psychrometricReadings)
          : existingReport.psychrometricReadings,
        moistureReadings: body.monitoringData?.moistureReadings
          ? JSON.stringify(body.monitoringData.moistureReadings)
          : existingReport.moistureReadings,

        // Remediation data (stored as JSON strings)
        safetyPlan: body.remediationData?.safetyPlan,
        containmentSetup: body.remediationData?.containmentSetup,
        decontaminationProcedures:
          body.remediationData?.decontaminationProcedures,
        postRemediationVerification:
          body.remediationData?.postRemediationVerification,

        // Insurance data (stored as JSON strings)
        propertyCover: body.insuranceData?.propertyCover
          ? JSON.stringify(body.insuranceData.propertyCover)
          : existingReport.propertyCover,
        contentsCover: body.insuranceData?.contentsCover
          ? JSON.stringify(body.insuranceData.contentsCover)
          : existingReport.contentsCover,
        liabilityCover: body.insuranceData?.liabilityCover
          ? JSON.stringify(body.insuranceData.liabilityCover)
          : existingReport.liabilityCover,
        businessInterruption: body.insuranceData?.businessInterruption
          ? JSON.stringify(body.insuranceData.businessInterruption)
          : existingReport.businessInterruption,
        additionalCover: body.insuranceData?.additionalCover
          ? JSON.stringify(body.insuranceData.additionalCover)
          : existingReport.additionalCover,

        // Optional fields
        completionDate: body.completionDate
          ? new Date(body.completionDate)
          : existingReport.completionDate,
        totalCost: body.totalCost,
        description: sanitisedDescription,

        // Phase 6 & 7: Scope of Works and Cost Estimation documents
        scopeOfWorksDocument:
          body.scopeOfWorksDocument !== undefined
            ? body.scopeOfWorksDocument
            : existingReport.scopeOfWorksDocument,
        costEstimationDocument:
          body.costEstimationDocument !== undefined
            ? body.costEstimationDocument
            : existingReport.costEstimationDocument,

        // Detailed Report (inspection report)
        detailedReport:
          body.detailedReport !== undefined
            ? body.detailedReport
            : existingReport.detailedReport,

        // Report Depth Level
        reportDepthLevel:
          body.reportDepthLevel !== undefined
            ? body.reportDepthLevel
            : existingReport.reportDepthLevel,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true,
          },
        },
      },
    });

    return NextResponse.json(updatedReport);
  } catch (error) {
    console.error("Error updating report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if report exists and belongs to user
    const existingReport = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await prisma.report.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Error deleting report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
