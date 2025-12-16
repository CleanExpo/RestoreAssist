import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  logger.apiRequest('POST', '/api/auth/register')

  try {
    const { name, email, password } = await request.json()

    logger.info('Registration attempt', { email, hasName: !!name, hasPassword: !!password })

    if (!name || !email || !password) {
      logger.warn('Registration failed: missing fields', { hasName: !!name, hasEmail: !!email, hasPassword: !!password })
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      logger.warn('Registration failed: user already exists', { email })
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user with 3 credits and TRIAL status
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

    const duration = Date.now() - startTime
    logger.info('User registered successfully', { userId: user.id, email, duration: `${duration}ms` })
    logger.apiResponse('POST', '/api/auth/register', 201, duration, { userId: user.id })

    return NextResponse.json(
      { 
        message: "User created successfully",
        user: userWithoutPassword 
      },
      { status: 201 }
    )
  } catch (error) {
    const duration = Date.now() - startTime
    logger.apiError('POST', '/api/auth/register', error, { duration: `${duration}ms` })
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
