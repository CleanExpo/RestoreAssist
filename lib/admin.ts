/**
 * Admin utilities - Check if a user is an admin/owner
 * Admins get unlimited access without subscription
 */

/**
 * Get list of admin emails from environment variable
 * Format: comma-separated emails
 * Example: ADMIN_EMAILS="phill.mcgurk@gmail.com,admin@example.com"
 */
export function getAdminEmails(): string[] {
  const adminEmailsEnv = process.env.ADMIN_EMAILS || ''

  return adminEmailsEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0)
}

/**
 * Check if an email belongs to an admin
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false

  const adminEmails = getAdminEmails()
  const normalizedEmail = email.trim().toLowerCase()

  return adminEmails.includes(normalizedEmail)
}

/**
 * Check if a user is an admin (has unlimited access)
 * Returns true if user's email is in ADMIN_EMAILS env var
 */
export function isAdmin(user: { email?: string | null } | null | undefined): boolean {
  if (!user?.email) return false

  return isAdminEmail(user.email)
}
