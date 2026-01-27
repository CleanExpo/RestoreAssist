import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST /api/portal/invitations/accept - Accept invitation and create ClientUser account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password, name, phone } = body

    if (!token || !password || !name) {
      return NextResponse.json(
        { error: 'Token, password, and name are required' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    // Find invitation
    const invitation = await prisma.portalInvitation.findUnique({
      where: { token },
      include: {
        client: true
      }
    })

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 })
    }

    // Check if already accepted
    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json({ error: 'Invitation already accepted' }, { status: 400 })
    }

    // Check if expired
    if (invitation.status === 'EXPIRED' || invitation.expiresAt < new Date()) {
      await prisma.portalInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' }
      })
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    // Check if revoked
    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'Invitation has been revoked' }, { status: 400 })
    }

    // Check if ClientUser already exists
    const existingClientUser = await prisma.clientUser.findUnique({
      where: { clientId: invitation.clientId }
    })

    if (existingClientUser) {
      return NextResponse.json(
        { error: 'Client account already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create ClientUser and update invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const clientUser = await tx.clientUser.create({
        data: {
          email: invitation.email,
          passwordHash,
          name,
          phone: phone || null,
          clientId: invitation.clientId,
        }
      })

      await tx.portalInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date()
        }
      })

      return clientUser
    })

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      clientUser: {
        id: result.id,
        email: result.email,
        name: result.name,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    )
  }
}
