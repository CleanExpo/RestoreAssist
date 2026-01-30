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

// GET /api/portal/invitations - List invitations for current contractor
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.userType === 'client') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const status = searchParams.get('status')

    const where: any = {
      userId: session.user.id,
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (status) {
      where.status = status
    }

    const invitations = await prisma.portalInvitation.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}

// POST /api/portal/invitations - Send portal invitation to client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.userType === 'client') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { clientId, message } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    // Verify client belongs to this contractor
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        userId: session.user.id,
      }
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if client already has a ClientUser account
    const existingClientUser = await prisma.clientUser.findUnique({
      where: { clientId }
    })

    if (existingClientUser) {
      return NextResponse.json(
        { error: 'Client already has portal access' },
        { status: 400 }
      )
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.portalInvitation.findFirst({
      where: {
        clientId,
        status: 'PENDING',
        expiresAt: {
          gt: new Date()
        }
      }
    })

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Active invitation already exists for this client' },
        { status: 400 }
      )
    }

    // Create invitation (expires in 7 days)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const invitation = await prisma.portalInvitation.create({
      data: {
        email: client.email,
        clientId,
        userId: session.user.id,
        expiresAt,
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

    // Send invitation email
    const baseUrl = process.env.NEXTAUTH_URL || 'https://restoreassist.com.au'
    const inviteUrl = `${baseUrl}/portal/signup?token=${invitation.token}`
    const contractorName = invitation.user.businessName || invitation.user.name || 'RestoreAssist'

    const resend = getResend()
    if (resend) {
      try {
        await resend.emails.send({
        from: 'RestoreAssist <noreply@restoreassist.com.au>',
        to: invitation.email,
        subject: `${contractorName} has invited you to view your restoration project`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited to the Client Portal</h2>
            <p>Hi ${client.name},</p>
            <p>${contractorName} has invited you to access the Client Portal where you can:</p>
            <ul>
              <li>View your restoration project reports</li>
              <li>Review and approve scope of work</li>
              <li>Track project status and progress</li>
              <li>Download important documents</li>
            </ul>
            ${message ? `<p><strong>Message from ${contractorName}:</strong><br/>${message}</p>` : ''}
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
        console.error('Failed to send invitation email:', emailError)
        // Don't fail the request if email fails - invitation is still created
      }
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}
