import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertAutomationV1Auth } from "@/lib/automation/v1-auth";

/**
 * GET /api/automation/v1/inspections
 * Poll-friendly job list for Zapier custom integrations (W4-4).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await assertAutomationV1Auth(request, session);
    if (!auth.ok) {
      return apiError(request, {
        code: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        message: auth.reason,
        status: auth.status,
      });
    }

    const since = request.nextUrl.searchParams.get("since");
    const sinceDate = since ? new Date(since) : null;

    const inspections = await prisma.inspection.findMany({
      where: {
        user: { organizationId: auth.organizationId },
        ...(sinceDate && !Number.isNaN(sinceDate.getTime())
          ? { updatedAt: { gte: sinceDate } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        inspectionNumber: true,
        status: true,
        claimType: true,
        propertyAddress: true,
        updatedAt: true,
        clientId: true,
      },
    });

    return NextResponse.json({
      schemaVersion: "1.0",
      data: inspections.map((row) => ({
        id: row.id,
        jobNumber: row.inspectionNumber,
        status: row.status,
        claimType: row.claimType,
        address: row.propertyAddress,
        clientId: row.clientId,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return fromException(request, error, { stage: "automation-v1-inspections" });
  }
}