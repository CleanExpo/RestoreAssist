import type { NextRequest, NextResponse } from "next/server";
import { apiError, fromException } from "@/lib/api-errors";
import { getOrganizationOwner } from "@/lib/organization-credits";

/**
 * Billing belongs to the business owner (walkthrough finding 5, WP-06).
 *
 * Staff resolve to the owner's plan, so a checkout, portal session or
 * cancellation started by a technician or manager either does nothing useful
 * (a $99 subscription that unlocks nothing) or acts on the owner's Stripe
 * customer. Refuse before any Stripe call.
 *
 * `getOrganizationOwner` returns the caller's own id for an ADMIN, the
 * organisation owner for staff, and null for someone in no organisation. Only
 * the second case is refused: a solo operator pays for themselves.
 */
export async function refuseNonOwner(
  request: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  try {
    const ownerId = await getOrganizationOwner(userId);
    if (ownerId !== null && ownerId !== userId) {
      return apiError(request, {
        code: "FORBIDDEN",
        message:
          "Billing is managed by your business owner. Ask them to make this change.",
        status: 403,
      });
    }
    return null;
  } catch (error) {
    // Fail closed: if the owner cannot be established, nothing reaches Stripe.
    return fromException(request, error, { stage: "billing-owner-check" });
  }
}
