import crypto from 'crypto'

interface ResetCodeEntry {
  code: string
  expiresAt: number
  attempts: number
}

// In-memory store for reset codes
// In production, use Redis or database table
const resetCodes = new Map<string, ResetCodeEntry>()

// Clean up expired codes periodically
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [email, data] of resetCodes) {
      if (now > data.expiresAt) {
        resetCodes.delete(email)
      }
    }
  }, 5 * 60 * 1000)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref()
  }
}

export function generateResetCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

export function storeResetCode(email: string, code: string): void {
  ensureCleanup()
  resetCodes.set(email.toLowerCase(), {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    attempts: 0
  })
}

export function verifyResetCode(email: string, code: string): { valid: boolean; error?: string } {
  const entry = resetCodes.get(email.toLowerCase())

  if (!entry) {
    return { valid: false, error: 'No reset code found. Please request a new one.' }
  }

  if (Date.now() > entry.expiresAt) {
    resetCodes.delete(email.toLowerCase())
    return { valid: false, error: 'Reset code has expired. Please request a new one.' }
  }

  // Max 5 attempts to prevent brute force
  if (entry.attempts >= 5) {
    resetCodes.delete(email.toLowerCase())
    return { valid: false, error: 'Too many attempts. Please request a new code.' }
  }

  entry.attempts++

  if (entry.code !== code) {
    return { valid: false, error: 'Invalid verification code.' }
  }

  // Code is valid - consume it
  resetCodes.delete(email.toLowerCase())
  return { valid: true }
}
