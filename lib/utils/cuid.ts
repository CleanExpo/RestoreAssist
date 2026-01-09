/**
 * Collision-resistant IDs generator
 * Simple implementation compatible with Prisma @cuid()
 */

export function cuid(): string {
  // Format: c + timestamp (base36) + counter (base36) + random (base36)
  const timestamp = Date.now().toString(36)
  const counter = Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')
  const random = Math.random().toString(36).substring(2, 8)

  return `c${timestamp}${counter}${random}`
}

/**
 * Generate unique ID for forms
 */
export function generateFormId(): string {
  return `form_${cuid()}`
}

/**
 * Generate unique ID for submissions
 */
export function generateSubmissionId(): string {
  return `sub_${cuid()}`
}

/**
 * Generate unique ID for signatures
 */
export function generateSignatureId(): string {
  return `sig_${cuid()}`
}
