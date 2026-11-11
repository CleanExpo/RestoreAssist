import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveReportPricing } from "@/lib/pricing/report-pricing";
import {
  hasStoredEquipment,
  priceStoredEquipment,
  storedEquipmentResponse,
  type StoredEquipmentSelections,
} from "@/lib/reports/stored-equipment-pricing";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { pricingConfig: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify report belongs to user
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // RA-8281 B1 class fix: the server prices the selections from the report
    // business's CURRENT price list. The client's rates and total are not
    // trusted: a rate the price list leaves unset refuses the save (422) and
    // is never stored as $0, and the stored total is the server's own.
    // RA-8281 B1 review round 11: any posted shape is read through the one
    // normaliser, so a non-list value is priced (or refused), never cleared.
    // Round 13: the posted value stays opaque here; only
    // stored-equipment-pricing.ts reads inside it.
    const selections: StoredEquipmentSelections = body.equipmentSelection;
    const supplied = selections !== null && selections !== undefined;
    // An empty list is stored as [] (as before); no selection at all as null.
    let pricedLines: Array<{
      groupId: string;
      quantity: number;
      dailyRate: number | null;
    }> | null = supplied ? [] : null;
    let equipmentCostTotal: number | null = null;
    if (hasStoredEquipment(selections)) {
      const reportPricing = await resolveReportPricing(
        user.id,
        user.pricingConfig,
        report.createdAt,
      );
      if (!reportPricing.ok) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "This report's business could not be confirmed.",
          status: 403,
        });
      }
      const priced = priceStoredEquipment(
        selections,
        reportPricing.pricingConfig,
        Number(body.estimatedDryingDuration) || 1,
      );
      if (priced.total === null) {
        return apiError(request, {
          code: "VALIDATION",
          message: priced.problems.join(" "),
          status: 422,
        });
      }
      pricedLines = priced.lines.map((line) => ({
        groupId: line.groupId,
        quantity: line.quantity,
        dailyRate: line.dailyRate,
      }));
      equipmentCostTotal = priced.total;
    }

    // Update report with equipment data
    await prisma.report.update({
      where: { id, userId: user.id },
      data: {
        psychrometricAssessment: body.psychrometricAssessment
          ? JSON.stringify(body.psychrometricAssessment)
          : null,
        scopeAreas: body.scopeAreas ? JSON.stringify(body.scopeAreas) : null,
        equipmentSelection: pricedLines
          ? JSON.stringify(pricedLines)
          : null,
        equipmentCostTotal,
        estimatedDryingDuration: body.estimatedDryingDuration || null,
        // Update related fields if provided
        waterClass:
          body.psychrometricAssessment?.waterClass?.toString() ||
          report.waterClass,
        targetTemperature:
          body.psychrometricAssessment?.temperature || report.targetTemperature,
        targetHumidity:
          body.psychrometricAssessment?.humidity || report.targetHumidity,
        affectedArea: body.metrics?.totalAffectedArea || report.affectedArea,
        dehumidificationCapacity:
          body.metrics?.waterRemovalTarget || report.dehumidificationCapacity,
        airmoversCount:
          body.metrics?.airMoversRequired || report.airmoversCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Equipment data saved successfully",
    });
  } catch (error) {
    return fromException(request, error, { stage: "equipment-save" });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { pricingConfig: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;

    // Get report with equipment data
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // RA-8281 B1 round 13: the screen reloads from here, so this answers with
    // the lines priced NOW from the report business's price list. The rate
    // cached on each stored line and the cached report.equipmentCostTotal are
    // never returned: a rate cleared since the save reads null with its
    // "Rate not set" note and the total is null. A business that cannot be
    // confirmed gets no price list, so every rate reads as not set.
    const stored: StoredEquipmentSelections = report.equipmentSelection;
    let currentPricing: unknown = null;
    if (hasStoredEquipment(stored)) {
      const reportPricing = await resolveReportPricing(
        user.id,
        user.pricingConfig,
        report.createdAt,
      );
      currentPricing = reportPricing.ok ? reportPricing.pricingConfig : null;
    }
    const equipment = storedEquipmentResponse(
      stored,
      currentPricing,
      Number(report.estimatedDryingDuration) || 1,
    );

    return NextResponse.json({
      psychrometricAssessment: report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment)
        : null,
      scopeAreas: report.scopeAreas ? JSON.parse(report.scopeAreas) : null,
      ...equipment,
      estimatedDryingDuration: report.estimatedDryingDuration,
    });
  } catch (error) {
    return fromException(request, error, { stage: "equipment-get" });
  }
}
