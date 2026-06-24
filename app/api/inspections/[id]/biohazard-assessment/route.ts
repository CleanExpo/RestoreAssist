/**
 * Biohazard Assessment API — RA-290 (NIR Phase 4)
 *
 * GET  /api/inspections/[id]/biohazard-assessment
 *   Returns the current BiohazardAssessment (or null).
 *
 * POST /api/inspections/[id]/biohazard-assessment
 *   Upserts the record. Stamps Inspection.claimType = BIOHAZARD.
 *
 * DELETE /api/inspections/[id]/biohazard-assessment
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { softDelete } from "@/lib/prisma-helpers";
import { z } from "zod";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError } from "@/lib/api-errors";

function tenancyCode(
  status: 401 | 403 | 404,
): "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  return "NOT_FOUND";
}

// ─── Validation ────────────────────────────────────────────────────────────────

const biohazardSchema = z.object({
  biohazardType: z
    .enum([
      "SEWAGE_CAT3",
      "BLOOD",
      "BODILY_FLUIDS",
      "CRIME_SCENE",
      "UNATTENDED_DEATH",
    ])
    .nullable()
    .optional(),
  contaminationAreaM2: z.number().nonnegative().nullable().optional(),
  atpReadingPre: z.number().nonnegative().nullable().optional(),
  atpReadingPost: z.number().nonnegative().nullable().optional(),
  swmsCompleted: z.boolean().optional(),
  ppeLevel: z.enum(["LEVEL_1", "LEVEL_2", "LEVEL_3"]).nullable().optional(),
  wasteDisposalManifestId: z.string().nullable().optional(),
  disposalFacilityLicense: z.string().nullable().optional(),
  disposalCertificateUrl: z.string().url().nullable().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
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

  // RA-1711 batch 2 — adopt shared tenancy helper. Adds workspace-member
  // path so workspace techs (not just owners) can read; admin bypass for
  // legitimate auditor access.
  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return apiError(req, {
      code: tenancyCode(tenancy.status),
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id },
    select: { biohazardAssessment: true },
  });

  return NextResponse.json(inspection?.biohazardAssessment ?? null);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

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

  const tenancy = await resolveInspectionWrite(session, id);
  if (!tenancy.ok) {
    return apiError(req, {
      code: tenancyCode(tenancy.status),
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  const body = await req.json();
  const parsed = biohazardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const record = await prisma.biohazardAssessment.upsert({
    where: { inspectionId: id },
    create: {
      inspectionId: id,
      biohazardType: data.biohazardType ?? undefined,
      contaminationAreaM2: data.contaminationAreaM2 ?? undefined,
      atpReadingPre: data.atpReadingPre ?? undefined,
      atpReadingPost: data.atpReadingPost ?? undefined,
      swmsCompleted: data.swmsCompleted ?? false,
      ppeLevel: data.ppeLevel ?? undefined,
      wasteDisposalManifestId: data.wasteDisposalManifestId ?? undefined,
      disposalFacilityLicense: data.disposalFacilityLicense ?? undefined,
      disposalCertificateUrl: data.disposalCertificateUrl ?? undefined,
    },
    update: {
      ...(data.biohazardType !== undefined && {
        biohazardType: data.biohazardType,
      }),
      ...(data.contaminationAreaM2 !== undefined && {
        contaminationAreaM2: data.contaminationAreaM2,
      }),
      ...(data.atpReadingPre !== undefined && {
        atpReadingPre: data.atpReadingPre,
      }),
      ...(data.atpReadingPost !== undefined && {
        atpReadingPost: data.atpReadingPost,
      }),
      ...(data.swmsCompleted !== undefined && {
        swmsCompleted: data.swmsCompleted,
      }),
      ...(data.ppeLevel !== undefined && { ppeLevel: data.ppeLevel }),
      ...(data.wasteDisposalManifestId !== undefined && {
        wasteDisposalManifestId: data.wasteDisposalManifestId,
      }),
      ...(data.disposalFacilityLicense !== undefined && {
        disposalFacilityLicense: data.disposalFacilityLicense,
      }),
      ...(data.disposalCertificateUrl !== undefined && {
        disposalCertificateUrl: data.disposalCertificateUrl,
      }),
    },
  });

  await prisma.inspection.update({
    where: tenancy.data.inspectionWhere,
    data: { claimType: "BIOHAZARD" },
  });

  return NextResponse.json(record);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
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

  const tenancy = await resolveInspectionWrite(session, id);
  if (!tenancy.ok) {
    return apiError(req, {
      code: tenancyCode(tenancy.status),
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  await softDelete(
    () =>
      prisma.biohazardAssessment.delete({
        where: {
          inspectionId: id,
          ...(tenancy.data.childInspectionFilter && {
            inspection: tenancy.data.childInspectionFilter,
          }),
        },
      }),
    {
      route: "/api/inspections/[id]/biohazard-assessment",
      stage: "delete",
      inspectionId: id,
    },
  );

  await prisma.inspection.update({
    where: tenancy.data.inspectionWhere,
    data: { claimType: null },
  });

  return NextResponse.json({ deleted: true });
}
