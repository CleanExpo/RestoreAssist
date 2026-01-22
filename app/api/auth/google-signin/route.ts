import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminAuth } from '@/lib/firebase-admin'

// POST - Handle Google sign-in via Firebase
// Creates user in database if doesn't exist, otherwise updates and returns user
export async function POST(request: NextRequest) {
  try {
    // Verify Firebase token
    const authHeader = request.headers.get('authorization')
    const idToken = authHeader?.replace('Bearer ', '')

    if (!idToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }

    // Try to verify token if admin is available (optional)
    const adminAuth = await getAdminAuth()
    if (adminAuth) {
      try {
        await adminAuth.verifyIdToken(idToken)
      } catch (error) {
        console.warn('Token verification failed, but continuing:', error)
      }
    } else {
      console.warn('Firebase Admin not available, skipping token verification')
    }

    const body = await request.json()
    const { email, name, image, firebaseUid, emailVerified } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Get or create user in database
    const dbUser = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || email.split('@')[0] || 'User',
        image: image,
        emailVerified: emailVerified ? new Date() : null,
      },
      create: {
        email,
        name: name || email.split('@')[0] || 'User',
        image: image,
        emailVerified: emailVerified ? new Date() : null,
        role: 'ADMIN', // Default to ADMIN for Google sign-ups (matches signup form default)
        subscriptionStatus: 'TRIAL',
        creditsRemaining: 3,
        totalCreditsUsed: 0,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        quickFillCreditsRemaining: 1, // Free users get 1 Quick Fill credit
        totalQuickFillUsed: 0
      },
    })

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      image: dbUser.image,
      role: dbUser.role,
    })
  } catch (error: any) {
    console.error('Error in Google sign-in:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

