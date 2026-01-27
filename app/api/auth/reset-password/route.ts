import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { applyRateLimit } from '@/lib/rate-limiter'
import { sanitizeString } from '@/lib/sanitize'
import { validateCsrf } from '@/lib/csrf'
import { verifyResetCode } from '@/lib/password-reset-store'

const MIN_PASSWORD_LENGTH = 8

// POST - Reset password with verification code
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

    // Rate limit: 5 attempts per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 5, prefix: 'reset-password' })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const email = sanitizeString(body.email, 320).toLowerCase()
    const newPassword = body.newPassword
    const code = sanitizeString(body.code, 10)

    if (!email || !newPassword || !code) {
      return NextResponse.json(
        { error: 'Email, verification code, and new password are required' },
        { status: 400 }
      )
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }

    // Verify the reset code
    const codeResult = verifyResetCode(email, code)
    if (!codeResult.valid) {
      return NextResponse.json(
        { error: codeResult.error },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update user password
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        mustChangePassword: false
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })
  } catch (error: any) {
    console.error('Error resetting password:', error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
