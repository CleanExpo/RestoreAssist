import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST - Reset password
export async function POST(request: NextRequest) {
  try {
    const { email, newPassword } = await request.json()

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: 'Email and new password are required' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update user password
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    })

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })
  } catch (error: any) {
    console.error('Error resetting password:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

