import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { buildScopeExport } from "@/lib/export/scope-contract";
import { buildScopeNarrative } from "@/lib/export/scope-narrative";
import { serverAuthoritativeFloors } from "@/lib/sketch/measured-sketch-data";
import type { DamageCause } from "@/lib/nz/nhcover";

// POST /api/inspections/[id]/sketches/scope-report
// One call returning both the versioned structured scope and the human
// scope-of-works narrative, built from the same source as the PDF (no drift).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const { id } = await params;

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const body = await request.json();
    if (!Array.isArray(body.floors)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "floors[] is required",
        status: 422,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { propertyAddress: true },
    });
    const materials = await (prisma as any).material.findMany({
      select: { slug: true, name: true, isPotentialAcm: true },
    });
    const sketchRows = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      select: {
        floorLabel: true,
        sketchData: true,
        moisturePoints: true,
        country: true,
      },
    });
    const moisturePins = sketchRows.flatMap((s: { moisturePoints: unknown }) =>
      Array.isArray(s.moisturePoints) ? s.moisturePoints : [],
    ) as Array<{ wme: number; material: string; note?: string }>;
    const country: "AU" | "NZ" = sketchRows.some(
      (s: { country?: string }) => s.country === "NZ",
    )
      ? "NZ"
      : "AU";

    const structured = buildScopeExport({
      // RA-6761: server-authoritative, measured-only geometry for scope.
      floors: serverAuthoritativeFloors(body.floors, sketchRows),
      materials,
      propertyAddress:
        body.propertyAddress ?? inspection?.propertyAddress ?? "",
      reportNumber: body.reportNumber ?? id.slice(-8).toUpperCase(),
      moisturePins,
      country,
      nhCause: body.nhCause as DamageCause | undefined,
      estimatedRepairNzd: body.estimatedRepairNzd,
    });
    const narrative = buildScopeNarrative(structured);

    return NextResponse.json({ structured, narrative });
  } catch (error) {
    return fromException(request, error, { stage: "scope-report" });
  }
}
