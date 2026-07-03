import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { rejectIfIOSCapacitor } from "@/lib/ios-billing-guard";
import { apiError, fromException } from "@/lib/api-errors";
import { PRICING_CONFIG } from "@/lib/pricing";

// R3 — server-authoritative price allowlist. The client may only ask for a
// priceId that is in this fixed set (the single $99 Monthly Plan). Any other
// id is rejected 400 and NO Stripe price/session is created. There is no
// dynamic price creation: an unset STRIPE_PRICE_MONTHLY fails closed at Stripe
// rather than fabricating a price.
const ALLOWED_PRICE_IDS = new Set<string>(
  [PRICING_CONFIG.prices.monthly].filter(Boolean),
);

export async function POST(request: NextRequest) {
  // RA-1842 Path B — Apple guideline 3.1.1 compliance. iOS Capacitor
  // shell sends X-Capacitor-Platform: ios on every same-origin fetch;
  // reject with 403 before any Stripe call.
  const iosBlocked = rejectIfIOSCapacitor(request);
  if (iosBlocked) return iosBlocked;

  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "checkout",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: subscription checkout — retried POST leaves stranded
  // Stripe sessions and double-bills when the user eventually completes.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      // RA-1343: trust only NEXTAUTH_URL (or APP_URL fallback) for Stripe
      // success/cancel URLs. Previously fell back to Host/Origin headers,
      // which on a misconfigured deploy let an attacker supply evil.com as
      // the Host header and receive a Stripe Checkout redirect to a
      // look-alike success page that captures the ?session_id and pivots.
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.APP_URL ||
        (process.env.NODE_ENV === "production"
          ? "https://restoreassist.app"
          : "http://localhost:3000");

      let parsed: { priceId?: string } = {};
      try {
        const raw: unknown = rawBody ? JSON.parse(rawBody) : {};
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Request body must be a JSON object",
            status: 400,
          });
        }
        parsed = raw as { priceId?: string };
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { priceId } = parsed;

      if (!priceId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Price ID is required",
          status: 400,
        });
      }

      // R3 — reject any priceId outside the fixed server allowlist BEFORE any
      // Stripe call. A client cannot supply an arbitrary price and the server
      // never creates a dynamic price.
      if (!ALLOWED_PRICE_IDS.has(priceId)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Unknown or unsupported plan",
          status: 400,
        });
      }

      // Get user's Stripe customer ID
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });

      let customerId = user?.stripeCustomerId;

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

          // Update user with Stripe customer ID
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
        } catch (stripeError) {
          return apiError(request, {
            code: "UPSTREAM_FAILED",
            message: "Failed to create customer",
            status: 500,
            err: stripeError,
            stage: "create-stripe-customer",
          });
        }
      }

      // R7 / F4 — double-subscription guard. Read Stripe (not the drifted
      // local subscriptionStatus): if the customer already has a live
      // active/trialing subscription, do NOT create a second one — route them
      // to the billing portal to change plans instead. This covers users
      // whose local status is TRIAL/PAST_DUE but who hold a live Stripe sub.
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
      });
      const hasLiveSub = existingSubs.data.some(
        (sub) => sub.status === "active" || sub.status === "trialing",
      );
      if (hasLiveSub) {
        let portalUrl: string | null = null;
        try {
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/dashboard/subscription`,
          });
          portalUrl = portalSession.url;
        } catch (portalErr) {
          console.error(
            "[create-checkout-session] portal session create failed (non-fatal):",
            portalErr instanceof Error ? portalErr.message : portalErr,
          );
        }
        return NextResponse.json(
          {
            error: "You already have an active subscription.",
            portalRequired: true,
            url: portalUrl,
          },
          { status: 409 },
        );
      }

      // Create Stripe checkout session. The price is a fixed allowlisted id —
      // no dynamic price creation (R3).
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
        metadata: {
          userId: userId,
        },
        // RA-1351 — AU GST compliance. Stripe Tax auto-applies 10 % GST
        // to AU customers / 15 % to NZ. Plan prices are GST-inclusive,
        // so tax_behavior=inclusive prevents double-charging. ABN
        // collection lets AU business customers claim input credits.
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
      });

      return NextResponse.json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId: customerId,
      });
    } catch (error) {
      return fromException(request, error, {
        stage: "create-checkout-session",
      });
    }
  });
}
