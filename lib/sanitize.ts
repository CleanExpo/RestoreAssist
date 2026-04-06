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
 * Validate an Australian Business Number using the ATO weighted-sum algorithm.
 *
 * Algorithm (per ATO): subtract 1 from first digit, multiply each of the 11
 * digits by the corresponding weight, sum products, divide by 89 — remainder
 * must be 0.
 *
 * Returns true if the ABN is structurally valid; does NOT check ATO registration.
 */
export function isValidABN(abn: unknown): boolean {
  if (typeof abn !== "string") return false
  const digits = abn.replace(/\s/g, "") // strip spaces
  if (!/^\d{11}$/.test(digits)) return false

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const d = digits.split("").map(Number)
  d[0] -= 1 // subtract 1 from first digit per ATO spec
  const sum = d.reduce((acc, digit, i) => acc + digit * weights[i], 0)
  return sum % 89 === 0
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
