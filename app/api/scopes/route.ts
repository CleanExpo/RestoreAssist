import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseEquipmentParameters,
  parseSiteVariables,
  serializeEquipmentParameters,
  serializeSiteVariables,
} from "@/lib/scope-json-helpers";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 20,
    prefix: "scopes",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: scope creation is a record-of-truth document — duplicates
  // undermine the scope/cost audit trail.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const {
        reportId,
        scopeType,
        siteVariables,
        labourParameters,
        equipmentParameters,
        chemicalApplication,
        timeCalculations,
        summary,
        complianceNotes,
        assumptions,
      } = body;

      // Validate required fields
      if (!reportId || !scopeType) {
        return NextResponse.json(
          { error: "Missing required fields: reportId, scopeType" },
          { status: 400 },
        );
      }

      // Verify prisma.scope exists
      if (!prisma || typeof prisma.scope === "undefined") {
        console.error(
          "Prisma Scope model not available. Please run: npx prisma generate",
        );
        return NextResponse.json(
          { error: "Database models not initialized. Please contact support." },
          { status: 500 },
        );
      }

      // Check if scope already exists - using findFirst for better compatibility
      const existingScope = await prisma.scope.findFirst({
        where: { reportId },
      });

      const scopeData = {
        reportId,
        scopeType,
        // RA-1366 — emit _v:1 on every write so readers know the shape.
        siteVariables: serializeSiteVariables(siteVariables),
        labourParameters: labourParameters
          ? JSON.stringify(labourParameters)
          : null,
        equipmentParameters: serializeEquipmentParameters(equipmentParameters),
        chemicalApplication: chemicalApplication
          ? JSON.stringify(chemicalApplication)
          : null,
        timeCalculations: timeCalculations
          ? JSON.stringify(timeCalculations)
          : null,
        labourCostTotal: summary?.labourCostTotal || 0,
        equipmentCostTotal: summary?.equipmentCostTotal || 0,
        chemicalCostTotal: summary?.chemicalCostTotal || 0,
        totalDuration: summary?.totalDuration || 0,
        complianceNotes: complianceNotes || null,
        assumptions: assumptions || null,
        createdBy: userId,
        updatedBy: userId,
        userId: userId,
      };

      let scope;
      if (existingScope) {
        // Update existing scope
        scope = await prisma.scope.update({
          where: { id: existingScope.id },
          data: scopeData,
        });
      } else {
        // Create new scope
        scope = await prisma.scope.create({
          data: scopeData,
        });
      }

      return NextResponse.json({
        id: scope.id,
        reportId: scope.reportId,
        scopeType: scope.scopeType,
        siteVariables: parseSiteVariables(scope.siteVariables),
        labourParameters: scope.labourParameters
          ? JSON.parse(scope.labourParameters)
          : null,
        equipmentParameters: parseEquipmentParameters(scope.equipmentParameters),
        chemicalApplication: scope.chemicalApplication
          ? JSON.parse(scope.chemicalApplication)
          : null,
        timeCalculations: scope.timeCalculations
          ? JSON.parse(scope.timeCalculations)
          : null,
        labourCostTotal: scope.labourCostTotal,
        equipmentCostTotal: scope.equipmentCostTotal,
        chemicalCostTotal: scope.chemicalCostTotal,
        totalDuration: scope.totalDuration,
        complianceNotes: scope.complianceNotes,
        assumptions: scope.assumptions,
      });
    } catch (error: any) {
      console.error("Error saving scope:", error);

      // Provide more detailed error messages
      if (error?.code === "P2002") {
        return NextResponse.json(
          { error: "A scope already exists for this report" },
          { status: 409 },
        );
      }

      if (error?.code === "P2003") {
        return NextResponse.json(
          { error: "Invalid report ID. Report does not exist." },
          { status: 400 },
        );
      }

      if (
        error?.message?.includes("prisma.scope") ||
        error?.message?.includes("undefined")
      ) {
        return NextResponse.json(
          {
            error:
              "Database models not initialized. Please restart the development server after running 'npx prisma generate'.",
            details:
              "Prisma Scope model not found. This usually happens when Prisma Client needs to be regenerated.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to save scope",
          details:
            process.env.NODE_ENV === "development" ? error?.message : undefined,
        },
        { status: 500 },
      );
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get("reportId");

    if (reportId) {
      // Verify prisma.scope exists
      if (!prisma || typeof prisma.scope === "undefined") {
        console.error("Prisma Scope model not available");
        return NextResponse.json(
          { error: "Database models not initialized" },
          { status: 500 },
        );
      }

      // Get scope for specific report
      const scope = await prisma.scope.findFirst({
        where: { reportId },
      });

      if (!scope) {
        return NextResponse.json({ error: "Scope not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: scope.id,
        reportId: scope.reportId,
        scopeType: scope.scopeType,
        siteVariables: parseSiteVariables(scope.siteVariables),
        labourParameters: scope.labourParameters
          ? JSON.parse(scope.labourParameters)
          : null,
        equipmentParameters: parseEquipmentParameters(scope.equipmentParameters),
        chemicalApplication: scope.chemicalApplication
          ? JSON.parse(scope.chemicalApplication)
          : null,
        timeCalculations: scope.timeCalculations
          ? JSON.parse(scope.timeCalculations)
          : null,
        labourCostTotal: scope.labourCostTotal,
        equipmentCostTotal: scope.equipmentCostTotal,
        chemicalCostTotal: scope.chemicalCostTotal,
        totalDuration: scope.totalDuration,
        complianceNotes: scope.complianceNotes,
        assumptions: scope.assumptions,
      });
    }

    // Get all scopes for user
    const scopes = await prisma.scope.findMany({
      where: { userId: session.user.id },
      include: {
        report: {
          select: {
            id: true,
            title: true,
            clientName: true,
            propertyAddress: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      scopes.map((scope: (typeof scopes)[number]) => ({
        id: scope.id,
        reportId: scope.reportId,
        scopeType: scope.scopeType,
        siteVariables: parseSiteVariables(scope.siteVariables),
        labourParameters: scope.labourParameters
          ? JSON.parse(scope.labourParameters)
          : null,
        equipmentParameters: parseEquipmentParameters(scope.equipmentParameters),
        chemicalApplication: scope.chemicalApplication
          ? JSON.parse(scope.chemicalApplication)
          : null,
        timeCalculations: scope.timeCalculations
          ? JSON.parse(scope.timeCalculations)
          : null,
        labourCostTotal: scope.labourCostTotal,
        equipmentCostTotal: scope.equipmentCostTotal,
        chemicalCostTotal: scope.chemicalCostTotal,
        totalDuration: scope.totalDuration,
        complianceNotes: scope.complianceNotes,
        assumptions: scope.assumptions,
        report: scope.report,
      })),
    );
  } catch (error: any) {
    console.error("Error fetching scopes:", error);

    if (
      error?.message?.includes("prisma.scope") ||
      error?.message?.includes("undefined")
    ) {
      return NextResponse.json(
        {
          error:
            "Database models not initialized. Please restart the development server after running 'npx prisma generate'.",
          details: "Prisma Scope model not found.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to fetch scopes",
        details:
          process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 },
    );
  }
}
