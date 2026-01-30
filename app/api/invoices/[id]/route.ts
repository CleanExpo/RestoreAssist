import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        },
        payments: {
          include: {
            allocations: true
          },
          orderBy: { paymentDate: 'desc' }
        },
        paymentAllocations: true,
        creditNotes: {
          include: {
            lineItems: {
              orderBy: { sortOrder: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        auditLogs: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        emails: {
          orderBy: { sentAt: 'desc' }
        },
        reminders: {
          orderBy: { scheduledFor: 'desc' }
        },
        client: {
          select: { id: true, name: true, email: true, phone: true }
        },
        report: {
          select: { id: true, title: true, clientName: true }
        },
        estimate: {
          select: { id: true, totalIncGST: true }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if invoice exists and belongs to user
    const existing = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Only allow updates to DRAFT invoices
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only draft invoices can be edited' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
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

    // If line items are provided, recalculate financials
    let updateData: any = {
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerABN,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      terms,
      footer,
      discountAmount,
      discountPercentage,
      shippingAmount
    }

    if (lineItems && lineItems.length > 0) {
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

      updateData = {
        ...updateData,
        subtotalExGST,
        gstAmount,
        totalIncGST,
        amountDue: totalIncGST
      }

      // Update invoice with line items in transaction
      const invoice = await prisma.$transaction(async (tx) => {
        // Delete existing line items
        await tx.invoiceLineItem.deleteMany({
          where: { invoiceId: id }
        })

        // Update invoice and create new line items
        const updated = await tx.invoice.update({
          where: { id },
          data: {
            ...updateData,
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
            invoiceId: id,
            userId: session.user.id,
            action: 'updated',
            description: `Invoice ${existing.invoiceNumber} updated`
          }
        })

        return updated
      })

      return NextResponse.json({ invoice })
    } else {
      // Update invoice without line items
      const invoice = await prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.update({
          where: { id },
          data: updateData,
          include: {
            lineItems: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        })

        // Create audit log
        await tx.invoiceAuditLog.create({
          data: {
            invoiceId: id,
            userId: session.user.id,
            action: 'updated',
            description: `Invoice ${existing.invoiceNumber} updated`
          }
        })

        return updated
      })

      return NextResponse.json({ invoice })
    }
  } catch (error: any) {
    console.error('Error updating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if invoice exists and belongs to user
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Only allow deletion of DRAFT or CANCELLED invoices
    if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: 'Only draft or cancelled invoices can be deleted' },
        { status: 400 }
      )
    }

    // Delete invoice (cascade will handle related records)
    await prisma.invoice.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: 'Invoice deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    )
  }
}
