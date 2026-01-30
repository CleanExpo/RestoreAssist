import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { generateInvoiceSentEmail } from '@/lib/invoices/email-templates'

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if Resend is configured
    if (!resend) {
      return NextResponse.json(
        { error: 'Email service not configured. Please set RESEND_API_KEY environment variable.' },
        { status: 503 }
      )
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        },
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
            businessEmail: true,
            businessPhone: true
          }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'SENT') {
      return NextResponse.json(
        { error: 'Invoice cannot be sent in current status' },
        { status: 400 }
      )
    }

    // Generate public token if not exists
    const publicToken = invoice.publicToken || `inv_${invoice.id}_${Date.now()}`

    // Send email via Resend
    const fromEmail = invoice.user.businessEmail || invoice.user.email || 'invoices@restoreassist.com.au'
    const fromName = invoice.user.businessName || invoice.user.name || 'RestoreAssist'

    // Generate professional email HTML
    const emailHtml = generateInvoiceSentEmail({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      totalIncGST: invoice.totalIncGST,
      amountDue: invoice.amountDue,
      customerName: invoice.customerName,
      publicToken,
      businessName: fromName,
      businessEmail: invoice.user.businessEmail || undefined,
      businessPhone: invoice.user.businessPhone || undefined,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://restoreassist.com.au'
    })

    try {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: invoice.customerEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${fromName}`,
        html: emailHtml,
        replyTo: invoice.user.businessEmail || invoice.user.email
      })

      if (emailError) {
        throw new Error(`Email send failed: ${emailError.message}`)
      }

      // Update invoice in transaction
      const updatedInvoice = await prisma.$transaction([
        prisma.invoice.update({
          where: { id: params.id },
          data: {
            status: 'SENT',
            sentDate: new Date(),
            publicToken
          }
        }),
        prisma.invoiceEmail.create({
          data: {
            invoiceId: params.id,
            emailType: 'SENT',
            recipientEmail: invoice.customerEmail,
            subject: `Invoice ${invoice.invoiceNumber}`,
            resendEmailId: emailData?.id
          }
        }),
        prisma.invoiceAuditLog.create({
          data: {
            invoiceId: params.id,
            userId: session.user.id,
            action: 'sent',
            description: `Invoice sent to ${invoice.customerEmail}`
          }
        })
      ])

      return NextResponse.json({
        success: true,
        message: 'Invoice sent successfully',
        emailId: emailData?.id
      })
    } catch (emailError: any) {
      console.error('Email send error:', emailError)
      return NextResponse.json(
        { error: 'Failed to send email: ' + emailError.message },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error sending invoice:', error)
    return NextResponse.json(
      { error: 'Failed to send invoice' },
      { status: 500 }
    )
  }
}
