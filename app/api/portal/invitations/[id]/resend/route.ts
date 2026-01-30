import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

// Lazy initialize Resend to avoid build errors if API key is missing
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - email sending will be skipped')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// POST /api/portal/invitations/[id]/resend - Resend invitation email
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.userType === 'client') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invitationId = params.id

    // Find invitation
    const invitation = await prisma.portalInvitation.findFirst({
      where: {
        id: invitationId,
        userId: session.user.id, // Verify ownership
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          }
        },
        user: {
          select: {
            name: true,
            businessName: true,
          }
        }
      }
    })

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    // Can't resend if already accepted
    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json(
        { error: 'Invitation already accepted' },
        { status: 400 }
      )
    }

    // Update expiration (extend by 7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.portalInvitation.update({
      where: { id: invitation.id },
      data: {
        expiresAt,
        status: 'PENDING', // Reset to pending if was expired/revoked
      }
    })

    // Resend invitation email
    const baseUrl = process.env.NEXTAUTH_URL || 'https://restoreassist.com.au'
    const inviteUrl = `${baseUrl}/portal/signup?token=${invitation.token}`
    const contractorName = invitation.user.businessName || invitation.user.name || 'RestoreAssist'

    const resend = getResend()
    if (!resend) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 503 }
      )
    }

    try {
      await resend.emails.send({
        from: 'RestoreAssist <noreply@restoreassist.com.au>',
        to: invitation.email,
        subject: `Reminder: ${contractorName} has invited you to view your restoration project`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reminder: You've been invited to the Client Portal</h2>
            <p>Hi ${invitation.client.name},</p>
            <p>This is a reminder that ${contractorName} has invited you to access the Client Portal where you can:</p>
            <ul>
              <li>View your restoration project reports</li>
              <li>Review and approve scope of work</li>
              <li>Track project status and progress</li>
              <li>Download important documents</li>
            </ul>
            <p style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background-color: #8A6B4E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation & Create Account
              </a>
            </p>
            <p style="font-size: 12px; color: #666;">
              This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
            </p>
            <p style="font-size: 12px; color: #666;">
              Link not working? Copy and paste this URL into your browser:<br/>
              ${inviteUrl}
            </p>
          </div>
        `,
      })
    } catch (emailError) {
      console.error('Failed to resend invitation email:', emailError)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation resent successfully'
    })
  } catch (error) {
    console.error('Error resending invitation:', error)
    return NextResponse.json(
      { error: 'Failed to resend invitation' },
      { status: 500 }
    )
  }
}
