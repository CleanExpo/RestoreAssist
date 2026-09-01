import { verifyPortalToken } from "@/lib/portal-token";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
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
 */
export async function resolvePortalInspectionId(
  token: string,
): Promise<string | null> {
  const portalAccount = await lookupPortalAccount(token);
  if (portalAccount) {
    const latest = await prisma.inspection.findFirst({
      where: { report: { clientId: portalAccount.clientId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest?.id) return latest.id;
  }

  const verified = verifyPortalToken(token);
  return verified?.inspectionId ?? null;
}
