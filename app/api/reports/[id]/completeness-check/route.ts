import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateCompletenessScore,
  checkCompletenessBeforeGeneration,
} from "@/lib/validation";
import { scoreReportQuality } from "@/lib/reports/report-quality-score";

// GET - Check report completeness
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id } = await params;

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        inspection: {
          include: {
            // Only `.length` is read per relation — selecting `id` keeps the
            // payload minimal while preserving array length for the evidence score.
            moistureReadings: { select: { id: true } },
            affectedAreas: { select: { id: true } },
            classifications: { select: { id: true } },
            scopeItems: { select: { id: true } },
            costEstimates: { select: { id: true } },
            photos: { select: { id: true } },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Calculate completeness score
    const completenessScore = calculateCompletenessScore(report);

    // Check completeness before generation
    const completenessCheck = checkCompletenessBeforeGeneration(report);

    // Update report with completeness score
    await prisma.report.update({
      where: { id },
      data: {
        completenessScore,
      },
    });

    // Calculate section breakdown
    const sections = {
      required: {
        label: "Required Sections",
        completed: completenessCheck.missingItems.length === 0,
        percentage:
          completenessCheck.missingItems.length === 0
            ? 100
            : Math.max(0, 100 - completenessCheck.missingItems.length * 10),
      },
      enhancement: {
        label: "Enhancement Sections",
        completed: report.tier2Responses ? true : false,
        percentage: report.tier2Responses ? 100 : 0,
        details: report.tier2Responses
          ? "All Tier 2 questions completed ✓"
          : "Tier 2 questions not started",
      },
      optimisation: {
        label: "Optimisation Sections",
        completed: report.tier3Responses ? true : false,
        percentage: report.tier3Responses ? 100 : 0,
        details: report.tier3Responses
          ? "All Tier 3 questions completed ✓"
          : "Tier 3 questions not started",
      },
    };

    // RA-5038 — Senior PM report-quality score (deterministic, read-only).
    // Additive: existing fields are unchanged; `qualityScore` adds the
    // metadata / evidence / neutral-language / IICRC-readiness / client-usability
    // breakdown + a de-duplicated actionable missing-evidence list for the reviewer.
    const insp = report.inspection;
    const qualityScore = scoreReportQuality({
      report: {
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        propertyPostcode: report.propertyPostcode,
        hazardType: report.hazardType,
        incidentDate: report.incidentDate,
        technicianAttendanceDate: report.technicianAttendanceDate,
        jobNumber: report.jobNumber,
        claimReferenceNumber: report.claimReferenceNumber,
        description: report.description,
        technicianFieldReport: report.technicianFieldReport,
        reportInstructions: report.reportInstructions,
        clientSummaryCache: report.clientSummaryCache,
      },
      client: report.client,
      inspection: insp
        ? {
            moistureReadings: insp.moistureReadings.length,
            affectedAreas: insp.affectedAreas.length,
            classifications: insp.classifications.length,
            scopeItems: insp.scopeItems.length,
            costEstimates: insp.costEstimates.length,
            photos: insp.photos.length,
            environmentalData: Boolean(
              (insp as { environmentalData?: unknown }).environmentalData,
            ),
          }
        : null,
    });

    return NextResponse.json({
      completenessScore,
      canGenerate: completenessCheck.canGenerate,
      missingItems: completenessCheck.missingItems,
      warnings: completenessCheck.warnings,
      sections,
      overallPercentage: completenessScore,
      qualityScore,
    });
  } catch (error) {
    console.error("Error checking completeness:", error);
    return NextResponse.json(
      { error: "Failed to check completeness" },
      { status: 500 },
    );
  }
}
