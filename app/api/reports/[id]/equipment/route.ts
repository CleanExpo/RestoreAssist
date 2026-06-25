import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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

    // Update report with equipment data
    await prisma.report.update({
      where: { id, userId: user.id },
      data: {
        psychrometricAssessment: body.psychrometricAssessment
          ? JSON.stringify(body.psychrometricAssessment)
          : null,
        scopeAreas: body.scopeAreas ? JSON.stringify(body.scopeAreas) : null,
        equipmentSelection: body.equipmentSelection
          ? JSON.stringify(body.equipmentSelection)
          : null,
        equipmentCostTotal: body.equipmentCostTotal || null,
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

    return NextResponse.json({
      psychrometricAssessment: report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment)
        : null,
      scopeAreas: report.scopeAreas ? JSON.parse(report.scopeAreas) : null,
      equipmentSelection: report.equipmentSelection
        ? JSON.parse(report.equipmentSelection)
        : null,
      equipmentCostTotal: report.equipmentCostTotal,
      estimatedDryingDuration: report.estimatedDryingDuration,
    });
  } catch (error) {
    return fromException(request, error, { stage: "equipment-get" });
  }
}
