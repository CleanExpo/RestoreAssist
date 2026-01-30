import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limiter"
import { sanitizeString } from "@/lib/sanitize"
import { validateCsrf } from "@/lib/csrf"
import { sendWelcomeEmail } from "@/lib/email"
import { notifyWelcome } from "@/lib/notifications"
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit"

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.com.au"

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

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
    const { password } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      )
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // All registrations create an ADMIN user with their own organisation
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
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          quickFillCreditsRemaining: 1,
          totalQuickFillUsed: 0,
        },
      })
      sendWelcomeEmail({
        recipientEmail: email,
        recipientName: name,
        loginUrl: `${APP_URL}/login`,
        trialDays: 14,
        trialCredits: 3,
      }).catch((err) => console.error("[Register] Welcome email failed:", err))
      notifyWelcome(user.id)
      const reqCtx = extractRequestContext(request)
      logSecurityEvent({
        eventType: "ACCOUNT_REGISTERED",
        userId: user.id,
        email: user.email,
        ...reqCtx,
        details: { role: "ADMIN", hasOrganization: false },
      }).catch(() => {})
      const { password: _, ...userWithoutPassword } = user
      return NextResponse.json(
        {
          message: "User created successfully",
          user: userWithoutPassword,
          warning:
            "Organisation setup is pending. Please run `npx prisma generate` and restart the dev server to enable team features.",
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
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            quickFillCreditsRemaining: 1,
            totalQuickFillUsed: 0,
          },
        })
        const orgName = `${name}'s Organisation`
        const org = await tx.organization.create({
          data: { name: orgName, ownerId: user.id },
        })
        return await tx.user.update({
          where: { id: user.id },
          data: { organizationId: org.id },
        })
      })
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
        eventType: "ACCOUNT_REGISTERED",
        userId: updatedUser.id,
        email: updatedUser.email,
        ...reqCtx,
        details: { role: "ADMIN", hasOrganization: true },
      }).catch(() => {})
      const { password: _, ...userWithoutPassword } = updatedUser
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 }
      )
    } catch (e) {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          quickFillCreditsRemaining: 1,
          totalQuickFillUsed: 0,
        },
      })
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
            "Organisation setup failed (migration/client not applied yet). Run `npx prisma migrate dev` then `npx prisma generate`, and restart the dev server.",
        },
        { status: 201 }
      )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[Register] Registration error:", message, stack ?? String(error))
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
