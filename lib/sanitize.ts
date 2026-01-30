/**
 * Lightweight input sanitization for server-side use.
 * Strips HTML tags and encodes dangerous entities to prevent XSS.
 * Prisma ORM already prevents SQL injection via parameterized queries.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
}

/**
 * Sanitize a string by stripping HTML tags and encoding entities.
 */
export function sanitizeString(
  input: unknown,
  maxLength: number = 10000
): string {
  if (typeof input !== "string") return ""
  return input
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[&<>"']/g, (char) => HTML_ENTITY_MAP[char] || char)
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitize specified string fields on an object.
 * Non-string fields and fields not in the list are left unchanged.
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
  maxLength: number = 10000
): T {
  const result = { ...obj }
  for (const field of fields) {
    const value = result[field]
    if (typeof value === "string") {
      ;(result as Record<string, unknown>)[field as string] = sanitizeString(
        value,
        maxLength
      )
    }
  }
  return result
}
