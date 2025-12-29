import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Verify email exists for password reset
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Email verified'
    })
  } catch (error: any) {
    console.error('Error in forgot password:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

