import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, itemId } = await params

  // Verify inspection ownership
  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id }
  })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  // Update only provided fields
  // Scope update to this inspection — prevents cross-inspection IDOR
  const item = await prisma.scopeItem.findFirst({ where: { id: itemId, inspectionId: id }, select: { id: true } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.quantity !== undefined && body.quantity !== null) {
    const qty = Number(body.quantity)
    if (!isFinite(qty) || qty < 0 || qty > 100_000) {
      return NextResponse.json({ error: "quantity must be a non-negative finite number up to 100,000" }, { status: 400 })
    }
  }

  const updated = await prisma.scopeItem.update({
    where: { id: itemId },
    data: {
      ...(body.description !== undefined && { description: String(body.description).slice(0, 2000) }),
      ...(body.quantity !== undefined && { quantity: body.quantity !== null ? Number(body.quantity) : null }),
      ...(body.unit !== undefined && { unit: body.unit ? String(body.unit).slice(0, 50) : null }),
      ...(body.isSelected !== undefined && { isSelected: Boolean(body.isSelected) }),
      ...(body.justification !== undefined && { justification: body.justification ? String(body.justification).slice(0, 2000) : null }),
    }
  })
  return NextResponse.json({ scopeItem: updated })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, itemId } = await params

  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id }
  })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // deleteMany scopes the delete to this inspection — prevents cross-inspection IDOR
  const deleted = await prisma.scopeItem.deleteMany({ where: { id: itemId, inspectionId: id } })
  if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
