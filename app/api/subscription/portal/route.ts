/**
 * POST /api/subscription/portal
 * Create a Stripe Customer Billing Portal session and return the URL.
 * User can manage payment method, view invoices, update billing address.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: each billingPortal.sessions.create is a billable Stripe API
  // call — idempotency returns the same URL on retry instead of creating
  // a new portal session.
  return withIdempotency(request, userId, async () => {
    try {
      const ownerId = await getOrganizationOwner(userId);
      const targetUserId = ownerId || userId;

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { stripeCustomerId: true },
      });

      if (!user?.stripeCustomerId) {
        return NextResponse.json(
          { error: "No billing account found. Subscribe to a plan first." },
          { status: 400 },
        );
      }

      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      const returnUrl = `${baseUrl}/dashboard/subscription`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl,
      });

      return NextResponse.json({ url: portalSession.url });
    } catch (error) {
      console.error("Error creating billing portal session:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
