/**
 * RA-8665 — the one rule for whether add-on checkout would find a workspace
 * to file a purchase on. Read-only: it never creates or promotes anything.
 *
 * POST /api/addons/checkout calls it before it creates a Stripe customer, and
 * refuses with 404 when it says no. GET /api/addons/catalog calls it so a card
 * never offers a purchase that checkout would refuse for want of a workspace.
 * Neither copies the rule.
 *
 * - A pack that is not a seat: checkout files it on getWorkspaceForUser's
 *   workspace, so the answer is whether that finds one.
 * - A seat: checkout runs ensureWorkspaceForUser, then seatWorkspaceFor (the
 *   owner's oldest READY workspace). That finds one when the owner already
 *   has a READY workspace, when the oldest owned workspace is PROVISIONING
 *   (ensureWorkspaceForUser promotes it), or when the owner has none and has
 *   an email (ensureWorkspaceForUser provisions one). An oldest workspace in
 *   any other state, such as SUSPENDED, is never promoted, so with no READY
 *   workspace checkout would answer 404.
 */

import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { seatWorkspaceFor } from "@/lib/billing/technician-seats";

export const CHECKOUT_NO_WORKSPACE_MESSAGE = "No workspace found for this account";

export async function addonCheckoutHasWorkspace(
  userId: string,
  perSeat: boolean,
): Promise<boolean> {
  if (!perSeat) return (await getWorkspaceForUser(userId)) !== null;

  if (await seatWorkspaceFor(prisma, userId)) return true;
  const oldest = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { status: true },
    orderBy: { createdAt: "asc" },
  });
  if (oldest) return oldest.status === "PROVISIONING";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return !!user?.email;
}
