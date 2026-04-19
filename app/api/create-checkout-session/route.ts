import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(request: NextRequest) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const { priceId } = parsed;

      if (!priceId) {
        return NextResponse.json(
          { error: "Price ID is required" },
          { status: 400 },
        );
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
          console.error("Error creating Stripe customer:", stripeError);
          return NextResponse.json(
            { error: "Failed to create customer" },
            { status: 500 },
          );
        }
      }

      // Create Stripe checkout session
      let checkoutSession;
      try {
        checkoutSession = await stripe.checkout.sessions.create({
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
        });
      } catch (priceError: any) {
        // If price doesn't exist, create it dynamically
        if (priceError.code === "resource_missing") {
          // Create price based on the priceId
          let priceData;
          if (priceId === "MONTHLY_PLAN" || priceId.includes("MONTHLY")) {
            priceData = {
              unit_amount: 9900, // $99.00 in cents
              currency: "aud",
              recurring: { interval: "month" as const },
              product_data: {
                name: "Monthly Plan - 50 Reports",
              },
            };
          } else if (priceId === "YEARLY_PLAN" || priceId.includes("YEARLY")) {
            priceData = {
              unit_amount: 118800, // $1188.00 in cents
              currency: "aud",
              recurring: { interval: "year" as const },
              product_data: {
                name: "Yearly Plan - 70 Reports/Month",
              },
            };
          } else {
            throw new Error("Invalid price ID");
          }

          const newPrice = await stripe.prices.create(priceData as any);

          checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            customer: customerId,
            line_items: [
              {
                price: newPrice.id,
                quantity: 1,
              },
            ],
            success_url: `${baseUrl}/dashboard/success`,
            cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
            metadata: {
              userId: userId,
            },
          });
        } else {
          throw priceError;
        }
      }

      return NextResponse.json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId: customerId,
      });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
