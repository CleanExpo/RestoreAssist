/**
 * Australian Compliance Record API — RA-290 (NIR Phase 5)
 *
 * GET  /api/inspections/[id]/australian-compliance
 *   Returns the current AustralianComplianceRecord (or null).
 *
 * POST /api/inspections/[id]/australian-compliance
 *   Upserts the compliance record. Does NOT stamp Inspection.claimType —
 *   the AustralianComplianceRecord is a compliance overlay applicable to any
 *   claim type, not a claim type classifier itself.
 *
 * DELETE /api/inspections/[id]/australian-compliance
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { softDelete } from "@/lib/prisma-helpers";
import { z } from "zod";

// ─── Validation ────────────────────────────────────────────────────────────────

const auComplianceSchema = z.object({
  insurerName: z.string().nullable().optional(),
  claimNumber: z.string().nullable().optional(),
  lossAdjusterName: z.string().nullable().optional(),
  lossAdjusterReference: z.string().nullable().optional(),
  nrpgCategory: z
    .enum(["SMALL", "MEDIUM", "LARGE", "CATASTROPHIC"])
    .nullable()
    .optional(),
  iicrcCertifiedTechnician: z.boolean().optional(),
  technicianCertification: z
    .enum(["WRT", "ASD", "CMS", "HST", "OCT", "CCT", "MRS", "OTHER"])
    .nullable()
    .optional(),
  technicianLicenseNumber: z.string().nullable().optional(),
  state: z
    .enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"])
    .nullable()
    .optional(),
  propertyYearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),
  asbestosRiskAcknowledged: z.boolean().optional(),
  friableAssessment: z.string().nullable().optional(),
  workHalted: z.boolean().optional(),
  licensedAssessorName: z.string().nullable().optional(),
  licensedAssessorLicense: z.string().nullable().optional(),
  removalQuoteAud: z.number().nonnegative().nullable().optional(),
  separateInvoiceRequired: z.boolean().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const record = await (prisma as any).australianComplianceRecord.findUnique({
    where: { inspectionId: id },
  });

  return NextResponse.json(record ?? null);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = auComplianceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Warn if asbestos risk is present in a pre-1990 property but not acknowledged
  const asbestosWarning =
    data.propertyYearBuilt != null &&
    data.propertyYearBuilt < 1990 &&
    data.asbestosRiskAcknowledged !== true
      ? "Property built before 1990 — asbestos-containing materials must be assumed present until tested. Set asbestosRiskAcknowledged: true after review."
      : null;

  const record = await (prisma as any).australianComplianceRecord.upsert({
    where: { inspectionId: id },
    create: {
      inspectionId: id,
      insurerName: data.insurerName ?? undefined,
      claimNumber: data.claimNumber ?? undefined,
      lossAdjusterName: data.lossAdjusterName ?? undefined,
      lossAdjusterReference: data.lossAdjusterReference ?? undefined,
      nrpgCategory: data.nrpgCategory ?? undefined,
      iicrcCertifiedTechnician: data.iicrcCertifiedTechnician ?? false,
      technicianCertification: data.technicianCertification ?? undefined,
      technicianLicenseNumber: data.technicianLicenseNumber ?? undefined,
      state: data.state ?? undefined,
      propertyYearBuilt: data.propertyYearBuilt ?? undefined,
      asbestosRiskAcknowledged: data.asbestosRiskAcknowledged ?? false,
      friableAssessment: data.friableAssessment ?? undefined,
      workHalted: data.workHalted ?? false,
      licensedAssessorName: data.licensedAssessorName ?? undefined,
      licensedAssessorLicense: data.licensedAssessorLicense ?? undefined,
      removalQuoteAud: data.removalQuoteAud ?? undefined,
      separateInvoiceRequired: data.separateInvoiceRequired ?? true,
    },
    update: {
      ...(data.insurerName !== undefined && { insurerName: data.insurerName }),
      ...(data.claimNumber !== undefined && { claimNumber: data.claimNumber }),
      ...(data.lossAdjusterName !== undefined && {
        lossAdjusterName: data.lossAdjusterName,
      }),
      ...(data.lossAdjusterReference !== undefined && {
        lossAdjusterReference: data.lossAdjusterReference,
      }),
      ...(data.nrpgCategory !== undefined && {
        nrpgCategory: data.nrpgCategory,
      }),
      ...(data.iicrcCertifiedTechnician !== undefined && {
        iicrcCertifiedTechnician: data.iicrcCertifiedTechnician,
      }),
      ...(data.technicianCertification !== undefined && {
        technicianCertification: data.technicianCertification,
      }),
      ...(data.technicianLicenseNumber !== undefined && {
        technicianLicenseNumber: data.technicianLicenseNumber,
      }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.propertyYearBuilt !== undefined && {
        propertyYearBuilt: data.propertyYearBuilt,
      }),
      ...(data.asbestosRiskAcknowledged !== undefined && {
        asbestosRiskAcknowledged: data.asbestosRiskAcknowledged,
      }),
      ...(data.friableAssessment !== undefined && {
        friableAssessment: data.friableAssessment,
      }),
      ...(data.workHalted !== undefined && { workHalted: data.workHalted }),
      ...(data.licensedAssessorName !== undefined && {
        licensedAssessorName: data.licensedAssessorName,
      }),
      ...(data.licensedAssessorLicense !== undefined && {
        licensedAssessorLicense: data.licensedAssessorLicense,
      }),
      ...(data.removalQuoteAud !== undefined && {
        removalQuoteAud: data.removalQuoteAud,
      }),
      ...(data.separateInvoiceRequired !== undefined && {
        separateInvoiceRequired: data.separateInvoiceRequired,
      }),
    },
  });

  return NextResponse.json({ ...record, asbestosWarning });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const inspection = await prisma.inspection.findUnique({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  await softDelete(
    () => (prisma as any).australianComplianceRecord.delete({ where: { inspectionId: id } }),
    { route: "/api/inspections/[id]/australian-compliance", stage: "delete", inspectionId: id },
  );

  return NextResponse.json({ deleted: true });
}
