import { verifyPortalToken } from "@/lib/portal-token";
import {
  lookupPortalAccount,
  type PortalAccessMode,
} from "@/lib/portal/lookup-portal-account";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a client-portal token to the inspection it grants access to.
 *
 * Extracted from `app/portal/[token]/page.tsx` when the `/learn` kiosk needed
 * the same lookup. Two routes copy-pasting this is how they drift: the legacy
 * fallback below is subtle, and a fix applied to one page and not the other
 * would leave half the portal honouring a rotated token and half not.
 *
 * Lookup order (RA-4861):
 *   1. ClientPortalAccount — the current, revocable, rotatable, client-scoped
 *      token. Inspection has no direct `clientId`; it links to Client through
 *      `Report.clientId`, so the newest matching inspection is used.
 *   2. The legacy HMAC inspection-scoped tokens minted by `lib/portal-token.ts`.
 *      Existing links in the wild MUST keep working — they are emailed with up
 *      to a 7-day TTL.
 *   3. Neither resolves: null, and the caller decides (404 or a friendly card).
 *
 * RA-7575 / RA-7606: PDF and portal HTML must use `resolvePortalAccess`.
 * A live ClientPortalAccount with no inspection yet is `unready`, not
 * `invalid`. `resolvePortalInspectionId` still collapses both to null —
 * do not use it to decide between LinkExpired and not-ready.
 *
 * RA-7634: `accessMode` tells the page whether to offer signing and uploads.
 * It comes from the account (an expiring link is INTERACTIVE, a no-expiry link
 * READ_ONLY). A legacy HMAC link is always READ_ONLY: nobody can revoke it, and
 * the sign/upload routes do not accept it anyway. Those links are no longer
 * issued and die at their 7-day expiry.
 */
export type PortalAccessResolution =
  | { kind: "inspection"; inspectionId: string; accessMode: PortalAccessMode }
  | { kind: "unready" }
  | { kind: "invalid" };

export async function resolvePortalAccess(
  token: string,
): Promise<PortalAccessResolution> {
  const portalAccount = await lookupPortalAccount(token);
  if (portalAccount) {
    const latest = await prisma.inspection.findFirst({
      where: { report: { clientId: portalAccount.clientId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest?.id) {
      return {
        kind: "inspection",
        inspectionId: latest.id,
        accessMode: portalAccount.accessMode,
      };
    }
    return { kind: "unready" };
  }

  const verified = verifyPortalToken(token);
  if (verified?.inspectionId) {
    return {
      kind: "inspection",
      inspectionId: verified.inspectionId,
      accessMode: "READ_ONLY",
    };
  }
  return { kind: "invalid" };
}

export async function resolvePortalInspectionId(
  token: string,
): Promise<string | null> {
  const resolved = await resolvePortalAccess(token);
  return resolved.kind === "inspection" ? resolved.inspectionId : null;
}
