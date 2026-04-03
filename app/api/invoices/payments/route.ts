import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const method = searchParams.get('method')
  const reconciled = searchParams.get('reconciled')

  try {
    const where: any = {
      invoice: { userId: session.user.id },
    }
    if (from) where.paymentDate = { ...(where.paymentDate || {}), gte: new Date(from) }
    if (to) where.paymentDate = { ...(where.paymentDate || {}), lte: new Date(to) }
    if (method) where.paymentMethod = method
    if (reconciled === 'true') where.reconciled = true
    if (reconciled === 'false') where.reconciled = false

    const payments = await prisma.invoicePayment.findMany({
      where,
      include: {
        invoice: { select: { invoiceNumber: true, id: true, client: { select: { name: true } } } },
      },
      orderBy: { paymentDate: 'desc' },
      take: 200,
    })
    return NextResponse.json({ payments })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { id, reconciled } = body

    if (!id) return NextResponse.json({ error: 'Payment ID required' }, { status: 400 })

    // Verify ownership via invoice relation
    const existing = await prisma.invoicePayment.findFirst({
      where: {
        id,
        invoice: { userId: session.user.id },
      },
    })

    if (!existing) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    const updated = await prisma.invoicePayment.update({
      where: { id },
      data: {
        reconciled: reconciled ?? true,
        reconciledAt: reconciled !== false ? new Date() : null,
        reconciledBy: reconciled !== false ? session.user.id : null,
      },
    })

    return NextResponse.json({ payment: updated })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}
