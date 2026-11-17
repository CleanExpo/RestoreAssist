// RA-8417 — the one owner of the staff password rule (RA-1258, RA-1342).
// Client-safe: screens and server routes both import from here. The
// known-leak check (RA-1591) is server-only and lives in password-breach.ts.

export const PASSWORD_MIN_LENGTH = 12;

/** Returns the reason a password breaks the rule, or null when it is fine. */
export function passwordRuleError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  return null;
}
