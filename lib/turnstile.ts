/**
 * Cloudflare Turnstile — server-side CAPTCHA verifier.
 *
 * Closes RA-1286 (public unauthenticated endpoints need CAPTCHA, not just
 * IP rate limit). Reasons for Turnstile over reCAPTCHA:
 *   - Free tier has no usage cap
 *   - Privacy-preserving (no persistent identifiers)
 *   - No Google dependency
 *   - Honeypot + managed challenge + invisible modes all supported
 *
 * Env gate:
 *   - TURNSTILE_SECRET_KEY unset → verifier returns { ok: true, reason: "disabled" }
 *     (backward-compat; dev / staging without the key still work)
 *   - TURNSTILE_SECRET_KEY set → token required + verified against Cloudflare
 *
 * Spec: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true; disabled?: boolean }
  | { ok: false; reason: string };

/**
 * Verify a Turnstile token against Cloudflare. Returns { ok: true } on success.
 * When TURNSTILE_SECRET_KEY is not configured, silently returns ok (backward
 * compat — callers opt-in to CAPTCHA by setting the env).
 *
 * @param token  The `cf-turnstile-response` value from the client widget
 * @param remoteIp Optional — pass request client IP for stricter verification
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // No key configured — soft-allow. Callers get ok=true with a flag so
    // they can log that CAPTCHA was bypassed.
    return { ok: true, disabled: true };
  }

  if (!token || typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "CAPTCHA token missing" };
  }

  // Cap the token at a sane length to prevent oversized-POST attacks
  // against Cloudflare's endpoint from our IP.
  if (token.length > 2048) {
    return { ok: false, reason: "CAPTCHA token too long" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let data: {
    success?: boolean;
    "error-codes"?: string[];
    challenge_ts?: string;
    hostname?: string;
  };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      // Cloudflare should always return 200 even for invalid tokens, so a
      // non-200 indicates an outage. Fail-closed — the whole point of the
      // CAPTCHA is to protect these endpoints during abuse spikes, which
      // are exactly when we want strictness.
      return {
        ok: false,
        reason: `CAPTCHA verifier returned HTTP ${res.status}`,
      };
    }
    data = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `CAPTCHA verifier error: ${msg}` };
  }

  if (data.success !== true) {
    const codes = data["error-codes"]?.join(", ") ?? "unknown";
    return { ok: false, reason: `CAPTCHA rejected (${codes})` };
  }

  return { ok: true };
}
