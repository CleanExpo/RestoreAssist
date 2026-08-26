/**
 * RA-1552 — exponential-backoff retry wrapper for transactional email.
 *
 * Transactional email paths (welcome, password reset, Google signin,
 * team invite) historically did `sendEmail(...).catch(() => {})` so a
 * transient Mailtrap outage silently dropped the mail. This helper
 * retries up to `maxAttempts` with jittered exponential backoff (200ms,
 * 600ms, 1800ms) and re-throws on final failure so callers can surface
 * "email delivery failed — your account is created, please request a
 * resend" instead of pretending success.
 *
 * Not a durable queue — that lives in a follow-up (RA-1552 full scope).
 * This is the minimal fix for serverless handlers that need best-effort
 * retry within the request lifecycle.
 */

import { reportError } from "@/lib/observability";

export interface EmailRetryOptions {
  maxAttempts?: number;
  /** Base delay in ms — jitter is applied on top. Default 200ms. */
  baseDelayMs?: number;
  /** Stage tag for observability (e.g. "signup-welcome", "invite"). */
  stage: string;
}

function jitteredDelay(attempt: number, baseMs: number): number {
  const exp = Math.pow(3, attempt); // 1, 3, 9
  const jitter = Math.random() * baseMs;
  return baseMs * exp + jitter;
}

export function hasProviderReceipt(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (!value || typeof value !== "object") return false;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim().length > 0;
}

export async function sendWithRetry<T>(
  send: () => Promise<T>,
  opts: EmailRetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await send();
      if (!hasProviderReceipt(result)) {
        // A missing receipt is not a proven rejection. The provider may have
        // accepted the message and lost the response, so retrying can send a
        // duplicate. Fail immediately; durable callers reconcile ambiguity.
        throw new Error(
          "Email provider did not return a confirmed message ID",
        );
      }
      return result;
    } catch (err) {
      lastErr = err;
      const ambiguousReceipt =
        err instanceof Error &&
        err.message === "Email provider did not return a confirmed message ID";
      reportError(err, {
        stage: opts.stage,
        attempt,
        retrying: attempt < maxAttempts - 1,
      });
      if (ambiguousReceipt || attempt === maxAttempts - 1) break;
      await new Promise((r) =>
        setTimeout(r, jitteredDelay(attempt, baseDelayMs)),
      );
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        `Email send failed after ${maxAttempts} attempts: ${String(lastErr)}`,
      );
}
