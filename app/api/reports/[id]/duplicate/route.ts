import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateReport } from "@/lib/report-limits";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: duplicating a report deducts credits — retry without idempotency
  // would double-deduct and create two duplicates of the same source report.
  return withIdempotency(request, userId, async () => {
    try {
      // Check if user can create a report
      const canCreate = await canCreateReport(userId);

      if (!canCreate.allowed) {
        return NextResponse.json(
          {
            error: canCreate.reason || "Cannot create report",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }

      // Find the original report
      const originalReport = await prisma.report.findFirst({
        where: {
          id: id,
          userId: userId,
        },
      });

      if (!originalReport) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      // Generate new report number
      const newReportNumber = `WD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      // RA-6982 — charge BEFORE creating the report. The canCreateReport gate
      // above is advisory (check-then-act); the authoritative atomic charge is
      // here. At-cap, or in the race window past that gate, the atomic deduct
      // throws INSUFFICIENT_CREDITS → 402 and NO report row is created — the
      // previous "create then deduct, swallow the throw" gave a free report.
      // A post-charge create failure is compensated with a single refund.
      const { deductCreditsAndTrackUsage, refundCreditsAndTrackUsage } =
        await import("@/lib/report-limits");
      try {
        await deductCreditsAndTrackUsage(userId);
      } catch (creditError) {
        if (
          creditError instanceof Error &&
          creditError.message === "INSUFFICIENT_CREDITS"
        ) {
          return NextResponse.json(
            {
              error: "No credits remaining. Please subscribe to continue.",
              upgradeRequired: true,
            },
            { status: 402 },
          );
        }
        throw creditError;
      }

      let duplicatedReport;
      try {
        duplicatedReport = await prisma.report.create({
          data: {
            // Basic fields
            title: `${originalReport.title} (Copy)`,
            clientName: originalReport.clientName,
            propertyAddress: originalReport.propertyAddress,
            hazardType: originalReport.hazardType,
            insuranceType: originalReport.insuranceType,
            reportNumber: newReportNumber,
            userId: userId,
            clientId: originalReport.clientId,

            // IICRC Assessment fields
            inspectionDate: new Date(),
            waterCategory: originalReport.waterCategory,
            waterClass: originalReport.waterClass,
            sourceOfWater: originalReport.sourceOfWater,
            affectedArea: originalReport.affectedArea,
            safetyHazards: originalReport.safetyHazards,

            // Damage assessment fields
            structuralDamage: originalReport.structuralDamage,
            contentsDamage: originalReport.contentsDamage,
            hvacAffected: originalReport.hvacAffected,
            electricalHazards: originalReport.electricalHazards,
            microbialGrowth: originalReport.microbialGrowth,

            // Equipment and drying fields
            dehumidificationCapacity: originalReport.dehumidificationCapacity,
            airmoversCount: originalReport.airmoversCount,
            targetHumidity: originalReport.targetHumidity,
            targetTemperature: originalReport.targetTemperature,
            estimatedDryingTime: originalReport.estimatedDryingTime,
            equipmentPlacement: originalReport.equipmentPlacement,

            // Monitoring data (copy JSON strings)
            psychrometricReadings: originalReport.psychrometricReadings,
            moistureReadings: originalReport.moistureReadings,

            // Remediation data
            safetyPlan: originalReport.safetyPlan,
            containmentSetup: originalReport.containmentSetup,
            decontaminationProcedures: originalReport.decontaminationProcedures,
            postRemediationVerification:
              originalReport.postRemediationVerification,

            // Insurance data (copy JSON strings)
            propertyCover: originalReport.propertyCover,
            contentsCover: originalReport.contentsCover,
            liabilityCover: originalReport.liabilityCover,
            businessInterruption: originalReport.businessInterruption,
            additionalCover: originalReport.additionalCover,

            // Set as draft
            status: "DRAFT",

            // Optional fields
            totalCost: null, // Reset cost for new report
            description: originalReport.description,
            completionDate: null, // Reset completion date
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
      } catch (createError) {
        // Charged but the report never persisted — refund the slot (best-effort,
        // never throws) before re-raising so the failure surfaces normally.
        await refundCreditsAndTrackUsage(userId);
        throw createError;
      }

      return NextResponse.json(duplicatedReport, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "duplicate" });
    }
  });
}
