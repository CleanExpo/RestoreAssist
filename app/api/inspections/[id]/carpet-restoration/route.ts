/**
 * Carpet Restoration Assessment API — RA-290 (NIR Phase 4)
 *
 * GET  /api/inspections/[id]/carpet-restoration
 *   Returns the current CarpetRestorationAssessment (or null).
 *
 * POST /api/inspections/[id]/carpet-restoration
 *   Upserts the record. Stamps Inspection.claimType = CARPET.
 *
 * DELETE /api/inspections/[id]/carpet-restoration
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ─── Validation ────────────────────────────────────────────────────────────────

const carpetSchema = z.object({
  fiberType: z
    .enum(['WOOL', 'NYLON', 'POLYESTER', 'POLYPROPYLENE', 'OTHER'])
    .nullable()
    .optional(),
  pileType: z.enum(['CUT', 'LOOP', 'CUT_LOOP', 'FRIEZE']).nullable().optional(),
  backingType: z.string().nullable().optional(),
  standingWaterHours: z.number().nonnegative().nullable().optional(),
  extractionRateLitresPerHour: z.number().positive().nullable().optional(),
  extractionPasses: z.number().int().positive().nullable().optional(),
  residualMoisturePostExtraction: z.number().min(0).max(100).nullable().optional(),
  delaminationTestResult: z.string().nullable().optional(),
  finalMoisturePercent: z.number().min(0).max(100).nullable().optional(),
  stainType: z.string().nullable().optional(),
  stainPH: z.number().min(0).max(14).nullable().optional(),
  stainTreatmentProduct: z.string().nullable().optional(),
  stainRemovalResult: z
    .enum(['COMPLETE', 'PARTIAL', 'UNSUCCESSFUL'])
    .nullable()
    .optional(),
  restorationDecision: z.string().nullable().optional(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, carpetRestorationAssessment: true },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  return NextResponse.json(inspection.carpetRestorationAssessment ?? null)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = carpetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data

  const record = await prisma.carpetRestorationAssessment.upsert({
    where: { inspectionId: params.id },
    create: {
      inspectionId: params.id,
      fiberType: data.fiberType ?? undefined,
      pileType: data.pileType ?? undefined,
      backingType: data.backingType ?? undefined,
      standingWaterHours: data.standingWaterHours ?? undefined,
      extractionRateLitresPerHour: data.extractionRateLitresPerHour ?? undefined,
      extractionPasses: data.extractionPasses ?? undefined,
      residualMoisturePostExtraction: data.residualMoisturePostExtraction ?? undefined,
      delaminationTestResult: data.delaminationTestResult ?? undefined,
      finalMoisturePercent: data.finalMoisturePercent ?? undefined,
      stainType: data.stainType ?? undefined,
      stainPH: data.stainPH ?? undefined,
      stainTreatmentProduct: data.stainTreatmentProduct ?? undefined,
      stainRemovalResult: data.stainRemovalResult ?? undefined,
      restorationDecision: data.restorationDecision ?? undefined,
    },
    update: {
      ...(data.fiberType !== undefined && { fiberType: data.fiberType }),
      ...(data.pileType !== undefined && { pileType: data.pileType }),
      ...(data.backingType !== undefined && { backingType: data.backingType }),
      ...(data.standingWaterHours !== undefined && { standingWaterHours: data.standingWaterHours }),
      ...(data.extractionRateLitresPerHour !== undefined && {
        extractionRateLitresPerHour: data.extractionRateLitresPerHour,
      }),
      ...(data.extractionPasses !== undefined && { extractionPasses: data.extractionPasses }),
      ...(data.residualMoisturePostExtraction !== undefined && {
        residualMoisturePostExtraction: data.residualMoisturePostExtraction,
      }),
      ...(data.delaminationTestResult !== undefined && {
        delaminationTestResult: data.delaminationTestResult,
      }),
      ...(data.finalMoisturePercent !== undefined && {
        finalMoisturePercent: data.finalMoisturePercent,
      }),
      ...(data.stainType !== undefined && { stainType: data.stainType }),
      ...(data.stainPH !== undefined && { stainPH: data.stainPH }),
      ...(data.stainTreatmentProduct !== undefined && {
        stainTreatmentProduct: data.stainTreatmentProduct,
      }),
      ...(data.stainRemovalResult !== undefined && { stainRemovalResult: data.stainRemovalResult }),
      ...(data.restorationDecision !== undefined && { restorationDecision: data.restorationDecision }),
    },
  })

  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: 'CARPET' },
  })

  return NextResponse.json(record)
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  await prisma.carpetRestorationAssessment
    .delete({ where: { inspectionId: params.id } })
    .catch(() => {})

  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: null },
  })

  return NextResponse.json({ deleted: true })
}
