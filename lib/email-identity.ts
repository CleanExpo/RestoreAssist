import type { Prisma } from "@prisma/client";

/** Canonical identity used by every account/invitation boundary. */
export function canonicalEmail(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

/** The length cap every email route already applied before RA-8404. */
export const MAX_EMAIL_LENGTH = 320;

/*
 * One "@", a local part and a dotted domain. Either part may hold ' & + and
 * similar characters; neither may hold < > " whitespace or control characters,
 * so a value that would need HTML encoding is refused rather than rewritten.
 */
const EMAIL_SHAPE =
  /^[^\s@<>"\p{Cc}]+@[^\s@<>"\p{Cc}]+\.[^\s@<>"\p{Cc}]+$/u;

export type ParsedEmail =
  | { ok: true; email: string }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * RA-8404: the single parser for an email address arriving from a request.
 *
 * An email address is an identity, not display text. It is checked and
 * canonicalised, never stripped or entity-encoded: `sanitizeString` turned
 * `o'brien@x.com` into `o&#x27;brien@x.com`, which no login could find.
 */
export function parseEmail(input: unknown): ParsedEmail {
  if (typeof input !== "string") return { ok: false, reason: "missing" };
  const email = canonicalEmail(input);
  if (!email) return { ok: false, reason: "missing" };
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, email };
}

/**
 * Serialises User and UserInvite writes for one canonical email. Both sides of
 * the registration/invitation race must take this transaction-scoped lock.
 */
export async function lockEmailIdentity(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<void> {
  const canonical = canonicalEmail(email);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${canonical}, 0))`;
}
