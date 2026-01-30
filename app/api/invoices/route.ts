import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: any = { userId: session.user.id }

    if (status) where.status = status

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (from || to) {
      where.invoiceDate = {}
      if (from) where.invoiceDate.gte = new Date(from)
      if (to) where.invoiceDate.lte = new Date(to)
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' }
          },
          payments: {
            include: {
              allocations: true
            }
          },
          _count: {
            select: {
              lineItems: true,
              payments: true,
              creditNotes: true
            }
          },
          client: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.invoice.count({ where })
    ])

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      estimateId,
      reportId,
      clientId,
      contactId,
      companyId,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerABN,
      invoiceDate,
      dueDate,
      lineItems,
      notes,
      terms,
      footer,
      discountAmount,
      discountPercentage,
      shippingAmount
    } = body

    // Validate required fields
    if (!customerName || !customerEmail) {
      return NextResponse.json(
        { error: 'Customer name and email are required' },
        { status: 400 }
      )
    }

    if (!lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      )
    }

    if (!dueDate) {
      return NextResponse.json(
        { error: 'Due date is required' },
        { status: 400 }
      )
    }

    // Generate invoice number
    const year = new Date().getFullYear()
    const sequence = await prisma.invoiceSequence.upsert({
      where: {
        userId_year: {
          userId: session.user.id,
          year
        }
      },
      update: {
        lastNumber: {
          increment: 1
        }
      },
      create: {
        userId: session.user.id,
        year,
        prefix: 'RA',
        lastNumber: 1
      }
    })

    const invoiceNumber = `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(4, '0')}`

    // Calculate financials
    let subtotalExGST = 0
    let gstAmount = 0

    const processedLineItems = lineItems.map((item: any, index: number) => {
      const quantity = parseFloat(item.quantity)
      const unitPrice = parseInt(item.unitPrice)
      const subtotal = Math.round(quantity * unitPrice)
      const gstRate = item.gstRate ?? 10.0
      const itemGst = Math.round(subtotal * (gstRate / 100))
      const total = subtotal + itemGst

      subtotalExGST += subtotal
      gstAmount += itemGst

      return {
        description: item.description,
        category: item.category,
        quantity,
        unitPrice,
        subtotal,
        gstRate,
        gstAmount: itemGst,
        total,
        sortOrder: index,
        estimateLineItemId: item.estimateLineItemId
      }
    })

    // Apply discounts
    if (discountAmount) {
      subtotalExGST -= discountAmount
      gstAmount = Math.round(subtotalExGST * 0.1)
    } else if (discountPercentage) {
      const discount = Math.round(subtotalExGST * (discountPercentage / 100))
      subtotalExGST -= discount
      gstAmount = Math.round(subtotalExGST * 0.1)
    }

    // Add shipping
    if (shippingAmount) {
      subtotalExGST += shippingAmount
      gstAmount += Math.round(shippingAmount * 0.1)
    }

    const totalIncGST = subtotalExGST + gstAmount

    // Create invoice with line items in transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          status: 'DRAFT',
          userId: session.user.id,
          estimateId,
          reportId,
          clientId,
          contactId,
          companyId,
          customerName,
          customerEmail,
          customerPhone,
          customerAddress,
          customerABN,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate: new Date(dueDate),
          subtotalExGST,
          gstAmount,
          totalIncGST,
          amountDue: totalIncGST,
          discountAmount: discountAmount || 0,
          discountPercentage,
          shippingAmount: shippingAmount || 0,
          notes,
          terms,
          footer,
          source: estimateId ? 'estimate' : 'manual',
          lineItems: {
            create: processedLineItems
          }
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      })

      // Create audit log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: newInvoice.id,
          userId: session.user.id,
          action: 'created',
          description: `Invoice ${invoiceNumber} created`
        }
      })

      return newInvoice
    })

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    )
  }
}
