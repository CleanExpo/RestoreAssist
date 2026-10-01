/**
 * Same-origin allowlist for the `callbackUrl` query param on /login.
 *
 * Punch-list P1 #16 (RA-…): protected routes used to lose their
 * intended-destination on the redirect to /login. Middleware now appends
 * `?callbackUrl=<encoded path+search>` when bouncing unauthenticated traffic,
 * and the login page calls this validator before honouring it post-sign-in.
 *
 * Reject absolute/protocol-relative URLs and characters browsers normalise
 * into an external authority (backslashes and ASCII control characters).
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = "/dashboard",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
