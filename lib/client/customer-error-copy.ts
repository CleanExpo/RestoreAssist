/**
 * Plain-English wording for a failed request, safe to show to a customer.
 *
 * One owner for the rule: never print an HTTP status code or a developer
 * phrase. 401 means the session ended; 403 means the signed-in user has no
 * access (signing in again does not help, so it gets no sign-in prompt).
 */

import type { ParsedApiError } from "@/lib/client/parse-api-error";

export const SESSION_ENDED_MESSAGE =
  "Your session has ended. Sign in again to continue.";
export const NO_ACCESS_MESSAGE =
  "You do not have access to this workspace. Ask your administrator to add you, or switch to another account.";
export const NETWORK_MESSAGE =
  "We could not reach the server. Check your connection and try again.";
export const GENERIC_MESSAGE =
  "Something went wrong on our side. Try again in a moment.";

/** True when the wording still carries a status code or a bare fallback. */
function looksTechnical(message: string): boolean {
  return /\bHTTP\b|\b[45]\d{2}\b|Request failed/i.test(message);
}

export function customerErrorMessage(
  error: Pick<ParsedApiError, "status" | "message">,
): string {
  if (error.status === 401) return SESSION_ENDED_MESSAGE;
  if (error.status === 403) return NO_ACCESS_MESSAGE;
  if (!error.status) return NETWORK_MESSAGE;
  // A server fault carries internal wording ("Internal server error"); the
  // customer only needs to know it is not their doing and to try again.
  if (error.status >= 500) return GENERIC_MESSAGE;
  const message = error.message?.trim();
  if (message && !looksTechnical(message)) return message;
  return GENERIC_MESSAGE;
}

/** Customer wording for a bare status code, for code that has no parsed body. */
export function statusErrorMessage(status: number | undefined): string {
  return customerErrorMessage({ status: status ?? 0, message: "" });
}

/** Sign-in again helps only when the session ended. */
export function needsSignIn(error: Pick<ParsedApiError, "status"> | null): boolean {
  return error?.status === 401;
}
