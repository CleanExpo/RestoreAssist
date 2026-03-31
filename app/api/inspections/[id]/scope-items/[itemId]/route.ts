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
  const updated = await prisma.scopeItem.update({
    where: { id: itemId },
    data: {
      ...(body.description !== undefined && { description: body.description }),
      ...(body.quantity !== undefined && { quantity: body.quantity !== null ? Number(body.quantity) : null }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.isSelected !== undefined && { isSelected: body.isSelected }),
      ...(body.justification !== undefined && { justification: body.justification }),
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

  await prisma.scopeItem.delete({ where: { id: itemId } })
  return NextResponse.json({ success: true })
}
