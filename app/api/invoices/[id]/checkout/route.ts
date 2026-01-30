import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { isDraft, isCancelled } from '@/lib/invoice-status'

const APP_URL = process.env.NEXTAUTH_URL || 'https://restoreassist.com.au'

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
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Can't create checkout for draft or fully paid invoices
    if (isDraft(invoice.status)) {
      return NextResponse.json(
        { error: 'Cannot create checkout for draft invoices. Please send the invoice first.' },
        { status: 400 }
      )
    }

    if (invoice.status === 'PAID' || invoice.amountDue <= 0) {
      return NextResponse.json(
        { error: 'This invoice has already been paid' },
        { status: 400 }
      )
    }

    if (isCancelled(invoice.status)) {
      return NextResponse.json(
        { error: 'Cannot create checkout for cancelled invoices' },
        { status: 400 }
      )
    }

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: invoice.customerEmail,
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: invoice.amountDue, // Already in cents
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              description: `Payment for invoice ${invoice.invoiceNumber} - ${invoice.customerName}`,
              metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber
              }
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        type: 'invoice',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: session.user.id
      },
      success_url: `${APP_URL}/dashboard/invoices/${invoice.id}?payment=success`,
      cancel_url: `${APP_URL}/dashboard/invoices/${invoice.id}?payment=cancelled`,
      payment_intent_data: {
        metadata: {
          type: 'invoice',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          userId: session.user.id
        }
      }
    })

    // Create audit log
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        userId: session.user.id,
        action: 'checkout_created',
        description: `Stripe checkout session created for online payment`,
        metadata: {
          sessionId: checkoutSession.id,
          amount: invoice.amountDue
        }
      }
    })

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url
    })
  } catch (error: any) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
