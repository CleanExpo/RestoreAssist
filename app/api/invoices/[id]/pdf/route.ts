import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateInvoicePDF } from '@/lib/invoices/pdf-generator'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch invoice with all related data
    const invoice = await prisma.invoice.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
            businessAddress: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true
          }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Prepare business info
    const businessInfo = {
      businessName: invoice.user.businessName || invoice.user.name || 'RestoreAssist',
      businessAddress: invoice.user.businessAddress,
      businessLogo: invoice.user.businessLogo,
      businessABN: invoice.user.businessABN,
      businessPhone: invoice.user.businessPhone,
      businessEmail: invoice.user.businessEmail || invoice.user.email
    }

    // Generate PDF
    const pdfBytes = await generateInvoicePDF({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        paidDate: invoice.paidDate,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        customerABN: invoice.customerABN,
        subtotalExGST: invoice.subtotalExGST,
        gstAmount: invoice.gstAmount,
        totalIncGST: invoice.totalIncGST,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        notes: invoice.notes,
        terms: invoice.terms,
        footer: invoice.footer,
        discountAmount: invoice.discountAmount,
        discountPercentage: invoice.discountPercentage,
        shippingAmount: invoice.shippingAmount
      },
      lineItems: invoice.lineItems,
      payments: invoice.payments,
      businessInfo
    })

    // Return PDF with proper headers
    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`
      }
    })
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
