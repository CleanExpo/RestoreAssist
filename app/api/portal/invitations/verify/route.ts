import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/portal/invitations/verify?token=... - Verify invitation token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const invitation = await prisma.portalInvitation.findUnique({
      where: { token },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          }
        },
        user: {
          select: {
            businessName: true,
            name: true,
          }
        }
      }
    })

    if (!invitation) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid invitation token'
      }, { status: 404 })
    }

    // Check if already accepted
    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json({
        valid: false,
        error: 'This invitation has already been accepted',
        status: 'ACCEPTED'
      })
    }

    // Check if expired
    if (invitation.status === 'EXPIRED' || invitation.expiresAt < new Date()) {
      // Update status if not already marked as expired
      if (invitation.status !== 'EXPIRED') {
        await prisma.portalInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' }
        })
      }
      return NextResponse.json({
        valid: false,
        error: 'This invitation has expired',
        status: 'EXPIRED'
      })
    }

    // Check if revoked
    if (invitation.status === 'REVOKED') {
      return NextResponse.json({
        valid: false,
        error: 'This invitation has been revoked',
        status: 'REVOKED'
      })
    }

    // Valid invitation
    const contractorName = invitation.user.businessName || invitation.user.name || 'RestoreAssist'

    return NextResponse.json({
      valid: true,
      invitation: {
        email: invitation.email,
        clientName: invitation.client.name,
        contractorName,
        expiresAt: invitation.expiresAt,
      }
    })
  } catch (error) {
    console.error('Error verifying invitation:', error)
    return NextResponse.json(
      { error: 'Failed to verify invitation' },
      { status: 500 }
    )
  }
}
