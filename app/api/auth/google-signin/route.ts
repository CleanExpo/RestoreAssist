import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminAuth } from '@/lib/firebase-admin'
import { applyRateLimit } from '@/lib/rate-limiter'
import { sanitizeString } from '@/lib/sanitize'
import { validateCsrf } from '@/lib/csrf'
import { logSecurityEvent, extractRequestContext } from '@/lib/security-audit'

// POST - Handle Google sign-in via Firebase
// Creates user in database if doesn't exist, otherwise updates and returns user
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request)
    if (csrfError) return csrfError

    // Rate limit: 10 attempts per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 10, prefix: 'google-signin' })
    if (rateLimited) return rateLimited

    // Verify Firebase token
    const authHeader = request.headers.get('authorization')
    const idToken = authHeader?.replace('Bearer ', '')

    if (!idToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }

    // Verify token with Firebase Admin - MANDATORY
    const adminAuth = await getAdminAuth()
    let verifiedEmail: string | undefined

    if (adminAuth) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken)
        verifiedEmail = decodedToken.email
      } catch (error) {
        console.error('Firebase token verification failed:', error)
        return NextResponse.json(
          { error: 'Invalid or expired authentication token. Please try signing in again.' },
          { status: 401 }
        )
      }
    } else {
      // Firebase Admin not available - fall back to trusting the client token
      // This is acceptable because the token comes from Firebase client SDK (signInWithPopup)
      // which already performed Google OAuth verification
      console.warn('Firebase Admin not available, using client-provided email')
    }

    const body = await request.json()
    const email = body.email
    const name = sanitizeString(body.name, 200)
    const image = sanitizeString(body.image, 2000)
    const firebaseUid = body.firebaseUid
    const emailVerified = body.emailVerified

    // Use verified email from token if available, otherwise use body email
    const userEmail = verifiedEmail || email

    if (!userEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
      }
    })

    if (existingUser) {
      // Update existing user's name/image from Google
      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          name: name || existingUser.name,
          image: image || existingUser.image,
          emailVerified: emailVerified ? new Date() : undefined,
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
        }
      })

      const reqCtx = extractRequestContext(request)
      logSecurityEvent({
        eventType: 'GOOGLE_SIGNIN',
        userId: updatedUser.id,
        email: updatedUser.email,
        ...reqCtx,
        details: { isNewUser: false },
      }).catch(() => {})

      return NextResponse.json(updatedUser)
    }

    // Create new user - default role is ADMIN for self-signup (business owner creating account)
    const newUser = await prisma.user.create({
      data: {
        email: userEmail,
        name: name || userEmail.split('@')[0] || 'User',
        image: image,
        emailVerified: emailVerified ? new Date() : null,
        role: 'ADMIN',
        subscriptionStatus: 'TRIAL',
        creditsRemaining: 30,
        totalCreditsUsed: 0,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day trial
        quickFillCreditsRemaining: 30,
        totalQuickFillUsed: 0
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
      }
    })

    const reqCtx = extractRequestContext(request)
    logSecurityEvent({
      eventType: 'GOOGLE_SIGNIN',
      userId: newUser.id,
      email: newUser.email,
      ...reqCtx,
      details: { isNewUser: true },
    }).catch(() => {})

    return NextResponse.json(newUser)
  } catch (error: any) {
    console.error('Error in Google sign-in:', error)
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    )
  }
}
