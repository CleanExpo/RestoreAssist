import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { applyRateLimit } from '@/lib/rate-limiter'
import { generateResetCode, storeResetCode } from '@/lib/password-reset-store'

// POST - Send password reset verification code
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 attempts per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 3, prefix: 'forgot-password' })
    if (rateLimited) return rateLimited

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true }
    })

    // Always return success to prevent email enumeration
    // But only generate code if user exists and has a password (not Google-only user)
    if (user && user.password) {
      const code = generateResetCode()
      storeResetCode(email, code)

      // Log the code for development (in production, send via email)
      console.log(`[Password Reset] Code for ${email}: ${code}`)

      // TODO: Send email with reset code
      // await sendResetEmail(email, code)
    }

    // Always return the same response regardless of whether user exists
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a verification code has been sent.'
    })
  } catch (error: any) {
    console.error('Error in forgot password:', error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
