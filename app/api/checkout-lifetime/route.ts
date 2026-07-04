import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  LIFETIME_PRICING_EMAIL,
  LIFETIME_AMOUNT_CENTS,
  LIFETIME_PLAN_NAME,
} from "@/lib/lifetime-pricing";
import { withIdempotency } from "@/lib/idempotency";
import { rejectIfIOSCapacitor } from "@/lib/ios-billing-guard";
import { apiError, fromException } from "@/lib/api-errors";
import { getAppUrl } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  // RA-1842 Path B — fail-closed for iOS Capacitor.
  const iosBlocked = rejectIfIOSCapacitor(request);
  if (iosBlocked) return iosBlocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  if (
    session.user.email.toLowerCase() !== LIFETIME_PRICING_EMAIL.toLowerCase()
  ) {
    return apiError(request, {
      code: "FORBIDDEN",
      message: "This offer is not available for your account.",
      status: 403,
    });
  }

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "checkout-lifetime",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: lifetime checkout — critical billing flow, retry without
  // idempotency would create duplicate Stripe sessions.
  return withIdempotency(request, userId, async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true, lifetimeAccess: true },
      });

      if (user?.lifetimeAccess) {
        return apiError(request, {
          code: "VALIDATION",
          message: "You already have lifetime access.",
          status: 400,
        });
      }

      let customerId = user?.stripeCustomerId;
      if (!customerId) {
        const stripeCustomer = await stripe.customers.create({
          email: session.user.email,
          name: session.user.name || undefined,
          metadata: { userId: userId },
        });
        customerId = stripeCustomer.id;
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      // RA-6967 — build success/cancel URLs from a trusted base, never from
      // the attacker-influencable Origin/Host request headers.
      const baseUrl = getAppUrl();

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "aud",
              unit_amount: LIFETIME_AMOUNT_CENTS,
              // RA-1351 / RA-6791 — mark the one-time price GST-inclusive so
              // Stripe Tax doesn't add 10 % on top of the displayed amount.
              // The amount shown to the customer is GST-inclusive; the
              // ATO-compliant tax invoice breaks out the GST component.
              tax_behavior: "inclusive" as const,
              product_data: {
                name: `${LIFETIME_PLAN_NAME} - RestoreAssist`,
                description: "One-time lifetime access. No monthly fee.",
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/success?lifetime=1`,
        cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
        metadata: {
          userId: userId,
          type: "lifetime",
        },
        // RA-6967 — mirror userId/type onto the PaymentIntent so the webhook's
        // one-time-PI handling can key on payment_intent.metadata (a bare
        // PaymentIntent event has no Checkout Session metadata to read).
        payment_intent_data: {
          metadata: {
            userId: userId,
            type: "lifetime",
          },
        },
        // RA-6791 — AU GST compliance for one-time purchases. Stripe Tax
        // auto-applies 10 % GST to AU customers; tax_id_collection captures
        // the buyer's ABN so business customers can claim input credits and
        // the tax invoice is ATO-compliant. customer_update is required by
        // Stripe so automatic_tax can read the saved customer name/address.
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
      });

      return NextResponse.json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
      });
    } catch (error) {
      return fromException(request, error, { stage: "lifetime-checkout" });
    }
  });
}
