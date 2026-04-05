/**
 * HVAC Assessment API — RA-290 (NIR Phase 5)
 *
 * GET  /api/inspections/[id]/hvac-assessment
 *   Returns the current HVACAssessment (or null).
 *
 * POST /api/inspections/[id]/hvac-assessment
 *   Upserts the record. Stamps Inspection.claimType = HVAC.
 *
 * DELETE /api/inspections/[id]/hvac-assessment
 *   Removes the record (idempotent).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ─── Validation ────────────────────────────────────────────────────────────────

const hvacSchema = z.object({
  hvacSystemInspected: z.boolean().optional(),
  ductContaminationLevel: z
    .enum(['NONE', 'LIGHT', 'MODERATE', 'HEAVY'])
    .nullable()
    .optional(),
  visibleSootInDucts: z.boolean().optional(),
  smokeOdourInDucts: z.boolean().optional(),
  filterCondition: z.string().nullable().optional(),
  coilContaminationLevel: z
    .enum(['NONE', 'LIGHT', 'MODERATE', 'HEAVY'])
    .nullable()
    .optional(),
  hvacCleaningRequired: z.boolean().optional(),
  insulationResistanceMegaohm: z.number().nonnegative().nullable().optional(),
  insulationTestPerformedBy: z.string().nullable().optional(),
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
    select: { id: true, hvacAssessment: true },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  return NextResponse.json(inspection.hvacAssessment ?? null)
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
  const parsed = hvacSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data

  const record = await prisma.hVACAssessment.upsert({
    where: { inspectionId: params.id },
    create: {
      inspectionId: params.id,
      hvacSystemInspected: data.hvacSystemInspected ?? false,
      ductContaminationLevel: data.ductContaminationLevel ?? undefined,
      visibleSootInDucts: data.visibleSootInDucts ?? false,
      smokeOdourInDucts: data.smokeOdourInDucts ?? false,
      filterCondition: data.filterCondition ?? undefined,
      coilContaminationLevel: data.coilContaminationLevel ?? undefined,
      hvacCleaningRequired: data.hvacCleaningRequired ?? false,
      insulationResistanceMegaohm: data.insulationResistanceMegaohm ?? undefined,
      insulationTestPerformedBy: data.insulationTestPerformedBy ?? undefined,
    },
    update: {
      ...(data.hvacSystemInspected !== undefined && {
        hvacSystemInspected: data.hvacSystemInspected,
      }),
      ...(data.ductContaminationLevel !== undefined && {
        ductContaminationLevel: data.ductContaminationLevel,
      }),
      ...(data.visibleSootInDucts !== undefined && { visibleSootInDucts: data.visibleSootInDucts }),
      ...(data.smokeOdourInDucts !== undefined && { smokeOdourInDucts: data.smokeOdourInDucts }),
      ...(data.filterCondition !== undefined && { filterCondition: data.filterCondition }),
      ...(data.coilContaminationLevel !== undefined && {
        coilContaminationLevel: data.coilContaminationLevel,
      }),
      ...(data.hvacCleaningRequired !== undefined && {
        hvacCleaningRequired: data.hvacCleaningRequired,
      }),
      ...(data.insulationResistanceMegaohm !== undefined && {
        insulationResistanceMegaohm: data.insulationResistanceMegaohm,
      }),
      ...(data.insulationTestPerformedBy !== undefined && {
        insulationTestPerformedBy: data.insulationTestPerformedBy,
      }),
    },
  })

  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: 'HVAC' },
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

  await prisma.hVACAssessment
    .delete({ where: { inspectionId: params.id } })
    .catch(() => {})

  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: null },
  })

  return NextResponse.json({ deleted: true })
}
