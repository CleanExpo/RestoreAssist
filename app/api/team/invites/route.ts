import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { sendInviteEmail } from "@/lib/email"

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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canInvite(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { email, role } = await req.json()
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
      console.log("🔄 [INVITE] User already in same organization. Updating role if needed...")
      console.log("🔄 [INVITE] Existing user ID:", existingUser.id)
      console.log("🔄 [INVITE] Existing user email:", existingUser.email)
      console.log("🔄 [INVITE] Existing user role:", existingUser.role)
      console.log("🔄 [INVITE] Target role:", role)

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
      
      console.log("📧 [INVITE] Preparing to send notification email...")
      console.log("📧 [INVITE] User ID:", updatedUser.id)
      console.log("📧 [INVITE] Email:", email.toLowerCase())
      console.log("📧 [INVITE] Login URL:", loginUrl)

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
        console.log("✅ [INVITE] Notification email sent successfully")
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
        updated: true
      })
    }

    // Case 2 & 3: User exists but is in a different organization OR has no organization
    // Transfer them to this organization
    const isDifferentOrg = existingUser.organizationId && existingUser.organizationId !== orgId
    const otherOrgName = existingUser.organization?.name || "another organization"
    
    console.log("🔄 [INVITE] User exists. Transferring to new organization...")
    console.log("🔄 [INVITE] Existing user ID:", existingUser.id)
    console.log("🔄 [INVITE] Existing user email:", existingUser.email)
    console.log("🔄 [INVITE] Existing user role:", existingUser.role)
    console.log("🔄 [INVITE] Existing organization ID:", existingUser.organizationId)
    console.log("🔄 [INVITE] Target organization ID:", orgId)
    console.log("🔄 [INVITE] Target role:", role)
    if (isDifferentOrg) {
      console.log("🔄 [INVITE] Transferring from different organization:", otherOrgName)
    }

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

    console.log("✅ [INVITE] User transferred to organization successfully")
    console.log("✅ [INVITE] Updated user ID:", updatedUser.id)
    console.log("✅ [INVITE] Updated user role:", updatedUser.role)

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

    console.log("✅ [INVITE] Invite record created for transferred user")
    console.log("✅ [INVITE] Invite ID:", invite.id)

    // Get inviter's name
    const inviter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true }
    })

    const inviterName = inviter?.name || "Administrator"

    // Send notification email (without password since they already have one)
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
    
    console.log("📧 [INVITE] Preparing to send transfer notification email...")
    console.log("📧 [INVITE] User ID:", updatedUser.id)
    console.log("📧 [INVITE] Email:", email.toLowerCase())
    console.log("📧 [INVITE] Login URL:", loginUrl)

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
      console.log("✅ [INVITE] Transfer notification email sent successfully")
    } catch (emailError: any) {
      console.error("❌ [INVITE] Email sending failed for transferred user:", updatedUser.id)
      console.error("❌ [INVITE] Email error:", emailError?.message || "Unknown error")
      // Don't fail the request - the user is already transferred
    }

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
      transferred: true // Flag to indicate this was a transfer
    })
  }

  // Use fixed temporary password for all invites
  const tempPassword = "dummy123"

  console.log("🔑 [INVITE] Using temporary password: dummy123")
  console.log("🔑 [INVITE] Password length:", tempPassword.length, "characters")
  console.log("🔑 [INVITE] Password format: Fixed temporary password")

  const hashedPassword = await bcrypt.hash(tempPassword, 12)

  // Get inviter's name
  const inviter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true }
  })

  const inviterName = inviter?.name || "Administrator"

  try {
    console.log("👤 [INVITE] Creating user account...")
    console.log("👤 [INVITE] Email:", email.toLowerCase())
    console.log("👤 [INVITE] Role:", role)
    console.log("👤 [INVITE] Organization ID:", orgId)
    
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
    
    console.log("✅ [INVITE] User account created successfully")
    console.log("✅ [INVITE] User ID:", user.id)
    console.log("✅ [INVITE] User name:", user.name)

    // Create invite record (marked as used since account is already created)
    console.log("📝 [INVITE] Creating invite record...")
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
    
    console.log("✅ [INVITE] Invite record created")
    console.log("✅ [INVITE] Invite ID:", invite.id)
    console.log("✅ [INVITE] Invite token:", token.substring(0, 8) + "...")

    // Send email with credentials
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
    
    console.log("📧 [INVITE] Preparing to send email...")
    console.log("📧 [INVITE] User created:", user.id)
    console.log("📧 [INVITE] Email:", email.toLowerCase())
    console.log("📧 [INVITE] Login URL:", loginUrl)
    
    try {
      await sendInviteEmail({
        email: email.toLowerCase(),
        name: user.name || email.split("@")[0],
        role,
        tempPassword,
        loginUrl,
        inviterName
      })
      console.log("✅ [INVITE] Email sent successfully for user:", user.id)
    } catch (emailError: any) {
      console.error("❌ [INVITE] Email sending failed for user:", user.id)
      console.error("❌ [INVITE] Email error:", emailError?.message || "Unknown error")
      // Re-throw to be caught by outer catch block
      throw emailError
    }

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
      }
    })
  } catch (error: any) {
    console.error("Error creating invite:", error)
    
    // If email sending fails, we should still return success but log the error
    // The account is created, so the user can still log in
    if (error.message?.includes("email") || error.message?.includes("Resend")) {
      return NextResponse.json(
        {
          message: "User account created, but email sending failed. Please contact the user directly.",
          error: "Email sending failed",
          tempPassword // Include temp password in response as fallback
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

