import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email-send'
import {
  inspectionSubmittedEmail,
  scopeReadyEmail,
  invoiceGeneratedEmail,
  dryingGoalAchievedEmail,
  reportReadyEmail,
} from '@/lib/email-templates'

export const EVENTS = [
  'inspection_submitted',
  'scope_ready',
  'invoice_generated',
  'drying_goal_achieved',
  'report_ready',
] as const

type EventType = (typeof EVENTS)[number]

// ── GET /api/notifications/email ──────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ events: EVENTS })
}

// ── POST /api/notifications/email ─────────────────────────────────────────

interface PostBody {
  event: EventType
  inspectionId?: string
  invoiceId?: string
  recipientEmail: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { event, inspectionId, invoiceId, recipientEmail } = body

  if (!event || !EVENTS.includes(event)) {
    return NextResponse.json(
      { error: `Invalid event. Must be one of: ${EVENTS.join(', ')}` },
      { status: 400 }
    )
  }

  if (!recipientEmail) {
    return NextResponse.json({ error: 'recipientEmail is required' }, { status: 400 })
  }

  // Guard: RESEND_API_KEY check (no throw — return informative response)
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      sent: false,
      reason: 'RESEND_API_KEY not set',
      event,
      to: recipientEmail,
    })
  }

  try {
    let subject: string
    let html: string

    // ── invoice_generated uses Invoice record ──
    if (event === 'invoice_generated') {
      if (!invoiceId) {
        return NextResponse.json({ error: 'invoiceId is required for invoice_generated' }, { status: 400 })
      }
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, userId: session.user.id },
        select: {
          invoiceNumber: true,
          dueDate: true,
          totalIncGST: true,
          customerAddress: true,
        },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }
      subject = `Invoice ${invoice.invoiceNumber} — RestoreAssist`
      html = invoiceGeneratedEmail({
        invoiceNumber: invoice.invoiceNumber,
        address: invoice.customerAddress ?? 'N/A',
        totalIncGST: invoice.totalIncGST ?? 0,
        dueDate: invoice.dueDate
          ? new Date(invoice.dueDate).toLocaleDateString('en-AU')
          : 'N/A',
      })
    } else {
      // All other events need an inspection
      if (!inspectionId) {
        return NextResponse.json({ error: 'inspectionId is required for this event' }, { status: 400 })
      }
      const inspection = await prisma.inspection.findFirst({
        where: { id: inspectionId, userId: session.user.id },
        select: {
          inspectionNumber: true,
          propertyAddress: true,
          technicianName: true,
          submittedAt: true,
          scopeItems: { select: { id: true } },
        },
      })
      if (!inspection) {
        return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
      }

      const baseUrl = process.env.NEXTAUTH_URL ?? 'https://restoreassist.com.au'

      switch (event) {
        case 'inspection_submitted':
          subject = `Inspection ${inspection.inspectionNumber} submitted`
          html = inspectionSubmittedEmail({
            inspectionNumber: inspection.inspectionNumber,
            address: inspection.propertyAddress,
            technicianName: inspection.technicianName ?? 'N/A',
          })
          break

        case 'scope_ready':
          subject = `Scope ready — ${inspection.inspectionNumber}`
          html = scopeReadyEmail({
            inspectionNumber: inspection.inspectionNumber,
            address: inspection.propertyAddress,
            scopeItemCount: inspection.scopeItems.length,
            portalUrl: `${baseUrl}/dashboard/inspections/${inspectionId}`,
          })
          break

        case 'drying_goal_achieved':
          subject = `Drying goal achieved — ${inspection.inspectionNumber}`
          html = dryingGoalAchievedEmail({
            inspectionNumber: inspection.inspectionNumber,
            address: inspection.propertyAddress,
            completionDate: new Date().toLocaleDateString('en-AU'),
          })
          break

        case 'report_ready':
          subject = `Report ready — ${inspection.inspectionNumber}`
          html = reportReadyEmail({
            inspectionNumber: inspection.inspectionNumber,
            address: inspection.propertyAddress,
            reportUrl: `${baseUrl}/dashboard/inspections/${inspectionId}/report`,
          })
          break

        default:
          return NextResponse.json({ error: 'Unhandled event' }, { status: 400 })
      }
    }

    await sendEmail({ to: recipientEmail, subject, html })

    return NextResponse.json({ sent: true, event, to: recipientEmail })
  } catch (err) {
    console.error('[notifications/email] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
