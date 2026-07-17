import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDetailedReport } from "@/lib/anthropic";
import { withIdempotency } from "@/lib/idempotency";
import { track, isFirstTime } from "@/lib/analytics/track";
import { parseDate } from "@/lib/parse-date";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    // Only apply pagination if explicitly requested, otherwise fetch all (up to 10000)
    const shouldPaginate = pageParam !== null || limitParam !== null;
    // RA-6963 (rule 3/14) — clamp caller-supplied page/limit (pattern
    // clients/route.ts:26-29) so ?limit=1e9 can't force an unbounded read and
    // ?page=-1 can't force a negative skip (Prisma throws). With no pagination
    // params, retain the bounded fetch-all the reports list, dashboard, and
    // completeness-check pages depend on (all call /api/reports with no params).
    const page = Math.max(1, parseInt(pageParam || "1") || 1);
    const limit = limitParam
      ? Math.min(100, Math.max(1, parseInt(limitParam) || 10))
      : shouldPaginate
        ? 10
        : 10000;
    const status = searchParams.get("status");
    const waterCategory = searchParams.get("waterCategory");
    const waterClass = searchParams.get("waterClass");

    const where: any = {
      userId: session.user.id,
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (waterCategory && waterCategory !== "all") {
      where.waterCategory = waterCategory;
    }

    if (waterClass && waterClass !== "all") {
      where.waterClass = waterClass;
    }

    // RA-6963 (rule 3) — explicit select (pattern analytics/route.ts:205-229):
    // only the columns the reports list, dashboard, and completeness-check pages
    // actually render, instead of the default full-row spread. Drops the unused
    // `user` include. `estimatedCost`/`policyType` are not columns (mapped/absent
    // downstream); `aiSynopsis` is the cached per-row one-liner the list renders.
    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: shouldPaginate ? (page - 1) * limit : 0,
      take: limit,
      select: {
        id: true,
        reportNumber: true,
        title: true,
        clientName: true,
        propertyAddress: true,
        status: true,
        waterCategory: true,
        totalCost: true,
        aiSynopsis: true,
        createdAt: true,
        aiDraftGeneratedAt: true,
        aiDraftHumanEditedAt: true,
        reportOwnershipAcknowledgedAt: true,
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true,
          },
        },
      },
    });

    // Map reports to include estimatedCost from estimate
    const reportsWithCost = reports.map((report: (typeof reports)[number]) => ({
      ...report,
      estimatedCost:
        report.estimates?.[0]?.totalIncGST ||
        (report as any).estimatedCost ||
        null,
    }));

    const total = await prisma.report.count({ where });

    return NextResponse.json({
      reports: reportsWithCost,
      ...(page && limit
        ? {
            pagination: {
              page,
              limit,
              total,
              pages: Math.ceil(total / limit),
            },
          }
        : { total }),
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: CRITICAL — this route deducts credits. Without the guard,
  // a retried POST would double-deduct AND create two reports.
  return withIdempotency(request, userId, async (rawBody) => {
    // RA-1377 — hoisted to the callback scope so the create-stage catch can see
    // them. `charged` flips true only after a successful credit/usage deduct;
    // `reportPersisted` flips true only after report.create succeeds. The catch
    // refunds at-most-once (charged && !reportPersisted) and never on the happy
    // path. `refundCharge` is captured from the dynamic import so the catch can
    // call the inverse of deductCreditsAndTrackUsage.
    let charged = false;
    let reportPersisted = false;
    let refundCharge:
      | ((creatorUserId: string) => Promise<{ refunded: boolean }>)
      | null = null;

    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      // Validate required fields
      const requiredFields = [
        "title",
        "clientName",
        "propertyAddress",
        "waterCategory",
        "waterClass",
      ];

      for (const field of requiredFields) {
        if (!body[field]) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Missing required field: ${field}`,
            status: 400,
          });
        }
      }

      // RA-1300 — reject malformed user-supplied dates up-front (400) instead
      // of persisting an Invalid Date silently. Both fields are optional;
      // only fail when the CALLER supplied the key but the value didn't
      // parse (distinguishes "not provided" from "provided but invalid").
      let inspectionDateParsed: Date | null = null;
      let completionDateParsed: Date | null = null;
      if (body.inspectionDate !== undefined && body.inspectionDate !== null) {
        inspectionDateParsed = parseDate(body.inspectionDate);
        if (inspectionDateParsed === null) {
          return apiError(request, {
            code: "VALIDATION",
            message:
              "inspectionDate is not a valid date (expected ISO-8601 or similar)",
            status: 400,
            fields: { inspectionDate: "invalid date" },
          });
        }
      }
      if (body.completionDate !== undefined && body.completionDate !== null) {
        completionDateParsed = parseDate(body.completionDate);
        if (completionDateParsed === null) {
          return apiError(request, {
            code: "VALIDATION",
            message:
              "completionDate is not a valid date (expected ISO-8601 or similar)",
            status: 400,
            fields: { completionDate: "invalid date" },
          });
        }
      }

      // RA-1246 — first_report_started: user has 0 prior reports AND
      // hasn't emitted this event yet. Fire-and-forget.
      try {
        const priorReports = await prisma.report.count({ where: { userId } });
        if (
          priorReports === 0 &&
          (await isFirstTime(userId, "first_report_started"))
        ) {
          track(userId, "first_report_started").catch(() => {});
        }
      } catch {
        // analytics must never block the user flow
      }

      const {
        canCreateReport,
        deductCreditsAndTrackUsage,
        refundCreditsAndTrackUsage,
      } = await import("@/lib/report-limits");
      refundCharge = refundCreditsAndTrackUsage;
      const canCreate = await canCreateReport(userId);
      if (!canCreate.allowed) {
        return NextResponse.json(
          {
            error:
              canCreate.reason ||
              "Insufficient credits. Please upgrade your plan to create more reports.",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }

      // RA-6932 (P0) — resolve the workspace's own BYOK Anthropic key BEFORE the
      // credit deduction, so a keyless workspace gets a hard 402 without ever
      // being charged a credit. Never falls through to the platform
      // ANTHROPIC_API_KEY; the resolved key is passed into generateDetailedReport.
      let anthropicApiKey: string;
      try {
        anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC"))
          .apiKey;
      } catch (error) {
        if (error instanceof NoWorkspaceKeyError) {
          return apiError(request, {
            code: "PAYMENT_REQUIRED",
            message: error.message,
            status: 402,
          });
        }
        throw error;
      }

      // RA-1377 — the deduct happens here, BEFORE the slow/external AI call and
      // before the report row is persisted, and is deliberately NOT in a
      // transaction. Mark `charged` so a post-deduct, pre-create failure can be
      // compensated with a refund in the create-stage catch.
      try {
        await deductCreditsAndTrackUsage(userId);
        charged = true;
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

      // Generate report number if not provided
      const reportNumber =
        body.reportNumber ||
        `WD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      // Calculate equipment needs based on IICRC S500 guidelines
      const equipmentNeeds = calculateEquipmentNeeds(
        body.waterClass,
        body.affectedArea,
      );

      // Process insurance data
      const insuranceData = body.insuranceData || {};

      // Generate detailed report using AI
      let detailedReport = null;
      try {
        detailedReport = await generateDetailedReport(
          {
            basicInfo: {
              title: body.title,
              clientName: body.clientName,
              propertyAddress: body.propertyAddress,
              dateOfLoss: body.dateOfLoss,
              waterCategory: body.waterCategory,
              waterClass: body.waterClass,
              hazardType: body.hazardType,
              insuranceType: body.insuranceType,
            },
            remediationData: body.remediationData,
            dryingPlan: body.dryingPlan,
            equipmentSizing: body.equipmentSizing,
            monitoringData: body.monitoringData,
            insuranceData: body.insuranceData,
          },
          anthropicApiKey,
        );
      } catch (aiError) {
        console.error("Error generating detailed report:", aiError);
        console.error("AI Error details:", {
          message: aiError instanceof Error ? aiError.message : "Unknown error",
          stack: aiError instanceof Error ? aiError.stack : undefined,
        });
        // Continue without detailed report - don't fail the entire process
      }

      // Find client by name to set clientId (for linking updated client info)
      let clientId = body.clientId || null;
      if (body.clientName && !clientId) {
        const client = await prisma.client.findFirst({
          where: {
            name: body.clientName,
            userId,
          },
        });
        if (client) {
          clientId = client.id;
        }
      }

      const report = await prisma.report.create({
        data: {
          // Basic fields
          title: body.title,
          clientName: body.clientName,
          clientId: clientId,
          propertyAddress: body.propertyAddress,
          hazardType: body.hazardType,
          insuranceType: body.insuranceType,
          status: "COMPLETED", // Set status as COMPLETED when report is created
          reportNumber,
          userId,

          // IICRC Assessment fields
          // RA-1300 — reject malformed dates with 400 instead of silently
          // persisting an Invalid Date. inspectionDateParsed is validated
          // above; fall back to now() when not supplied.
          inspectionDate: inspectionDateParsed ?? new Date(),
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
          dehumidificationCapacity: equipmentNeeds.dehumidification,
          airmoversCount: equipmentNeeds.airmovers,
          targetHumidity: body.dryingPlan?.targetHumidity,
          targetTemperature: body.dryingPlan?.targetTemperature,
          estimatedDryingTime: body.dryingPlan?.estimatedDryingTime,
          equipmentPlacement: body.equipmentSizing?.equipmentPlacement,

          // Monitoring data (stored as JSON strings)
          psychrometricReadings: body.monitoringData?.psychrometricReadings
            ? JSON.stringify(body.monitoringData.psychrometricReadings)
            : null,
          moistureReadings: body.monitoringData?.moistureReadings
            ? JSON.stringify(body.monitoringData.moistureReadings)
            : null,

          // Remediation data (stored as JSON strings)
          safetyPlan: body.remediationData?.safetyPlan,
          containmentSetup: body.remediationData?.containmentSetup,
          decontaminationProcedures:
            body.remediationData?.decontaminationProcedures,
          postRemediationVerification:
            body.remediationData?.postRemediationVerification,

          // Insurance data (stored as JSON strings)
          propertyCover: insuranceData.propertyCover
            ? JSON.stringify(insuranceData.propertyCover)
            : null,
          contentsCover: insuranceData.contentsCover
            ? JSON.stringify(insuranceData.contentsCover)
            : null,
          liabilityCover: insuranceData.liabilityCover
            ? JSON.stringify(insuranceData.liabilityCover)
            : null,
          businessInterruption: insuranceData.businessInterruption
            ? JSON.stringify(insuranceData.businessInterruption)
            : null,
          additionalCover: insuranceData.additionalCover
            ? JSON.stringify(insuranceData.additionalCover)
            : null,

          // Optional fields
          // RA-1300 — use validated parse; null if unparseable.
          completionDate: completionDateParsed,
          totalCost: body.totalCost,
          description: body.description,

          // AI-Generated Detailed Report
          detailedReport: detailedReport,
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      // RA-1377 — report is durably persisted; the charge is now legitimate.
      // Any failure beyond this point must NOT trigger a refund.
      reportPersisted = true;

      // RA-1246 — first_report_saved (first-time only, AFTER persist)
      if (await isFirstTime(userId, "first_report_saved")) {
        track(userId, "first_report_saved", { reportId: report.id }).catch(
          () => {},
        );
      }

      return NextResponse.json(
        {
          ...report,
          detailedReportGenerated: !!detailedReport,
          detailedReportLength: detailedReport?.length || 0,
          aiGenerationStatus: detailedReport ? "success" : "failed",
        },
        { status: 201 },
      );
    } catch (error) {
      // RA-1377 — compensating refund. If we charged the user's credit/usage
      // slot but no report was durably persisted (AI gen, client lookup, or
      // report.create threw), give the quota back so transient failures don't
      // silently burn a paying user's allowance. Best-effort: a refund failure
      // is logged inside refundCreditsAndTrackUsage and never masks the
      // original error. `reportPersisted` guards against double-refund / a
      // refund on a charge that did produce a report.
      if (charged && !reportPersisted && refundCharge) {
        try {
          const { refunded } = await refundCharge(userId);
          if (!refunded) {
            console.error(
              `[reports] credit/usage refund incomplete after failed report creation for user ${userId}`,
            );
          }
        } catch (refundError) {
          // refundCreditsAndTrackUsage is best-effort and shouldn't throw, but
          // guard anyway so a refund bug can never swallow the real error.
          console.error(
            `[reports] unexpected error during credit/usage refund for user ${userId}:`,
            refundError instanceof Error ? refundError.message : refundError,
          );
        }
      }
      return fromException(request, error, { stage: "create" });
    }
  });
}

function calculateEquipmentNeeds(waterClass: string, affectedArea: number) {
  if (!affectedArea) return { airmovers: 0, dehumidification: 0 };

  let airmovers = 0;
  let dehumidification = 0;

  switch (waterClass) {
    case "Class 1":
      airmovers = Math.ceil(affectedArea / 60); // 1 per 50-70 sq ft
      dehumidification = Math.ceil(affectedArea / 100) * 20; // 20L per 100 sq ft
      break;
    case "Class 2":
      airmovers = Math.ceil(affectedArea / 50); // 1 per 50 sq ft
      dehumidification = Math.ceil(affectedArea / 80) * 30; // 30L per 80 sq ft
      break;
    case "Class 3":
      airmovers = Math.ceil(affectedArea / 40); // 1 per 40 sq ft
      dehumidification = Math.ceil(affectedArea / 60) * 40; // 40L per 60 sq ft
      break;
    case "Class 4":
      airmovers = Math.ceil(affectedArea / 30); // 1 per 30 sq ft
      dehumidification = Math.ceil(affectedArea / 40) * 50; // 50L per 40 sq ft
      break;
    default:
      airmovers = Math.ceil(affectedArea / 50);
      dehumidification = Math.ceil(affectedArea / 80) * 25;
  }

  return { airmovers, dehumidification };
}
