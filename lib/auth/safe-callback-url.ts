/**
 * Same-origin allowlist for the `callbackUrl` query param on /login.
 *
 * Punch-list P1 #16 (RA-…): protected routes used to lose their
 * intended-destination on the redirect to /login. Middleware now appends
 * `?callbackUrl=<encoded path+search>` when bouncing unauthenticated traffic,
 * and the login page calls this validator before honouring it post-sign-in.
 *
 * Rule (simplest correct form per brief — do NOT add more checks):
 *   safe ⇔ path.startsWith("/") && !path.startsWith("//") && !path.includes("://")
 *
 * Rejects protocol-relative (`//evil.com`) and absolute (`https://evil.com`)
 * URLs that would otherwise navigate off-origin.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = "/dashboard",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}
