import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

function canRemoveMember(role?: string) {
  return role === "ADMIN"
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canRemoveMember(session.user.role)) {
      return NextResponse.json(
        { error: "Only Admins can remove team members" },
        { status: 403 }
      )
    }

    const { id: memberId } = await params

    // Get the current user's organization
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true }
    })

    if (!currentUser?.organizationId) {
      return NextResponse.json(
        { error: "You are not part of an organization" },
        { status: 400 }
      )
    }

    // Get the member to remove
    const memberToRemove = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true
      }
    })

    if (!memberToRemove) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Verify the member is in the same organization
    if (memberToRemove.organizationId !== currentUser.organizationId) {
      return NextResponse.json(
        { error: "Member is not in your organization" },
        { status: 403 }
      )
    }

    // Prevent removing yourself
    if (memberToRemove.id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself" },
        { status: 400 }
      )
    }

    // Prevent removing other Admins (only the owner can do that, but for now we'll prevent it)
    if (memberToRemove.role === "ADMIN") {
      return NextResponse.json(
        { error: "Cannot remove other Admin accounts. Only organization owners can manage Admins." },
        { status: 403 }
      )
    }


    // Remove member from organization (soft remove - set organizationId to null)
    // This allows the user account to remain but removes them from the team
    await prisma.user.update({
      where: { id: memberId },
      data: {
        organizationId: null,
        managedById: null // Also remove management relationship
      }
    })


    return NextResponse.json({
      message: `${memberToRemove.name || memberToRemove.email} has been removed from the team`,
      removedMember: {
        id: memberToRemove.id,
        email: memberToRemove.email,
        name: memberToRemove.name,
        role: memberToRemove.role
      }
    })
  } catch (error: any) {
    console.error("❌ [TEAM] Error removing member:", error)
    return NextResponse.json(
      { error: "Failed to remove team member" },
      { status: 500 }
    )
  }
}
