import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import {
  parseEquipmentParameters,
  parseSiteVariables,
  serializeEquipmentParameters,
  serializeSiteVariables,
} from "@/lib/scope-json-helpers";

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
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        body =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
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
        return apiError(request, {
          code: "VALIDATION",
          message: "Missing required fields: reportId, scopeType",
          status: 400,
        });
      }

      // Verify prisma.scope exists
      if (!prisma || typeof prisma.scope === "undefined") {
        return apiError(request, {
          code: "INTERNAL",
          message: "Database models not initialized. Please contact support.",
          status: 500,
          context: { reason: "prisma.scope model unavailable" },
        });
      }

      // RA-6800: authorization — the caller must own the target report before
      // any scope is created or overwritten. Without this, any authenticated
      // user could upsert a scope onto another tenant's report (IDOR). 404
      // (not 403) so report IDs cannot be enumerated across tenants.
      const ownedReport = await prisma.report.findFirst({
        where: { id: reportId, userId },
        select: { id: true },
      });
      if (!ownedReport) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
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
          where: { id: existingScope.id, report: { userId } },
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
        equipmentParameters: parseEquipmentParameters(
          scope.equipmentParameters,
        ),
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
      // Provide more detailed error messages
      if (error?.code === "P2002") {
        return apiError(request, {
          code: "CONFLICT",
          message: "A scope already exists for this report",
          status: 409,
        });
      }

      if (error?.code === "P2003") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid report ID. Report does not exist.",
          status: 400,
        });
      }

      console.error("Error saving scope:", error);

      // RA-1548 — the two 500s below carry a `details` sibling field, so they
      // are left on raw NextResponse (envelope has no slot for it).
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

      return fromException(request, error, { stage: "save" });
    }
  });
}

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
    const reportId = searchParams.get("reportId");

    if (reportId) {
      // Verify prisma.scope exists
      if (!prisma || typeof prisma.scope === "undefined") {
        return apiError(request, {
          code: "INTERNAL",
          message: "Database models not initialized",
          status: 500,
          context: { reason: "prisma.scope model unavailable" },
        });
      }

      // Get scope for specific report. RA-6800: scope the lookup to reports the
      // caller owns so a scope cannot be read across tenants by report ID. A
      // non-owned (or non-existent) report yields null -> 404, which also avoids
      // leaking whether the report exists.
      const scope = await prisma.scope.findFirst({
        where: { reportId, report: { userId: session.user.id } },
      });

      if (!scope) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Scope not found",
          status: 404,
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
        equipmentParameters: parseEquipmentParameters(
          scope.equipmentParameters,
        ),
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
    // RA-1376: bounded list query (CLAUDE.md rule 4).
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
      take: 50,
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
        equipmentParameters: parseEquipmentParameters(
          scope.equipmentParameters,
        ),
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

    return fromException(request, error, { stage: "list" });
  }
}
