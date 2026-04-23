/**
 * RA-1595 — RFC 9116 `/.well-known/security.txt`.
 *
 * Served from a route handler rather than a static file so the
 * `Expires` field stays fresh on every build without manual edits.
 * Also lets us ship `text/plain; charset=utf-8` + a short cache
 * header without fighting Next's default static Content-Type
 * detection on the `.txt` extension.
 *
 * Contents purposely minimal:
 *   - Contact points lift from NEXT_PUBLIC_SECURITY_EMAIL with a safe
 *     fallback so local dev never serves a blank line.
 *   - Policy URL points at `/support` until a dedicated
 *     `/security-policy` page lands.
 *   - Expires field auto-rotates to 1 year from the time the module
 *     was evaluated (cold-start or build). 1 year is the RFC 9116
 *     maximum practical window; shorter is fine, longer is not.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86_400; // 1 day

function buildSecurityTxt(): string {
  const securityEmail =
    process.env.NEXT_PUBLIC_SECURITY_EMAIL || "security@restoreassist.app";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://restoreassist.app";
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return [
    `Contact: mailto:${securityEmail}`,
    `Expires: ${expires}`,
    `Preferred-Languages: en-AU, en`,
    `Canonical: ${appUrl}/.well-known/security.txt`,
    `Policy: ${appUrl}/support`,
    `# Security researcher disclosures are welcome. Please do not`,
    `# enumerate customer data, send spam, or test on production`,
    `# accounts you do not own. A 90-day coordinated-disclosure`,
    `# window applies before public write-ups.`,
    ``,
  ].join("\n");
}

export function GET() {
  return new NextResponse(buildSecurityTxt(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
