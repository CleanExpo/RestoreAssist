import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

// Safe logger import with fallback
let logger: any
try {
  logger = require("@/lib/logger").logger
} catch (e) {
  // Fallback logger if import fails
  logger = {
    info: (msg: string, ctx?: any) => console.log(`[INFO] ${msg}`, ctx || ''),
    warn: (msg: string, ctx?: any) => console.warn(`[WARN] ${msg}`, ctx || ''),
    error: (msg: string, err?: any, ctx?: any) => console.error(`[ERROR] ${msg}`, err, ctx || ''),
    apiRequest: () => {},
    apiResponse: () => {},
    apiError: (method: string, path: string, err: any) => console.error(`[API ERROR] ${method} ${path}`, err)
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    logger.apiRequest('POST', '/api/auth/register')
  } catch (e) {
    // Continue even if logging fails
  }

  try {
    const { name, email, password } = await request.json()

    try {
      logger.info('Registration attempt', { email, hasName: !!name, hasPassword: !!password })
    } catch (e) {
      // Continue even if logging fails
    }

    if (!name || !email || !password) {
      try {
        logger.warn('Registration failed: missing fields', { hasName: !!name, hasEmail: !!email, hasPassword: !!password })
      } catch (e) {}
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
      try {
        logger.warn('Registration failed: user already exists', { email })
      } catch (e) {}
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
    try {
      logger.info('User registered successfully', { userId: user.id, email, duration: `${duration}ms` })
      logger.apiResponse('POST', '/api/auth/register', 201, duration, { userId: user.id })
    } catch (e) {
      // Continue even if logging fails
    }

    return NextResponse.json(
      { 
        message: "User created successfully",
        user: userWithoutPassword 
      },
      { status: 201 }
    )
  } catch (error) {
    const duration = Date.now() - startTime
    try {
      logger.apiError('POST', '/api/auth/register', error, { duration: `${duration}ms` })
    } catch (e) {
      // Log to console as fallback
      console.error('Registration error:', error)
    }
    
    // Return detailed error in development, generic in production
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { 
        error: process.env.NODE_ENV === 'development' ? errorMessage : "Internal server error",
        ...(process.env.NODE_ENV === 'development' && error instanceof Error ? { stack: error.stack } : {})
      },
      { status: 500 }
    )
  }
}
