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
import { z } from "zod";

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
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, biohazardAssessment: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(inspection.biohazardAssessment ?? null);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
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
    where: { inspectionId: params.id },
    create: {
      inspectionId: params.id,
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
    where: { id: params.id },
    data: { claimType: "BIOHAZARD" },
  });

  return NextResponse.json(record);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  await prisma.biohazardAssessment
    .delete({ where: { inspectionId: params.id } })
    .catch(() => {});

  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: null },
  });

  return NextResponse.json({ deleted: true });
}
