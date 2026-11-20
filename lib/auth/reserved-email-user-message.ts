/**
 * RA-8156 — registration/OAuth failures for reserved or placeholder emails.
 */

import { isDemoOrReservedRecipient } from "@/lib/email/reserved-recipient";

export function reservedEmailSignUpMessage(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return null;
  if (!isDemoOrReservedRecipient(trimmed)) return null;

  const domain = trimmed.slice(trimmed.lastIndexOf("@") + 1).toLowerCase();
  if (domain.endsWith(".test") || domain.endsWith(".invalid") || domain.endsWith(".example")) {
    return "That email domain is reserved for documentation (.test, .example, .invalid). Use your real work email.";
  }
  if (domain === "local" || domain.endsWith(".local")) {
    return "That address is a placeholder from an incomplete sign-in. Use the email from your Google or Apple account.";
  }
  return "That email cannot be used for a RestoreAssist account. Try a different address.";
}
