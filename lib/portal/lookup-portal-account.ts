/**
 * RA-4861 — server-side helper to look up a ClientPortalAccount by token.
 *
 * Single source of truth for the `/portal/[token]` page (and any future
 * portal-scoped routes). Extracted into a thin library so it can be
 * unit-tested without spinning the Next.js page renderer.
 *
 * Behaviour:
 *   - Returns `null` when the token is missing, malformed, not in the
 *     DB, or attached to a revoked account.
 *   - RA-7634: `accessMode` is "INTERACTIVE" only for a link that carries an
 *     expiry (every link issued or re-sent by staff). A grandfathered link
 *     with no expiry is "READ_ONLY": the client can still view the claim,
 *     but cannot sign or upload.
 *   - On success, stamps `lastAccessedAt = NOW()` so admins can spot
 *     dormant portals (best-effort; failure to write the timestamp must
 *     NOT block the read — the user still gets their page).
 *
 * The token field is stored verbatim (no hashing) — see model comment
 * in `prisma/schema.prisma`. We rely on the @unique index for both
 * lookup speed and a constant-time DB-level comparison.
 */

import { prisma } from "@/lib/prisma";

export interface PortalAccountLookupResult {
  id: string;
  clientId: string;
  createdAt: Date;
  tokenRotatedAt: Date | null;
  expiresAt: Date | null;
  accessMode: PortalAccessMode;
}

export type PortalAccessMode = "READ_ONLY" | "INTERACTIVE";

export async function lookupPortalAccount(
  token: string | null | undefined,
): Promise<PortalAccountLookupResult | null> {
  if (!token || typeof token !== "string" || token.length === 0) {
    return null;
  }

  // Explicit `select` per CLAUDE.md rule #4 — never leak the raw token
  // back to the caller.
  const account = await prisma.clientPortalAccount.findFirst({
    where: { token, revokedAt: null },
    select: {
      id: true,
      clientId: true,
      createdAt: true,
      tokenRotatedAt: true,
      expiresAt: true,
    },
  });

  if (!account) return null;

  // Security review must-fix: reject expired links. Null expiresAt = legacy
  // read-only links, grandfathered (no expiry was ever set on them).
  if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Best-effort access-time stamp. Failure must not block the user —
  // the portal page renders even if this write fails.
  try {
    await prisma.clientPortalAccount.update({
      where: { id: account.id },
      data: { lastAccessedAt: new Date() },
    });
  } catch {
    // Swallow — stamp is observability, not correctness.
  }

  return {
    ...account,
    // Fail closed: anything but a real expiry date is view-only.
    accessMode: account.expiresAt instanceof Date ? "INTERACTIVE" : "READ_ONLY",
  };
}
