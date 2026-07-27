/**
 * Browser-side session helpers for the homeowner portal JWT.
 *
 * The token is stored in localStorage (product decision: simple JWT, no
 * NextAuth) and attached to /api/portal/* calls as a Bearer header via
 * portalFetch(). All helpers no-op safely during SSR.
 */

const STORAGE_KEY = "ra_portal_token";

export interface StoredClientSession {
  clientUserId: string;
  clientId: string;
  email: string;
  name: string;
  /** Unix seconds */
  expiresAt: number;
}

export function storeClientToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, token);
}

export function getClientToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function clearClientToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Decode (without verifying — the server verifies) the stored token for
 * display purposes and local expiry checks. Returns null when the token is
 * missing, malformed, or expired.
 */
export function getStoredClientSession(): StoredClientSession | null {
  const token = getClientToken();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;

    const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;
    if (expiresAt * 1000 <= Date.now()) {
      clearClientToken();
      return null;
    }
    if (typeof payload.sub !== "string" || typeof payload.clientId !== "string") {
      return null;
    }
    return {
      clientUserId: payload.sub,
      clientId: payload.clientId,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * fetch() wrapper that attaches the portal bearer token. On a 401 the token
 * is cleared so the caller's next render redirects to /portal/login.
 */
export async function portalFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getClientToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) clearClientToken();
  return response;
}
