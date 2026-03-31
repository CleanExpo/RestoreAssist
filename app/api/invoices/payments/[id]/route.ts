import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const reconciled = body.reconciled ?? true

    // Verify the payment belongs to this user via the invoice relation
    const existing = await prisma.invoicePayment.findFirst({
      where: {
        id: params.id,
        invoice: { userId: session.user.id },
      },
    })

    if (!existing) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    const updated = await prisma.invoicePayment.update({
      where: { id: params.id },
      data: {
        reconciled,
        reconciledAt: reconciled ? new Date() : null,
        reconciledBy: reconciled ? session.user.id : null,
      },
    })

    return NextResponse.json({ payment: updated })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}
