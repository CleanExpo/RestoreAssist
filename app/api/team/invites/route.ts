import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { validateCsrf } from "@/lib/csrf"
import { sendInviteEmail } from "@/lib/email"
import { notifyTeamMemberJoined } from "@/lib/notifications"
import { sanitizeString } from "@/lib/sanitize"

function canInvite(role?: string) {
  // Only ADMIN and MANAGER can create invites
  return role === "ADMIN" || role === "MANAGER"
}

function canViewInvites(role?: string) {
  // All authenticated users can view invites in their organization
  return role === "ADMIN" || role === "MANAGER" || role === "USER"
}

async function ensureOrganizationForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")

  if (user.organizationId) return user.organizationId

  // Backward compatible: if an existing user has no org, create one lazily and attach.
  const org = await prisma.organization.create({
    data: {
      name: `${user.name || "Account"} Organisation`,
      ownerId: userId
    }
  })

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id }
  })

  return org.id
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewInvites(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const orgId = await ensureOrganizationForUser(session.user.id)

  // Build where clause based on user role
  let whereClause: any = { organizationId: orgId }
  
  // Managers can only see invites they created
  if (session.user.role === "MANAGER") {
    whereClause = {
      organizationId: orgId,
      createdById: session.user.id // Only invites created by this Manager
    }
  }
  // Admins see all invites in the organization
  // Technicians see all invites (for hierarchy view)

  const invites = await prisma.userInvite.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
      createdById: true,
      managedById: true
    }
  })

  return NextResponse.json({ invites })
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req)
  if (csrfError) return csrfError

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canInvite(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const email = sanitizeString(body.email, 320)
  const role = body.role
  if (!email || !role) return NextResponse.json({ error: "Email and role are required" }, { status: 400 })

  if (role !== "MANAGER" && role !== "USER") {
    return NextResponse.json({ error: "Invalid role. Use MANAGER or USER." }, { status: 400 })
  }

  // Managers can only invite technicians (USER)
  if (session.user.role === "MANAGER" && role !== "USER") {
    return NextResponse.json({ error: "Managers can only invite technicians" }, { status: 403 })
  }

  const orgId = await ensureOrganizationForUser(session.user.id)

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }
    }
  })

  if (existingUser) {
    // Prevent transferring ADMIN users - they should manage their own organizations
    if (existingUser.role === "ADMIN") {
      return NextResponse.json(
        {
          error: "Administrator accounts cannot be transferred to another organization. Administrators manage their own organizations.",
          existingUser: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            role: existingUser.role
          }
        },
        { status: 403 } // 403 Forbidden
      )
    }

    // Case 1: User is already in the same organization - update their role if needed
    if (existingUser.organizationId === orgId) {

      // Update role if it's different
      const updatedUser = existingUser.role === role 
        ? existingUser 
        : await prisma.user.update({
            where: { id: existingUser.id },
            data: { role }
          })

      // Create invite record for tracking
      const token = crypto.randomBytes(24).toString("hex")
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      const invite = await prisma.userInvite.create({
        data: {
          token,
          email: email.toLowerCase(),
          role,
          organizationId: orgId,
          createdById: session.user.id,
          managedById: session.user.role === "MANAGER" ? session.user.id : null,
          expiresAt,
          usedAt: new Date()
        }
      })

      // Get inviter's name
      const inviter = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true }
      })

      const inviterName = inviter?.name || "Administrator"

      // Send notification email
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
      

      try {
        await sendInviteEmail({
          email: email.toLowerCase(),
          name: updatedUser.name || email.split("@")[0],
          role,
          tempPassword: undefined,
          loginUrl,
          inviterName,
          isTransfer: true
        })
      } catch (emailError: any) {
        console.error("❌ [INVITE] Email sending failed:", emailError?.message || "Unknown error")
        // Don't fail the request - the user is already updated
      }

      return NextResponse.json({
        message: existingUser.role === role 
          ? "This user is already a member of your organization with this role. Notification sent."
          : "User role has been updated and notification sent.",
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          usedAt: invite.usedAt
        },
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role
        },
        updated: true,
        credentials: {
          email: updatedUser.email,
          password: null // No password for existing users - they already have one
        }
      })
    }

    // Case 2 & 3: User exists but is in a different organization OR has no organization
    // Update the existing user to join this organization
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        organizationId: orgId,
        role: role, // Update role as requested
        managedById: session.user.role === "MANAGER" ? session.user.id : null,
        // Don't update password - keep their existing password
        // Don't update mustChangePassword - keep their existing setting
      }
    })


    // Create invite record for tracking
    const token = crypto.randomBytes(24).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invite = await prisma.userInvite.create({
      data: {
        token,
        email: email.toLowerCase(),
        role,
        organizationId: orgId,
        createdById: session.user.id,
        managedById: session.user.role === "MANAGER" ? session.user.id : null,
        expiresAt,
        usedAt: new Date() // Mark as used since user already exists
      }
    })


    // Get inviter's name
    const inviter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true }
    })

    const inviterName = inviter?.name || "Administrator"

    // Send notification email (without password since they already have one)
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
    

    try {
      // Send a different email for transferred users (they already have an account)
      await sendInviteEmail({
        email: email.toLowerCase(),
        name: updatedUser.name || email.split("@")[0],
        role,
        tempPassword: undefined, // No temp password needed
        loginUrl,
        inviterName,
        isTransfer: true // Flag to indicate this is a transfer, not a new account
      })
    } catch (emailError: any) {
      console.error("❌ [INVITE] Email sending failed for transferred user:", updatedUser.id)
      console.error("❌ [INVITE] Email error:", emailError?.message || "Unknown error")
      // Don't fail the request - the user is already transferred
    }

    // In-app notification for org admin (non-blocking)
    const transferRoleName = role === "USER" ? "Technician" : "Manager"
    prisma.organization.findUnique({ where: { id: orgId }, select: { ownerId: true } })
      .then(org => {
        if (org?.ownerId) notifyTeamMemberJoined(org.ownerId, updatedUser.name || email.split("@")[0], transferRoleName)
      })
      .catch(() => {})

    return NextResponse.json({
      message: "User has been successfully added to your organization",
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        usedAt: invite.usedAt
      },
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role
      },
      transferred: true, // Flag to indicate this was a transfer
      credentials: {
        email: updatedUser.email,
        password: null // No password for transferred users - they already have one
      }
    })
  }

  // Generate cryptographically random temporary password
  const tempPassword = crypto.randomBytes(12).toString("base64url").slice(0, 12)

  const hashedPassword = await bcrypt.hash(tempPassword, 12)

  // Get inviter's name
  const inviter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true }
  })

  const inviterName = inviter?.name || "Administrator"

  try {
    
    // Create user account immediately with temporary password
    // Managers and Technicians don't have their own subscription/credits
    // They use the Admin's organization credits
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: email.split("@")[0], // Default name from email
        password: hashedPassword,
        role,
        organizationId: orgId,
        managedById: session.user.role === "MANAGER" ? session.user.id : null,
        // No subscription/credits - they use the Admin's organization credits
        subscriptionStatus: null,
        creditsRemaining: null,
        totalCreditsUsed: 0,
        mustChangePassword: true // Require password change on first login
      }
    })
    

    // Create invite record (marked as used since account is already created)
    const token = crypto.randomBytes(24).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invite = await prisma.userInvite.create({
      data: {
        token,
        email: email.toLowerCase(),
        role,
        organizationId: orgId,
        createdById: session.user.id,
        managedById: session.user.role === "MANAGER" ? session.user.id : null,
        expiresAt,
        usedAt: new Date() // Mark as used since account is already created
      }
    })
    

    // Send email with credentials
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
    
    
    try {
      await sendInviteEmail({
        email: email.toLowerCase(),
        name: user.name || email.split("@")[0],
        role,
        tempPassword,
        loginUrl,
        inviterName
      })
    } catch (emailError: any) {
      console.error("❌ [INVITE] Email sending failed for user:", user.id)
      console.error("❌ [INVITE] Email error:", emailError?.message || "Unknown error")
      // Re-throw to be caught by outer catch block
      throw emailError
    }

    // In-app notification for org admin (non-blocking)
    const roleName = role === "USER" ? "Technician" : "Manager"
    prisma.organization.findUnique({ where: { id: orgId }, select: { ownerId: true } })
      .then(org => {
        if (org?.ownerId) notifyTeamMemberJoined(org.ownerId, user.name || email.split("@")[0], roleName)
      })
      .catch(() => {})

    return NextResponse.json({
      message: "User account created and invite email sent successfully",
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        usedAt: invite.usedAt
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      credentials: {
        email: user.email,
        password: tempPassword
      }
    })
  } catch (error: any) {
    console.error("Error creating invite:", error)
    
    // If email sending fails, we should still return success but log the error
    // The account is created, so the user can still log in
    if (error.message?.includes("email") || error.message?.includes("Resend")) {
      // Find the user and invite that were created before email failed
      const [createdUser, createdInvite] = await Promise.all([
        prisma.user.findUnique({
          where: { email: email.toLowerCase() }
        }),
        prisma.userInvite.findFirst({
          where: { 
            email: email.toLowerCase(),
            createdById: session.user.id
          },
          orderBy: { createdAt: 'desc' }
        })
      ])
      
      return NextResponse.json(
        {
          message: "User account created, but email sending failed. Please contact the user directly.",
          error: "Email sending failed",
          tempPassword, // Include temp password in response as fallback
          invite: createdInvite ? {
            id: createdInvite.id,
            email: createdInvite.email,
            role: createdInvite.role,
            usedAt: createdInvite.usedAt
          } : undefined,
          user: createdUser ? {
            id: createdUser.id,
            email: createdUser.email,
            name: createdUser.name,
            role: createdUser.role
          } : undefined,
          credentials: createdUser ? {
            email: createdUser.email,
            password: tempPassword
          } : undefined
        },
        { status: 207 } // 207 Multi-Status
      )
    }

    return NextResponse.json(
      { error: "Failed to create invite. Please try again." },
      { status: 500 }
    )
  }
}

