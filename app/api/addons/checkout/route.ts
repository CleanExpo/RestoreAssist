import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { rejectIfIOSCapacitor } from "@/lib/ios-billing-guard";
import { getAppUrl } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  // RA-1842 Path B — fail-closed for iOS Capacitor.
  const iosBlocked = rejectIfIOSCapacitor(request);
  if (iosBlocked) return iosBlocked;

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // Rate limit: 10 addon purchases per 15 minutes per user
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "addon-checkout",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: idempotency prevents duplicate addon purchases + stranded
  // Stripe sessions on client retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      // RA-6967/6968: build success/cancel URLs from a trusted base, never
      // from the attacker-influencable Origin/Host request headers (which
      // could redirect the buyer to a phishing origin after payment).
      const baseUrl = getAppUrl();

      let parsedBody: { addonKey?: string } = {};
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { addonKey } = parsedBody;

      if (!addonKey) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Add-on key is required",
          status: 400,
        });
      }

      // Validate addon key
      const addon =
        PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons];
      if (!addon) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid add-on",
          status: 400,
        });
      }

      // Check if user has active subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionStatus: true,
          stripeCustomerId: true,
          subscriptionId: true,
        },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      if (user.subscriptionStatus !== "ACTIVE") {
        // Preserve upgradeRequired flag for client UX
        return NextResponse.json(
          {
            error: "Active subscription required to purchase add-ons",
            upgradeRequired: true,
          },
          { status: 403 },
        );
      }

      let customerId = user.stripeCustomerId;

      // If no Stripe customer ID exists, create one
      if (!customerId) {
        try {
          const stripeCustomer = await stripe.customers.create({
            email: session.user.email!,
            name: session.user.name || undefined,
            metadata: {
              userId: userId,
            },
          });
          customerId = stripeCustomer.id;

          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
        } catch (stripeError) {
          return fromException(request, stripeError, {
            stage: "stripe-customer-create",
          });
        }
      }

      // Create one-time payment checkout session for add-on
      try {
        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "payment", // One-time payment, not subscription
          payment_method_types: ["card"],
          customer: customerId,
          // RA-6967 — price the add-on inline instead of creating a new
          // Stripe Price object on every checkout (that leaked an unbounded
          // number of one-off Prices into the account). Mirrors the
          // checkout-lifetime inline price_data pattern.
          line_items: [
            {
              price_data: {
                currency: addon.currency.toLowerCase(),
                unit_amount: Math.round(addon.amount * 100), // Convert to cents
                // RA-6791 — addon prices are GST-inclusive (AU convention), so
                // Stripe Tax breaks out the 10 % GST component rather than
                // adding it on top of the displayed amount.
                tax_behavior: "inclusive" as const,
                product_data: {
                  name: addon.name,
                  metadata: {
                    description: addon.description,
                    addonKey: addonKey,
                    reportLimit: addon.reportLimit.toString(),
                  },
                },
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/dashboard/success?addon=${addonKey}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
          metadata: {
            userId: userId,
            addonKey: addonKey,
            addonReports: addon.reportLimit.toString(),
            type: "addon",
          },
          // RA-6791 — AU GST compliance for one-time addon purchases. Stripe
          // Tax auto-applies 10 % GST; tax_id_collection captures the buyer's
          // ABN for input-credit claims and an ATO-compliant tax invoice.
          // customer_update lets automatic_tax read the saved name/address.
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          customer_update: { name: "auto", address: "auto" },
          payment_intent_data: {
            metadata: {
              userId: userId,
              addonKey: addonKey,
              addonReports: addon.reportLimit.toString(),
              type: "addon",
            },
          },
        });

        // Preserve rich Stripe success payload (sessionId, url)
        return NextResponse.json({
          sessionId: checkoutSession.id,
          url: checkoutSession.url,
        });
      } catch (stripeError) {
        return fromException(request, stripeError, {
          stage: "stripe-checkout-create",
        });
      }
    } catch (err) {
      return fromException(request, err, { stage: "checkout" });
    }
  });
}
