import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateInvoicePDF } from '@/lib/invoices/pdf-generator'
import { uploadPDFToCloudinary } from '@/lib/cloudinary'

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

    // Upload PDF to Cloudinary and save URL
    try {
      const buffer = Buffer.from(pdfBytes)
      const filename = `${invoice.invoiceNumber}_${Date.now()}`

      const { url: pdfUrl } = await uploadPDFToCloudinary(
        buffer,
        filename,
        'invoices',
        {
          tags: ['invoice', invoice.status.toLowerCase()],
          // PDFs persist indefinitely (no TTL) for financial records
        }
      )

      // Update invoice with PDF URL
      await prisma.invoice.update({
        where: { id: params.id },
        data: {
          pdfUrl,
          pdfGeneratedAt: new Date()
        }
      })

      console.log(`[Invoice PDF] ✅ Uploaded to Cloudinary: ${pdfUrl}`)
    } catch (cloudinaryError) {
      console.error('[Invoice PDF] ⚠️ Failed to upload to Cloudinary:', cloudinaryError)
      // Continue with PDF download even if Cloudinary upload fails
    }

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
