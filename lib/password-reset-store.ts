import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export function generateResetCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

export async function storeResetCode(email: string, code: string): Promise<void> {
  const normalizedEmail = email.toLowerCase()

  // Delete any existing unused codes for this email
  await prisma.passwordResetToken.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
  })

  // Create new reset code
  await prisma.passwordResetToken.create({
    data: {
      token: code,
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
    },
  })
}

export async function verifyResetCode(
  email: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase()

  const entry = await prisma.passwordResetToken.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!entry) {
    return { valid: false, error: 'No reset code found. Please request a new one.' }
  }

  if (new Date() > entry.expiresAt) {
    await prisma.passwordResetToken.delete({ where: { id: entry.id } })
    return { valid: false, error: 'Reset code has expired. Please request a new one.' }
  }

  // Max 5 attempts to prevent brute force
  if (entry.attempts >= 5) {
    await prisma.passwordResetToken.delete({ where: { id: entry.id } })
    return { valid: false, error: 'Too many attempts. Please request a new code.' }
  }

  // Increment attempts
  await prisma.passwordResetToken.update({
    where: { id: entry.id },
    data: { attempts: entry.attempts + 1 },
  })

  if (entry.token !== code) {
    return { valid: false, error: 'Invalid verification code.' }
  }

  // Code is valid - mark as used
  await prisma.passwordResetToken.update({
    where: { id: entry.id },
    data: { usedAt: new Date() },
  })

  return { valid: true }
}
