/**
 * POST /api/inspections/[id]/sketches/pdf — RA2-051 (RA-121)
 *
 * Generates a standalone A4-landscape floor plan PDF from canvas PNG exports.
 *
 * Body: {
 *   floors: Array<{ label: string, pngDataUrl: string, fabricJson?: object }>,
 *   propertyAddress?: string,
 *   reportNumber?: string,
 * }
 *
 * Returns: application/pdf stream
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSketchPdf, type SketchFloor } from "@/lib/generate-sketch-pdf";
import { serverAuthoritativeFloors } from "@/lib/sketch/measured-sketch-data";
import type { DamageCause } from "@/lib/nz/nhcover";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id } = await params;

  // RA-1711 batch 4 — adopt shared tenancy helper.
  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return apiError(req, {
      code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
      message: tenancy.reason ?? "Forbidden",
      status: tenancy.status,
    });
  }

  // RA-1548: single top-level guard so the unguarded prisma reads + PDF
  // generation below can never escape as a bare 500 — every failure routes
  // through the standard envelope.
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      // RA-6851 [A8]: pull the OWNER's business identity (via Inspection.userId)
      // so the sketch header is white-labelled tenant-safely — never a global
      // default or another workspace's branding.
      select: {
        id: true,
        propertyAddress: true,
        user: {
          select: { businessName: true, businessLogo: true },
        },
      },
    });
    if (!inspection) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    let body: {
      floors: SketchFloor[];
      propertyAddress?: string;
      reportNumber?: string;
      nhCause?: DamageCause;
      estimatedRepairNzd?: number;
    };

    try {
      body = await req.json();
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    if (!Array.isArray(body.floors) || body.floors.length === 0) {
      return apiError(req, {
        code: "VALIDATION",
        message: "floors[] must be a non-empty array",
        status: 400,
      });
    }

    // Validate each floor has required fields
    for (const floor of body.floors) {
      if (!floor.label || typeof floor.label !== "string") {
        return apiError(req, {
          code: "VALIDATION",
          message: "Each floor must have a label",
          status: 400,
        });
      }
      if (!floor.pngDataUrl || !floor.pngDataUrl.startsWith("data:image/png")) {
        return apiError(req, {
          code: "VALIDATION",
          message: "Each floor must have a valid pngDataUrl",
          status: 400,
        });
      }
    }

    // ANZ materials library for the compliance annex (spec §11).
    // ra-query-ok: Material is a seed-only reference catalogue (no tenant write
    // path); the full list is required for the compliance annex.
    const materials = await (prisma as any).material.findMany({
      select: { slug: true, name: true, isPotentialAcm: true },
    });

    // Moisture pins across floors for the S500 drying log (spec §5.2).
    const sketchRows = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      select: {
        floorLabel: true,
        sketchData: true,
        moisturePoints: true,
        country: true,
      },
      take: 100,
    });
    const moisturePins = sketchRows.flatMap((s: { moisturePoints: unknown }) =>
      Array.isArray(s.moisturePoints) ? s.moisturePoints : [],
    ) as Array<{ wme: number; material: string; note?: string }>;
    // NZ pathway if any floor's sketch is tagged NZ (spec §5.5).
    const country: "AU" | "NZ" = sketchRows.some(
      (s: { country?: string }) => s.country === "NZ",
    )
      ? "NZ"
      : "AU";

    const pdfBytes = await generateSketchPdf({
      // RA-6761: server-authoritative geometry — room areas + compliance annex
      // come from the saved ClaimSketch (measured-only), not client fabricJson.
      floors: serverAuthoritativeFloors(body.floors, sketchRows),
      propertyAddress: body.propertyAddress ?? inspection.propertyAddress ?? "",
      reportNumber: body.reportNumber ?? id.slice(-8).toUpperCase(),
      materials,
      moisturePins,
      country,
      nhCause: body.nhCause,
      estimatedRepairNzd: body.estimatedRepairNzd,
      branding: {
        businessName: inspection.user?.businessName,
        businessLogo: inspection.user?.businessLogo,
      },
    });

    const fileName = `floor-plan-${id.slice(-8)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fromException(req, err, { stage: "sketches:pdf" });
  }
}
