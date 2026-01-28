import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if invoice exists and belongs to user
    const invoice = await prisma.invoice.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Can't record payment for draft or cancelled invoices
    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Cannot record payment for draft or cancelled invoices' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { amount, paymentMethod, reference, notes, paymentDate } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method is required' },
        { status: 400 }
      )
    }

    // Check if payment amount exceeds amount due
    if (amount > invoice.amountDue) {
      return NextResponse.json(
        { error: 'Payment amount exceeds amount due' },
        { status: 400 }
      )
    }

    // Create payment and update invoice in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment
      const payment = await tx.invoicePayment.create({
        data: {
          amount,
          paymentMethod,
          reference,
          notes,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          invoiceId: params.id,
          userId: session.user.id,
          reconciled: false
        }
      })

      // Create payment allocation
      await tx.invoicePaymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: params.id,
          allocatedAmount: amount
        }
      })

      // Update invoice amounts
      const newAmountPaid = invoice.amountPaid + amount
      const newAmountDue = invoice.totalIncGST - newAmountPaid

      // Determine new status
      let newStatus = invoice.status
      if (newAmountDue === 0) {
        newStatus = 'PAID'
      } else if (newAmountPaid > 0 && newAmountDue > 0) {
        newStatus = 'PARTIALLY_PAID'
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: params.id },
        data: {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          status: newStatus,
          paidDate: newAmountDue === 0 ? new Date() : invoice.paidDate
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: {
            orderBy: { paymentDate: 'desc' }
          }
        }
      })

      // Create audit log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: params.id,
          userId: session.user.id,
          action: 'payment_received',
          description: `Payment of $${(amount / 100).toFixed(2)} received via ${paymentMethod}`,
          metadata: {
            paymentId: payment.id,
            amount,
            paymentMethod,
            reference
          }
        }
      })

      return { payment, invoice: updatedInvoice }
    })

    return NextResponse.json({
      payment: result.payment,
      invoice: result.invoice,
      message: 'Payment recorded successfully'
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error recording payment:', error)
    return NextResponse.json(
      { error: 'Failed to record payment' },
      { status: 500 }
    )
  }
}
