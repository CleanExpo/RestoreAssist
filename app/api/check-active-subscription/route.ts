import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { LIFETIME_PRICING_EMAIL } from "@/lib/lifetime-pricing";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

function subPeriodEnd(sub: import("stripe").Stripe.Subscription): number {
  return (
    (sub.items.data[0] as any)?.current_period_end ??
    (sub as any).current_period_end ??
    0
  );
}
function subPeriodStart(sub: import("stripe").Stripe.Subscription): number {
  return (
    (sub.items.data[0] as any)?.current_period_start ??
    (sub as any).current_period_start ??
    0
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Rate-limit per authenticated user (session.user.id — IP keys are
    // bypassable on serverless cold starts). This endpoint writes subscription
    // state, so it is not a free read; cap polling/replay abuse.
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      prefix: "check-active-sub",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
        subscriptionId: true,
        lifetimeAccess: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
      },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    // Lifetime one-time payers have no Stripe subscription; treat as active
    if (
      user.lifetimeAccess ||
      (user.subscriptionStatus === "ACTIVE" &&
        user.subscriptionPlan === "Lifetime")
    ) {
      return NextResponse.json({
        success: true,
        subscription: {
          status: "ACTIVE",
          plan: "Lifetime",
          creditsRemaining: 999999,
        },
      });
    }

    let customerId = user.stripeCustomerId;

    // If no customer ID, try to find customer by email
    if (!customerId) {
      try {
        const customers = await stripe.customers.list({
          email: user.email!,
          limit: 1,
        });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          // Update user with customer ID
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId },
          });
        }
      } catch (error) {
        console.error("Error finding customer:", error);
      }
    }

    if (!customerId) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No Stripe customer found",
        status: 404,
      });
    }

    // Find active subscriptions for this customer
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      // Find the most recent active subscription
      const activeSubscription = subscriptions.data
        .filter((sub) => sub.status === "active" || sub.status === "trialing")
        .sort((a, b) => b.created - a.created)[0];

      if (activeSubscription && activeSubscription.status === "active") {
        // Determine subscription plan from price
        let subscriptionPlan = "Monthly Plan"; // Default
        if (activeSubscription.items.data[0]?.price) {
          const price = activeSubscription.items.data[0].price;
          if (price.recurring?.interval === "year") {
            subscriptionPlan = "Yearly Plan";
          } else {
            subscriptionPlan = "Monthly Plan";
          }
        }

        // Calculate monthly reset date (first day of next month)
        const now = new Date();
        const nextReset = new Date(now);
        nextReset.setMonth(nextReset.getMonth() + 1);
        nextReset.setDate(1);
        nextReset.setHours(0, 0, 0, 0);

        // RA-6962 (review): reset the monthly usage window ONLY when this is a
        // genuinely DIFFERENT subscription id — never on a status flip. After
        // cancel_at_period_end the local status is CANCELED while Stripe is
        // still active on the SAME subscription; a `subscriptionStatus !==
        // "ACTIVE"` signal would let a poll of this route zero
        // monthlyReportsUsed and re-gift the full allowance with no new billing
        // period (repeatable free reports). Rollover for a real renewal is
        // handled by lib/report-limits.ts (guarded by monthlyResetDate), not
        // here — so a same-subscription poll must NOT reset usage.
        const isNewSubscription = user.subscriptionId !== activeSubscription.id;

        // Prepare update data. The signup bonus is granted exactly once by the
        // checkout.session.completed webhook (atomic, guarded on
        // signupBonusApplied) — this browser path no longer grants it.
        const updateData: any = {
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: subscriptionPlan,
          stripeCustomerId: customerId,
          subscriptionId: activeSubscription.id,
          subscriptionEndsAt: new Date(subPeriodEnd(activeSubscription) * 1000),
          nextBillingDate: new Date(subPeriodEnd(activeSubscription) * 1000),
          lastBillingDate: new Date(subPeriodStart(activeSubscription) * 1000),
          // Don't set creditsRemaining for active subscriptions - they use monthly limits
        };

        if (isNewSubscription) {
          updateData.monthlyReportsUsed = 0;
          updateData.monthlyResetDate = nextReset;
        }

        // Update user subscription in database
        const updatedUser = await prisma.user.update({
          where: { id: session.user.id },
          data: updateData,
        });

        return NextResponse.json({
          success: true,
          subscription: {
            status: updatedUser.subscriptionStatus,
            plan: updatedUser.subscriptionPlan,
            creditsRemaining: updatedUser.creditsRemaining,
          },
        });
      } else {
        // Fallback: lifetime one-time payer — webhook/verify may not have run yet
        if (user.email === LIFETIME_PRICING_EMAIL && customerId) {
          try {
            const sessions = await stripe.checkout.sessions.list({
              customer: customerId,
              limit: 10,
            });
            const lifetimePaid = sessions.data.find(
              (s) =>
                s.mode === "payment" &&
                s.metadata?.type === "lifetime" &&
                s.payment_status === "paid",
            );
            if (lifetimePaid) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  lifetimeAccess: true,
                  subscriptionStatus: "ACTIVE",
                  subscriptionPlan: "Lifetime",
                  creditsRemaining: 999999,
                },
              });
              return NextResponse.json({
                success: true,
                subscription: {
                  status: "ACTIVE",
                  plan: "Lifetime",
                  creditsRemaining: 999999,
                },
              });
            }
          } catch (e) {
            console.error("Error checking lifetime checkout:", e);
          }
        }
        return NextResponse.json(
          {
            error: "No active subscription found",
            foundSubscriptions: subscriptions.data.length,
          },
          { status: 404 },
        );
      }
    } catch (err) {
      // RA-786: do not leak stripeError.message to clients
      return fromException(request, err, {
        stage: "stripe-list-subscriptions",
      });
    }
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}
