/**
 * Lightweight input sanitization for server-side use.
 * Strips HTML tags and encodes dangerous entities to prevent XSS.
 * Prisma ORM already prevents SQL injection via parameterized queries.
 */

import { isValidAbn } from "@/lib/abn/checksum";

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

/**
 * Sanitize a string by stripping HTML tags and encoding entities.
 */
export function sanitizeString(
  input: unknown,
  maxLength: number = 10000,
): string {
  if (typeof input !== "string") return "";
  return input
    .replaceAll(String.fromCharCode(0), "") // RA-1805: strip null bytes rejected by Postgres TEXT/VARCHAR
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[&<>"']/g, (char) => HTML_ENTITY_MAP[char] || char)
    .trim()
    .slice(0, maxLength);
}

/**
 * Remove NUL bytes (U+0000), which Postgres TEXT/VARCHAR columns reject with
 * "08P01 insufficient data left in message". Unlike sanitizeString, this does
 * NOT strip HTML tags or entity-encode — it preserves the text verbatim, so it
 * is safe for storing free-text narratives (e.g. third-party job descriptions
 * where "RH < 40%" must survive intact).
 */
export function stripNullBytes(input: string): string {
  return input.replaceAll(String.fromCharCode(0), "");
}

/**
 * Remove unpaired UTF-16 surrogate code units — a high surrogate (U+D800–U+DBFF)
 * not followed by a low, or a low surrogate (U+DC00–U+DFFF) not preceded by a
 * high. These are invalid UTF-8 and Postgres TEXT/VARCHAR rejects them with the
 * SAME "08P01 insufficient data left in message" error as a NUL byte. Valid
 * surrogate PAIRS (emoji, astral-plane characters) are preserved.
 */
export function stripUnpairedSurrogates(input: string): string {
  return input.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

/**
 * Make free-text safe to store in a Postgres TEXT/VARCHAR column without
 * mangling it. Strips exactly the two character classes that trigger "08P01
 * insufficient data left in message" — NUL bytes (U+0000) and unpaired UTF-16
 * surrogates — while preserving all legitimate content (punctuation, emoji,
 * "RH < 40%"). Use for third-party narratives (e.g. Ascora job descriptions)
 * before an upsert; unlike sanitizeString it does NOT strip HTML or entity-encode.
 */
export function sanitizeForPostgresText(input: string): string {
  return stripUnpairedSurrogates(stripNullBytes(input));
}

/**
 * Validate an Australian Business Number using the ATO weighted-sum algorithm.
 *
 * Algorithm (per ATO): subtract 1 from first digit, multiply each of the 11
 * digits by the corresponding weight, sum products, divide by 89 — remainder
 * must be 0.
 *
 * Returns true if the ABN is structurally valid; does NOT check ATO registration.
 *
 * RA-6793: This is a thin delegate to the canonical implementation in
 * `lib/abn/checksum.ts` so the checksum logic cannot drift between the two
 * historically-duplicated validators. The legacy `isValidABN` export name is
 * retained for the existing call sites.
 */
export function isValidABN(abn: unknown): boolean {
  if (typeof abn !== "string") return false;
  return isValidAbn(abn);
}

/**
 * Sanitize specified string fields on an object.
 * Non-string fields and fields not in the list are left unchanged.
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
  maxLength: number = 10000,
): T {
  const result = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string") {
      (result as Record<string, unknown>)[field as string] = sanitizeString(
        value,
        maxLength,
      );
    }
  }
  return result;
}
