import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function PATCH(
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

    const { id } = await params;
    const body = await request.json();
    const { section, data } = body;

    // Check if report exists and belongs to user
    const existingReport = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!existingReport) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Map section names to database fields
    const sectionMappings: Record<string, Record<string, string>> = {
      "claim details": {
        clientName: "clientName",
        propertyAddress: "propertyAddress",
        hazardType: "hazardType",
        insuranceType: "insuranceType",
        inspectionDate: "inspectionDate",
        reportNumber: "reportNumber",
      },
      assessment: {
        waterCategory: "waterCategory",
        waterClass: "waterClass",
        sourceOfWater: "sourceOfWater",
        affectedArea: "affectedArea",
        safetyHazards: "safetyHazards",
        structuralDamage: "structuralDamage",
        contentsDamage: "contentsDamage",
        hvacAffected: "hvacAffected",
        electricalHazards: "electricalHazards",
        microbialGrowth: "microbialGrowth",
      },
      "drying plan": {
        estimatedDryingTime: "estimatedDryingTime",
        targetHumidity: "targetHumidity",
        targetTemperature: "targetTemperature",
        dehumidificationCapacity: "dehumidificationCapacity",
        airmoversCount: "airmoversCount",
      },
    };

    const fieldMapping = sectionMappings[section.toLowerCase()];
    if (!fieldMapping) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Unknown section: ${section}`,
        status: 400,
      });
    }

    // Build update data object
    const updateData: any = {};

    Object.keys(data).forEach((key) => {
      if (fieldMapping[key]) {
        const dbField = fieldMapping[key];

        // Handle date fields
        if (dbField === "inspectionDate" && data[key]) {
          updateData[dbField] = new Date(data[key]);
        } else if (
          dbField === "affectedArea" ||
          dbField === "estimatedDryingTime" ||
          dbField === "targetHumidity" ||
          dbField === "targetTemperature" ||
          dbField === "dehumidificationCapacity"
        ) {
          updateData[dbField] = data[key] ? parseFloat(data[key]) : null;
        } else if (dbField === "airmoversCount") {
          updateData[dbField] = data[key] ? parseInt(data[key]) : null;
        } else if (dbField === "hvacAffected") {
          updateData[dbField] = Boolean(data[key]);
        } else {
          updateData[dbField] = data[key] || null;
        }
      }
    });

    // Update the report
    const updatedReport = await prisma.report.update({
      where: { id, userId: session.user.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: `${section} updated successfully`,
      report: updatedReport,
    });
  } catch (error) {
    return fromException(request, error, { stage: "update-section" });
  }
}
