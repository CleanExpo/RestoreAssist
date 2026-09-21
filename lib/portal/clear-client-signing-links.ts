import type { Prisma } from "@prisma/client";

/**
 * Signatory roles whose unsigned signing links the client portal hands out
 * (`GET /api/portal/[token]/authorities`). Anyone holding the portal link can
 * read these tokens, so they share the portal link's lifetime.
 */
export const PORTAL_SIGNATORY_ROLES = ["CLIENT", "PROPERTY_OWNER"] as const;

/**
 * RA-7634 — when staff revoke or rotate a client's portal link, the signing
 * links that portal link disclosed must die with it. Clears every UNSIGNED
 * client signing token for the client; signed rows keep their token and
 * signature. Must run inside the same transaction as the portal-account write
 * so the two can never disagree.
 *
 * Staff re-issue a signing link with the existing "send signature request"
 * action, which mints a fresh token.
 */
export async function clearClientSigningLinks(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<number> {
  const { count } = await tx.authorityFormSignature.updateMany({
    where: {
      instance: { report: { clientId } },
      signatoryRole: { in: [...PORTAL_SIGNATORY_ROLES] },
      signedAt: null,
      signatureRequestToken: { not: null },
    },
    data: { signatureRequestToken: null },
  });
  return count;
}
