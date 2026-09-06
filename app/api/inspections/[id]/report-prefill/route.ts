/**
 * GET /api/inspections/[id]/report-prefill
 *
 * What a new report form can learn from an inspection the technician has already
 * filled in. Backs the "Generate report" button on the inspections list, which
 * has always passed `?inspectionId=` to /dashboard/reports/new and had it
 * ignored — so the technician retyped the address, postcode, their own name, the
 * attendance date and the water classification into a second copy free to
 * disagree with the first.
 *
 * The mapping itself lives in lib/reports/inspection-prefill.ts and is pure. This
 * route is only auth, ownership and a narrow select: keeping the mapping out of
 * the route is what lets it be tested without a database, and keeps one owner for
 * "inspection -> report fields" rather than one per calling surface.
 *
 * Read-only. It creates nothing and writes nothing — a technician who opens the
 * form and walks away has not started a report.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { buildReportPrefill } from "@/lib/reports/inspection-prefill";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    // Via the shared helper rather than a `userId: session.user.id` where-clause.
    // Direct ownership alone would 404 an active workspace member generating a
    // report from a colleague's inspection, which is the ordinary case on any
    // job with more than one technician. The helper also unifies "not yours"
    // with "does not exist" so ids cannot be enumerated across tenants.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        inspectionNumber: true,
        propertyAddress: true,
        propertyPostcode: true,
        inspectionDate: true,
        technicianName: true,
        lossDescription: true,
        claimType: true,
        propertyYearBuilt: true,
        propertyWallConstruction: true,
        propertyWallMaterial: true,
        waterDamageClassification: {
          select: {
            waterCategory: true,
            damageClass: true,
            lossSourceType: true,
          },
        },
        classifications: {
          // Newest first; buildReportPrefill takes the first FINAL row. Bounded
          // because an inspection reclassified many times must not drag its whole
          // history into a form load.
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { category: true, class: true, isFinal: true },
        },
      },
    });

    if (!inspection) {
      // Only reachable if the row disappears between the tenancy read and this
      // one. Answered the same way as "not yours", per the helper's contract.
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const prefill = buildReportPrefill(inspection);

    return NextResponse.json({
      inspectionNumber: inspection.inspectionNumber,
      fields: prefill.fields,
      filled: prefill.filled,
    });
  } catch (error) {
    return fromException(request, error, { stage: "inspection:report-prefill" });
  }
}
