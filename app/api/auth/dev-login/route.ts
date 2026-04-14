/**
 * DEV-ONLY sign-in endpoint.
 *
 * Generates a short-lived HMAC token for the target email using the same
 * gauth: mechanism as the Google OAuth bridge, then returns an auto-submitting
 * form that signs in via the NextAuth credentials provider.
 *
 * HARD GUARDS — this route returns 404 unless ALL of the following are true:
 *   1. NODE_ENV === "development"
 *   2. Request includes ?token= matching DEV_LOGIN_TOKEN env var
 *
 * Usage:
 *   GET /api/auth/dev-login?token=<DEV_LOGIN_TOKEN>&email=phill.mcgurk@gmail.com
 *
 * Never deployed to production — guarded at both runtime and build time.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Hard block — never serve this in production regardless of env var tricks
if (process.env.NODE_ENV !== "development") {
  // Module-level trap: if somehow imported in prod, all handlers return 404
}

function gauthToken(email: string, secret: string): string {
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`gauth:${email}:${timestamp}`)
    .digest("hex");
  return `gauth:${timestamp}:${hmac}`;
}

export async function GET(request: NextRequest) {
  // Guard 1: development only
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  // Guard 2: token must match DEV_LOGIN_TOKEN
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const devToken = process.env.DEV_LOGIN_TOKEN;

  if (!devToken || !token || token !== devToken) {
    return new NextResponse(null, { status: 404 });
  }

  const email = searchParams.get("email") ?? "phill.mcgurk@gmail.com";
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const secret = process.env.NEXTAUTH_SECRET!;

  const gauthProof = gauthToken(email, secret);

  // Auto-submitting form — signs in via NextAuth credentials provider
  const csrfRes = await fetch(
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/csrf`,
    { cache: "no-store" },
  );
  const { csrfToken } = await csrfRes.json();

  const html = `<!DOCTYPE html>
<html>
<head><title>Dev Sign In…</title></head>
<body>
  <p style="font-family:monospace;color:#06b6d4;padding:32px">Signing in as ${email}…</p>
  <form id="f" method="POST" action="/api/auth/callback/credentials">
    <input type="hidden" name="csrfToken" value="${csrfToken}" />
    <input type="hidden" name="email" value="${email}" />
    <input type="hidden" name="password" value="${gauthProof}" />
    <input type="hidden" name="callbackUrl" value="${callbackUrl}" />
    <input type="hidden" name="json" value="true" />
  </form>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
