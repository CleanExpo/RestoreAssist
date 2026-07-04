import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { fulfillLifetimeFromSession } from "@/lib/billing/fulfill-one-time";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const scopeUserId = session.user.id;

  // RA-6791: verify-subscription is the lifetime fulfillment path (the
  // Stripe webhook ignores mode!=='subscription'). It also grants the
  // signup bonus. A retried POST without idempotency would re-run those
  // writes — wrap it so an identical replay returns the cached response.
  return withIdempotency(request, scopeUserId, async (rawBody) => {
    try {
      let parsed: { sessionId?: string } = {};
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { sessionId } = parsed;

      if (!sessionId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Session ID is required",
          status: 400,
        });
      }

      try {
        // Retrieve the checkout session from Stripe
        const checkoutSession = await stripe.checkout.sessions.retrieve(
          sessionId as string,
          {
            expand: ["subscription"],
          },
        );

        // Verify this session belongs to the current user
        // Check both metadata userId and customer email
        const userId = checkoutSession.metadata?.userId;
        const customerEmail =
          checkoutSession.customer_email ||
          checkoutSession.customer_details?.email;

        // Allow if userId matches OR if customer email matches current user's email
        const isValid =
          (userId && userId === session.user.id) ||
          (customerEmail && customerEmail === session.user.email);

        if (!isValid) {
          console.error("Session validation failed:", {
            metadataUserId: userId,
            sessionUserId: session.user.id,
            customerEmail: customerEmail,
            userEmail: session.user.email,
          });
          return apiError(request, {
            code: "FORBIDDEN",
            message: "Invalid session",
            status: 403,
          });
        }

        // Check if payment was successful
        if (checkoutSession.payment_status !== "paid") {
          return NextResponse.json(
            {
              error: "Payment not completed",
              payment_status: checkoutSession.payment_status,
            },
            { status: 400 },
          );
        }

        // One-time lifetime payment (no Stripe subscription). F4 — delegate to
        // the shared fulfillment helper so the browser verify path and the
        // webhook path apply the exact same idempotent write. This endpoint is
        // now a redundant self-heal, not the primary fulfillment path.
        if (
          checkoutSession.mode === "payment" &&
          checkoutSession.metadata?.type === "lifetime"
        ) {
          await fulfillLifetimeFromSession(checkoutSession);
          return NextResponse.json({
            success: true,
            subscription: {
              status: "ACTIVE",
              plan: "Lifetime",
              creditsRemaining: 999999,
            },
          });
        }

        // Get subscription details
        let subscriptionId = checkoutSession.subscription;
        if (typeof subscriptionId === "object" && subscriptionId) {
          subscriptionId = subscriptionId.id;
        }

        if (!subscriptionId) {
          return apiError(request, {
            code: "VALIDATION",
            message: "No subscription found",
            status: 400,
          });
        }

        // Retrieve full subscription details from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscriptionId as string,
        );

        // RA-6972: a replayed old success-page session_id can point at a
        // subscription that has since been superseded or cancelled. Only a
        // live (active) subscription may (re)activate the account and reset the
        // usage window — reject anything else so an old session cannot
        // resurrect a cancelled/incomplete subscription or re-gift usage.
        if (stripeSubscription.status !== "active") {
          return apiError(request, {
            code: "VALIDATION",
            message: "Subscription is not active",
            status: 400,
          });
        }

        // Determine subscription plan from price
        let subscriptionPlan = "Monthly Plan"; // Default
        if (stripeSubscription.items.data[0]?.price) {
          const price = stripeSubscription.items.data[0].price;
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

        // RA-6962 (review): reset the monthly usage window ONLY on a genuinely
        // DIFFERENT subscription id — never on a status flip. A CANCELED local
        // status (post cancel_at_period_end) on the SAME still-active Stripe
        // subscription must not zero monthlyReportsUsed and re-gift the monthly
        // allowance. Rollover for a real renewal is handled by
        // lib/report-limits.ts (guarded by monthlyResetDate), not here.
        const userBefore = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            subscriptionId: true,
          },
        });

        const incomingSubscriptionId = subscriptionId as string;
        const storedSubscriptionId = userBefore?.subscriptionId ?? null;

        // RA-6972: never regress subscriptionId to an older subscription. When
        // the user already has a DIFFERENT stored subscription, only advance
        // when the session's subscription is at least as recent as the stored
        // one. Replaying an old paid session for a since-changed subscription
        // must not overwrite the current subscriptionId nor re-open the monthly
        // usage window. The "current live sub" is the most recently created of
        // the two active subscriptions.
        if (
          storedSubscriptionId &&
          storedSubscriptionId !== incomingSubscriptionId
        ) {
          let storedIsCurrent = false;
          try {
            const storedSubscription = await stripe.subscriptions.retrieve(
              storedSubscriptionId,
            );
            storedIsCurrent =
              storedSubscription.status === "active" &&
              (storedSubscription.created ?? 0) >
                (stripeSubscription.created ?? 0);
          } catch {
            // Stored subscription is no longer retrievable (deleted). Treat the
            // incoming active subscription as current and allow the advance.
            storedIsCurrent = false;
          }
          if (storedIsCurrent) {
            return apiError(request, {
              code: "CONFLICT",
              message: "Subscription is no longer current",
              status: 409,
            });
          }
        }

        const isNewSubscription =
          storedSubscriptionId !== incomingSubscriptionId;

        // RA-907: current_period_end/start live on the SubscriptionItem in this
        // SDK version — read them there (no `as any` cast on the Subscription).
        const periodEnd =
          stripeSubscription.items.data[0]?.current_period_end ?? 0;
        const periodStart =
          stripeSubscription.items.data[0]?.current_period_start ?? 0;

        // Prepare update data. The signup bonus is granted exactly once by the
        // checkout.session.completed webhook (atomic, guarded on
        // signupBonusApplied) — this browser path no longer grants it.
        const updateData: any = {
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: subscriptionPlan,
          stripeCustomerId: checkoutSession.customer as string,
          subscriptionId: subscriptionId as string,
          subscriptionEndsAt: new Date(periodEnd * 1000),
          nextBillingDate: new Date(periodEnd * 1000),
          lastBillingDate: new Date(periodStart * 1000),
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
      } catch (stripeError: any) {
        // RA-786: do not leak stripeError.message to clients — apiError keeps
        // the raw error server-side (reportError) and never in the body.
        return apiError(request, {
          code: "INTERNAL",
          message: "Failed to verify subscription",
          status: 500,
          err: stripeError,
          stage: "verify-subscription:stripe",
        });
      }
    } catch (error) {
      return fromException(request, error, {
        stage: "verify-subscription:post",
      });
    }
  });
}
