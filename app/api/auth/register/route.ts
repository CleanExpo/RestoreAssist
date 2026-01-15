import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, signupType, inviteToken } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
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
    if (inviteToken) {
      const invite = await prisma.userInvite.findUnique({
        where: { token: inviteToken }
      })

      if (!invite) {
        return NextResponse.json({ error: "Invalid invite token" }, { status: 400 })
      }

      if (invite.usedAt) {
        return NextResponse.json({ error: "Invite token has already been used" }, { status: 400 })
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

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: invite.role,
          organizationId: invite.organizationId,
          managedById: invite.managedById,
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      })

      await prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() }
      })

      const { password: _, ...userWithoutPassword } = user
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 }
      )
    }

    // ADMIN SIGNUP (creates organization)
    // If signupType is not provided, default to the existing behaviour (USER).
    if (normalizedSignupType === "admin") {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      })

      const orgName = `${name}'s Organisation`
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          ownerId: user.id
        }
      })

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: org.id }
      })

      const { password: _, ...userWithoutPassword } = updatedUser
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 }
      )
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
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    })

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json(
      { 
        message: "User created successfully",
        user: userWithoutPassword 
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
