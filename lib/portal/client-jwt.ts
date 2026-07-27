/**
 * Standalone JWT auth for homeowner portal accounts (ClientUser).
 *
 * Deliberately independent of NextAuth: the portal pages previously called
 * `signIn("client-credentials")` — a provider that was never registered in
 * lib/auth.ts, so password login never worked. Portal auth now issues its
 * own HS256 JWT which the browser stores in localStorage and sends as
 * `Authorization: Bearer <token>` to /api/portal/* routes.
 *
 * Scope: this token grants CLIENT-portal access only. It is never accepted
 * by contractor (dashboard) routes, and contractor NextAuth sessions are
 * never accepted here — the `typ` claim enforces the boundary.
 */

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const TOKEN_TYPE = "client-portal" as const;
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface ClientPortalClaims {
  /** ClientUser.id */
  sub: string;
  /** Client.id the account is bound to */
  clientId: string;
  email: string;
  name: string;
  typ: typeof TOKEN_TYPE;
}

function getSecret(): Uint8Array {
  const secret =
    process.env.CLIENT_PORTAL_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail closed: with no secret we can neither mint nor verify.
    throw new Error(
      "CLIENT_PORTAL_JWT_SECRET (or NEXTAUTH_SECRET) must be set for portal auth",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signClientPortalJwt(input: {
  clientUserId: string;
  clientId: string;
  email: string;
  name: string;
}): Promise<string> {
  return new SignJWT({
    clientId: input.clientId,
    email: input.email,
    name: input.name,
    typ: TOKEN_TYPE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.clientUserId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .sign(getSecret());
}

export async function verifyClientPortalJwt(
  token: string,
): Promise<ClientPortalClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (
      payload.typ !== TOKEN_TYPE ||
      typeof payload.sub !== "string" ||
      typeof payload.clientId !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      clientId: payload.clientId,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      typ: TOKEN_TYPE,
    };
  } catch {
    return null;
  }
}

/**
 * Read and verify the bearer token on a portal API request.
 * Returns the claims, or null when absent/invalid/expired.
 */
export async function authenticateClientRequest(
  request: NextRequest,
): Promise<ClientPortalClaims | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  return verifyClientPortalJwt(token);
}
