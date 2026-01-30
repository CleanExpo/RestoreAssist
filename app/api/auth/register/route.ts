import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limiter"
import { sanitizeString } from "@/lib/sanitize"
import { validateCsrf } from "@/lib/csrf"
import { sendWelcomeEmail } from "@/lib/email"
import { notifyWelcome } from "@/lib/notifications"
import { logSecurityEvent, extractRequestContext } from '@/lib/security-audit'

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.com.au"

export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

    // Rate limit: 5 registrations per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 5, prefix: "register" })
    if (rateLimited) return rateLimited

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }
    const name = sanitizeString(body.name, 200)
    const email = sanitizeString(body.email, 320)
    const { password, signupType, inviteToken } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      )
    }

    // Enforce minimum password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const normalizedSignupType =
      signupType === "admin" || signupType === "technician" ? signupType : undefined

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // INVITE-BASED JOIN (Manager/Technician)
    // Note: With the new invite system, accounts are created immediately when invites are sent.
    // This flow is kept for backward compatibility and edge cases.
    if (inviteToken) {
      const invite = await prisma.userInvite.findUnique({
        where: { token: inviteToken }
      })

      if (!invite) {
        return NextResponse.json({ error: "Invalid invite token" }, { status: 400 })
      }

      if (invite.expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: "Invite token has expired" }, { status: 400 })
      }

      if (invite.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json(
          { error: "Invite token does not match this email address" },
          { status: 400 }
        )
      }

      // Check if account already exists (new invite system creates accounts immediately)
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      })

      if (existingUser) {
        // Account already exists - user should just log in
        return NextResponse.json(
          { 
            error: "An account with this email already exists. Please log in instead.",
            accountExists: true
          },
          { status: 400 }
        )
      }

      // If invite is already used, check if user exists
      if (invite.usedAt) {
        const user = await prisma.user.findUnique({
          where: { email: invite.email.toLowerCase() }
        })
        if (user) {
          return NextResponse.json(
            { 
              error: "This invite has already been used. An account exists for this email. Please log in instead.",
              accountExists: true
            },
            { status: 400 }
          )
        }
      }

      // Create user account (legacy flow - should rarely be hit now)
      // Managers and Technicians don't have their own subscription/credits
      // They use the Admin's organization credits
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: invite.role,
          organizationId: invite.organizationId,
          managedById: invite.managedById,
          // No subscription/credits - they use the Admin's organization credits
          subscriptionStatus: null,
          creditsRemaining: null,
          totalCreditsUsed: 0,
          mustChangePassword: false // User set their own password
        }
      })

      // Mark invite as used if not already
      if (!invite.usedAt) {
        await prisma.userInvite.update({
          where: { id: invite.id },
          data: { usedAt: new Date() }
        })
      }

      const reqCtx = extractRequestContext(request)
      logSecurityEvent({
        eventType: 'ACCOUNT_REGISTERED',
        userId: user.id,
        email: user.email,
        ...reqCtx,
        details: { signupType: 'invite', role: invite.role },
      }).catch(() => {})

      const { password: _, ...userWithoutPassword } = user
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 }
      )
    }

    // ADMIN SIGNUP (creates organization)
    // If signupType is not provided, default to the existing behaviour (USER).
    if (normalizedSignupType === "admin") {
      // If Prisma Client hasn't been regenerated after schema changes, this delegate may be missing.
      // In that case we still allow signup (so the account is created), and the organisation can be
      // created later after `prisma generate` + server restart.
      const canCreateOrganization = Boolean(prisma.organization?.create)

      if (!canCreateOrganization) {
        const user = await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial
          quickFillCreditsRemaining: 1, // Free users get 1 Quick Fill credit
          totalQuickFillUsed: 0
          }
        })

        // Send welcome email and in-app notification (non-blocking)
        sendWelcomeEmail({
          recipientEmail: email,
          recipientName: name,
          loginUrl: `${APP_URL}/login`,
          trialDays: 14,
          trialCredits: 3,
        }).catch((err) => console.error("[Register] Welcome email failed:", err))
        notifyWelcome(user.id)

        const { password: _, ...userWithoutPassword } = user
        return NextResponse.json(
          {
            message: "User created successfully",
            user: userWithoutPassword,
            warning:
              "Organisation setup is pending. Please run `npx prisma generate` and restart the dev server to enable team features."
          },
          { status: 201 }
        )
      }

      try {
        const updatedUser = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              name,
              email,
              password: hashedPassword,
              role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial
          quickFillCreditsRemaining: 1, // Free users get 1 Quick Fill credit
          totalQuickFillUsed: 0
            }
          })

          const orgName = `${name}'s Organisation`
          const org = await tx.organization.create({
            data: { name: orgName, ownerId: user.id }
          })

          return await tx.user.update({
            where: { id: user.id },
            data: { organizationId: org.id }
          })
        })

        // Send welcome email and in-app notification (non-blocking)
        sendWelcomeEmail({
          recipientEmail: email,
          recipientName: name,
          loginUrl: `${APP_URL}/login`,
          trialDays: 14,
          trialCredits: 3,
        }).catch((err) => console.error("[Register] Welcome email failed:", err))
        notifyWelcome(updatedUser.id)

        const reqCtx = extractRequestContext(request)
        logSecurityEvent({
          eventType: 'ACCOUNT_REGISTERED',
          userId: updatedUser.id,
          email: updatedUser.email,
          ...reqCtx,
          details: { signupType: 'admin', hasOrganization: true },
        }).catch(() => {})

        const { password: _, ...userWithoutPassword } = updatedUser
        return NextResponse.json(
          { message: "User created successfully", user: userWithoutPassword },
          { status: 201 }
        )
      } catch (e) {
        // If the DB migration hasn't been applied yet (e.g., Organization table missing),
        // fall back to creating just the user so signup still works.
        const user = await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial
          quickFillCreditsRemaining: 1, // Free users get 1 Quick Fill credit
          totalQuickFillUsed: 0
          }
        })

        // Send welcome email and in-app notification (non-blocking)
        sendWelcomeEmail({
          recipientEmail: email,
          recipientName: name,
          loginUrl: `${APP_URL}/login`,
          trialDays: 14,
          trialCredits: 3,
        }).catch((err) => console.error("[Register] Welcome email failed:", err))
        notifyWelcome(user.id)

        const { password: _, ...userWithoutPassword } = user
        return NextResponse.json(
          {
            message: "User created successfully",
            user: userWithoutPassword,
            warning:
              "Organisation setup failed (migration/client not applied yet). Run `npx prisma migrate dev` then `npx prisma generate`, and restart the dev server."
          },
          { status: 201 }
        )
      }
    }

    // DEFAULT (legacy): Create user with 3 credits and TRIAL status
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "USER",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial // 30 days from now
          quickFillCreditsRemaining: 1, // Free users get 1 Quick Fill credit
          totalQuickFillUsed: 0
      }
    })

    const reqCtx = extractRequestContext(request)
    logSecurityEvent({
      eventType: 'ACCOUNT_REGISTERED',
      userId: user.id,
      email: user.email,
      ...reqCtx,
      details: { signupType: 'user' },
    }).catch(() => {})

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json(
      {
        message: "User created successfully",
        user: userWithoutPassword
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[Register] Registration error:", message, stack ?? String(error))

    // Prisma unique constraint (e.g. duplicate email)
    const prismaError = error as { code?: string }
    if (prismaError?.code === "P2002") {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    )
  }
}
