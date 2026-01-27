import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { applyRateLimit } from '@/lib/rate-limiter'
import { generateResetCode, storeResetCode } from '@/lib/password-reset-store'
import { sendPasswordResetEmail } from '@/lib/email'
import { sanitizeString } from '@/lib/sanitize'
import { validateCsrf } from '@/lib/csrf'

// POST - Send password reset verification code
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

    // Rate limit: 3 attempts per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 3, prefix: 'forgot-password' })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const email = sanitizeString(body.email, 320).toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true }
    })

    // Always return success to prevent email enumeration
    // But only generate code if user exists and has a password (not Google-only user)
    if (user && user.password) {
      const code = generateResetCode()
      await storeResetCode(email, code)

      // Send password reset email
      await sendPasswordResetEmail({
        recipientEmail: email,
        recipientName: user.name || user.email.split('@')[0],
        resetCode: code,
      }).catch((err) => {
        // Log but don't fail the request if email fails
        console.error('[Password Reset] Failed to send email:', err)
      })
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
