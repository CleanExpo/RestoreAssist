import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { sendInviteEmail } from "@/lib/email"

function canResendInvite(role?: string) {
  return role === "ADMIN" || role === "MANAGER"
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!canResendInvite(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params

    // Find the invite
    const invite = await prisma.userInvite.findUnique({
      where: { id },
      include: {
        organization: true,
        createdBy: {
          select: { id: true, name: true, organizationId: true }
        }
      }
    })

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 })
    }

    // Verify the invite belongs to the user's organization
    if (invite.createdBy?.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Managers can only resend invites they created
    if (session.user.role === "MANAGER" && invite.createdById !== session.user.id) {
      return NextResponse.json(
        { error: "You can only resend invites you created" },
        { status: 403 }
      )
    }

    // Check if invite is already used
    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This invite has already been used" },
        { status: 400 }
      )
    }

    // Check if invite is expired and update if needed
    const now = new Date()
    if (invite.expiresAt < now) {
      // Extend expiration by 7 days
      await prisma.userInvite.update({
        where: { id },
        data: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      })
    }

    // Get inviter's name
    const inviter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true }
    })

    const inviterName = inviter?.name || "Administrator"
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`

    // Check if a user account exists for this email
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() }
    })

    // Resend the email
    await sendInviteEmail({
      email: invite.email,
      name: existingUser?.name || invite.email.split("@")[0],
      role: invite.role,
      tempPassword: undefined, // Password not included on resend — user already has credentials
      loginUrl,
      inviterName,
      isTransfer: !!existingUser
    })

    return NextResponse.json({
      message: "Invite email resent successfully",
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt
      }
    })
  } catch (error: any) {
    console.error("Error resending invite:", error)
    return NextResponse.json(
      { error: "Failed to resend invite email" },
      { status: 500 }
    )
  }
}
