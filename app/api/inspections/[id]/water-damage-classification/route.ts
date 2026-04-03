/**
 * Water Damage Classification API — RA-261 Phase 1
 *
 * GET  /api/inspections/[id]/water-damage-classification
 *   Returns the current classification record and computed gate states.
 *
 * POST /api/inspections/[id]/water-damage-classification
 *   Creates or upserts the classification record. Recomputes gate states.
 *   Also stamps Inspection.claimType = WATER on creation.
 *
 * DELETE /api/inspections/[id]/water-damage-classification
 *   Removes the record (used when claim type changes).
 *
 * Gate logic:
 *   gateClassificationComplete = waterCategory + damageClass both set
 *   gateLossSourceComplete      = lossSourceType set AND lossSourceIdentified AND lossSourceAddressed
 *   gatePhotosAttached          = inspection has ≥3 photos (checked via InspectionPhoto count)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// ─── Validation ────────────────────────────────────────────────────────────────

const classificationSchema = z.object({
  waterCategory: z.enum(['CAT_1', 'CAT_2', 'CAT_3']).nullable().optional(),
  damageClass: z.enum(['CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4']).nullable().optional(),
  lossSourceType: z
    .enum(['PLUMBING', 'ROOF', 'APPLIANCE', 'FLOOD', 'GROUNDWATER', 'CONDENSATION', 'HVAC', 'UNKNOWN'])
    .nullable()
    .optional(),
  lossSourceIdentified: z.boolean().optional(),
  lossSourceAddressed: z.boolean().optional(),
  hoursOfExposure: z.number().positive().nullable().optional(),
})

// ─── Gate computation ──────────────────────────────────────────────────────────

function computeGates(
  data: z.infer<typeof classificationSchema>,
  photoCount: number,
) {
  return {
    gateClassificationComplete: !!(data.waterCategory && data.damageClass),
    gateLossSourceComplete: !!(
      data.lossSourceType &&
      data.lossSourceIdentified === true &&
      data.lossSourceAddressed === true
    ),
    gatePhotosAttached: photoCount >= 3,
  }
}

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
    select: { id: true, waterDamageClassification: true },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  return NextResponse.json(inspection.waterDamageClassification ?? null)
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
    select: {
      id: true,
      _count: { select: { photos: true } },
    },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = classificationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data
  const gates = computeGates(data, inspection._count.photos)

  const record = await prisma.waterDamageClassification.upsert({
    where: { inspectionId: params.id },
    create: {
      inspectionId: params.id,
      waterCategory: data.waterCategory ?? undefined,
      damageClass: data.damageClass ?? undefined,
      lossSourceType: data.lossSourceType ?? undefined,
      lossSourceIdentified: data.lossSourceIdentified ?? false,
      lossSourceAddressed: data.lossSourceAddressed ?? false,
      hoursOfExposure: data.hoursOfExposure ?? undefined,
      ...gates,
    },
    update: {
      ...(data.waterCategory !== undefined && { waterCategory: data.waterCategory }),
      ...(data.damageClass !== undefined && { damageClass: data.damageClass }),
      ...(data.lossSourceType !== undefined && { lossSourceType: data.lossSourceType }),
      ...(data.lossSourceIdentified !== undefined && {
        lossSourceIdentified: data.lossSourceIdentified,
      }),
      ...(data.lossSourceAddressed !== undefined && {
        lossSourceAddressed: data.lossSourceAddressed,
      }),
      ...(data.hoursOfExposure !== undefined && { hoursOfExposure: data.hoursOfExposure }),
      ...gates,
    },
  })

  // Stamp Inspection.claimType = WATER on first create
  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: 'WATER' },
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

  await prisma.waterDamageClassification
    .delete({ where: { inspectionId: params.id } })
    .catch(() => {}) // idempotent — ignore if already deleted

  // Clear claim type on inspection
  await prisma.inspection.update({
    where: { id: params.id },
    data: { claimType: null },
  })

  return NextResponse.json({ deleted: true })
}
