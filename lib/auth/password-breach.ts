/**
 * RA-1591 — Have-I-Been-Pwned password breach check (k-anonymity).
 *
 * HIBP exposes /api/v3/range/{first-5-chars-of-sha1} which returns
 * every SHA-1 suffix in that bucket with the occurrence count. We
 * never send the full password or full hash — just the first 5 hex
 * chars — so HIBP learns nothing about what we're checking and we
 * still get a binary "is this password in a known breach" answer.
 *
 * Contract:
 *   - `checkPasswordBreached(password)` returns
 *     `{ breached: boolean, occurrences: number }`.
 *   - Network failures / HIBP outages FAIL OPEN — we don't hold up a
 *     password change because an external service is down. The caller
 *     still writes the password after this check, so a fail-open
 *     registration is no worse than pre-RA-1591 behaviour.
 *   - 6 second timeout on the lookup — HIBP is usually <150ms; a
 *     hang means we're better off skipping than blocking the user.
 *
 * Callers can treat any `occurrences > 0` as breached. HIBP itself
 * uses a 5+ threshold in some guidance; we surface the raw count so
 * the caller can pick its own threshold.
 */

const HIBP_URL = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 6000;

export interface BreachCheckResult {
  breached: boolean;
  occurrences: number;
  /** True when the check could not be completed (network, timeout, etc). */
  skipped: boolean;
}

async function sha1Hex(input: string): Promise<string> {
  // Node / Next.js server runtime has Web Crypto on globalThis.
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function checkPasswordBreached(
  password: string,
): Promise<BreachCheckResult> {
  if (!password) {
    return { breached: false, occurrences: 0, skipped: true };
  }
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

    const res = await fetch(HIBP_URL + prefix, {
      method: "GET",
      headers: { "Add-Padding": "true", "User-Agent": "RestoreAssist/1.0" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return { breached: false, occurrences: 0, skipped: true };
    }

    const body = await res.text();
    // Each line: SUFFIX:COUNT. `Add-Padding` pads the response with
    // dummy entries that have count=0 — we ignore those.
    for (const line of body.split(/\r?\n/)) {
      const [rowSuffix, rowCountStr] = line.split(":");
      if (rowSuffix && rowSuffix.toUpperCase() === suffix) {
        const count = parseInt(rowCountStr ?? "0", 10);
        if (Number.isFinite(count) && count > 0) {
          return { breached: true, occurrences: count, skipped: false };
        }
      }
    }
    return { breached: false, occurrences: 0, skipped: false };
  } catch {
    // AbortError, DNS failure, TLS error — fail open so the caller's
    // primary flow (register / reset) continues.
    return { breached: false, occurrences: 0, skipped: true };
  }
}

/**
 * Convenience wrapper. Returns null when the password is acceptable;
 * otherwise returns a user-facing error message the caller can drop
 * into a 400 response without reshaping.
 */
export async function rejectIfBreached(password: string): Promise<string | null> {
  const result = await checkPasswordBreached(password);
  if (result.breached) {
    return `This password has appeared in ${result.occurrences.toLocaleString("en-AU")} known data breaches. Please choose a different one — a password manager can help generate a strong unique password.`;
  }
  return null;
}
