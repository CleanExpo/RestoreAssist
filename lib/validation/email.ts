/**
 * RA-8516: the one email check for an organisation's office (business)
 * email, used when it is saved (organisation profile, setup wizard) and when
 * the RA-8503 office notice and RA-8497 booking notice are sent.
 *
 * It reuses zod's email parser, which the repo already uses for invites and
 * support tickets, instead of a hand-rolled pattern. That parser refuses a
 * list ("office@example.com,other.invalid"), a doubled dot
 * ("office@example..com"), spaces, and a domain with no dot or a one-letter
 * top-level part.
 */

import { z } from "zod";

/** RFC 5321 caps a forward path at 254 characters. */
export const MAX_EMAIL_LENGTH = 254;

const emailSchema = z.string().email().max(MAX_EMAIL_LENGTH);

/** The trimmed address when it is a single valid email, else null. */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return emailSchema.safeParse(trimmed).success ? trimmed : null;
}
