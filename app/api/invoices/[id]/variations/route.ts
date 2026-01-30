import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/invoices/[id]/variations - Get invoice variations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get original invoice
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get all variations of this invoice
    const variations = await prisma.invoice.findMany({
      where: {
        originalInvoiceId: id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        },
        payments: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    // If this invoice is itself a variation, get the original and all siblings
    let original = null
    let allVariations = variations

    if (invoice.originalInvoiceId) {
      original = await prisma.invoice.findUnique({
        where: {
          id: invoice.originalInvoiceId
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: true
        }
      })

      // Get all variations of the original
      allVariations = await prisma.invoice.findMany({
        where: {
          originalInvoiceId: invoice.originalInvoiceId,
          userId: session.user.id
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      })
    }

    return NextResponse.json({
      original: original || (invoice.originalInvoiceId ? null : invoice),
      variations: allVariations
    })
  } catch (error) {
    console.error('Error fetching invoice variations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice variations' },
      { status: 500 }
    )
  }
}

// POST /api/invoices/[id]/variations - Create invoice variation (change order)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      notes,
      lineItems,
      discountAmount,
      discountPercentage,
      shippingAmount,
      terms
    } = body

    // Get original invoice
    const originalInvoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    if (!originalInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // If the original invoice is itself a variation, use its original
    const baseInvoiceId = originalInvoice.originalInvoiceId || id

    // Calculate financial totals
    let subtotal = 0
    let gst = 0

    lineItems.forEach((item: any) => {
      const itemSubtotal = Math.round(item.quantity * item.unitPrice * 100)
      const itemGST = Math.round(itemSubtotal * (item.gstRate / 100))
      subtotal += itemSubtotal
      gst += itemGST
    })

    // Apply discount
    if (discountAmount) {
      subtotal -= Math.round(parseFloat(discountAmount) * 100)
    } else if (discountPercentage) {
      const discount = Math.round(subtotal * (parseFloat(discountPercentage) / 100))
      subtotal -= discount
    }

    // Add shipping
    if (shippingAmount) {
      subtotal += Math.round(parseFloat(shippingAmount) * 100)
    }

    // Recalculate GST
    gst = Math.round(subtotal * 0.1)
    const total = subtotal + gst

    // Get next invoice number
    const sequence = await prisma.invoiceSequence.findFirst({
      where: { userId: session.user.id }
    })

    if (!sequence) {
      return NextResponse.json(
        { error: 'Invoice sequence not found' },
        { status: 500 }
      )
    }

    const year = new Date().getFullYear()
    const invoiceNumber = `RA-${year}-${sequence.nextNumber.toString().padStart(4, '0')}-V`

    // Update sequence
    await prisma.invoiceSequence.update({
      where: { id: sequence.id },
      data: { nextNumber: sequence.nextNumber + 1 }
    })

    // Calculate due date (default 30 days from now)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    // Create variation invoice
    const variation = await prisma.invoice.create({
      data: {
        invoiceNumber,
        status: 'DRAFT',
        invoiceDate: new Date(),
        dueDate,
        // Copy customer details from original
        customerName: originalInvoice.customerName,
        customerEmail: originalInvoice.customerEmail,
        customerPhone: originalInvoice.customerPhone,
        customerAddress: originalInvoice.customerAddress,
        customerABN: originalInvoice.customerABN,
        // Financial amounts
        subtotalExGST: subtotal,
        gstAmount: gst,
        totalIncGST: total,
        amountDue: total,
        // Additional charges
        discountAmount: discountAmount ? Math.round(parseFloat(discountAmount) * 100) : 0,
        discountPercentage: discountPercentage ? parseFloat(discountPercentage) : null,
        shippingAmount: shippingAmount ? Math.round(parseFloat(shippingAmount) * 100) : 0,
        // Content
        notes: notes || `Variation of invoice ${originalInvoice.invoiceNumber}`,
        terms: terms || originalInvoice.terms,
        footer: originalInvoice.footer,
        // Relationships
        originalInvoiceId: baseInvoiceId,
        reportId: originalInvoice.reportId,
        estimateId: originalInvoice.estimateId,
        clientId: originalInvoice.clientId,
        contactId: originalInvoice.contactId,
        companyId: originalInvoice.companyId,
        templateId: originalInvoice.templateId,
        userId: session.user.id,
        // Line items
        lineItems: {
          create: lineItems.map((item: any, index: number) => ({
            description: item.description,
            category: item.category || null,
            quantity: item.quantity,
            unitPrice: Math.round(item.unitPrice * 100),
            subtotal: Math.round(item.quantity * item.unitPrice * 100),
            gstRate: item.gstRate || 10,
            gstAmount: Math.round(item.quantity * item.unitPrice * 100 * (item.gstRate / 100)),
            total: Math.round(item.quantity * item.unitPrice * 100 * (1 + item.gstRate / 100)),
            sortOrder: index
          }))
        }
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    // Create audit log
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: variation.id,
        userId: session.user.id,
        action: 'variation_created',
        description: `Created variation from invoice ${originalInvoice.invoiceNumber}`,
        metadata: {
          originalInvoiceId: id,
          originalInvoiceNumber: originalInvoice.invoiceNumber
        }
      }
    })

    // Create audit log on original invoice
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: id,
        userId: session.user.id,
        action: 'variation_created',
        description: `Variation ${variation.invoiceNumber} created`,
        metadata: {
          variationInvoiceId: variation.id,
          variationInvoiceNumber: variation.invoiceNumber
        }
      }
    })

    return NextResponse.json({ variation }, { status: 201 })
  } catch (error) {
    console.error('Error creating invoice variation:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice variation' },
      { status: 500 }
    )
  }
}
