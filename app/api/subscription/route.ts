import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
      },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    // If user has a Stripe subscription, get details from Stripe
    if (user.subscriptionId && user.stripeCustomerId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          user.subscriptionId,
        );
        const price = await stripe.prices.retrieve(
          subscription.items.data[0].price.id,
        );

        // RA-6968/6967: the billing period lives on the SubscriptionItem in
        // this SDK version (dahlia removed the Subscription-root fields). Read
        // it there — never from a removed root field — and when Stripe omits a
        // value, leave the stored date untouched rather than fabricating
        // now()+30d, which previously wrote a false renewal date.
        const item = subscription.items.data[0];
        const periodEnd = item?.current_period_end ?? null;
        const periodStart = item?.current_period_start ?? null;

        const updateData: Prisma.UserUpdateInput = {
          subscriptionStatus:
            subscription.status === "active"
              ? "ACTIVE"
              : subscription.status === "canceled"
                ? "CANCELED"
                : subscription.status === "past_due"
                  ? "PAST_DUE"
                  : "EXPIRED",
          creditsRemaining:
            subscription.status === "active" ? 999999 : user.creditsRemaining,
        };
        if (periodEnd !== null) {
          updateData.subscriptionEndsAt = new Date(periodEnd * 1000);
          updateData.nextBillingDate = new Date(periodEnd * 1000);
        }
        if (periodStart !== null) {
          updateData.lastBillingDate = new Date(periodStart * 1000);
        }

        // Update database with latest subscription data
        await prisma.user.update({
          where: { id: session.user.id },
          data: updateData,
        });

        return NextResponse.json({
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            plan: {
              name: price.nickname || user.subscriptionPlan || "Subscription",
              amount: price.unit_amount || 0,
              currency: price.currency,
              interval: price.recurring?.interval || "month",
            },
          },
        });
      } catch (stripeError) {
        console.error("Error fetching Stripe subscription:", stripeError);
        // Fall back to database data
      }
    }

    // Return database subscription data
    return NextResponse.json({
      subscription:
        user.subscriptionStatus != null && user.subscriptionStatus !== "TRIAL"
          ? {
              id: user.subscriptionId,
              status: user.subscriptionStatus.toLowerCase(),
              currentPeriodStart: user.lastBillingDate
                ? Math.floor(new Date(user.lastBillingDate).getTime() / 1000)
                : null,
              currentPeriodEnd: user.nextBillingDate
                ? Math.floor(new Date(user.nextBillingDate).getTime() / 1000)
                : null,
              cancelAtPeriodEnd: user.subscriptionStatus === "CANCELED",
              plan: {
                name: user.subscriptionPlan || "Subscription",
                amount: 0,
                currency: "AUD",
                interval: "month",
              },
            }
          : null,
    });
  } catch (error) {
    return fromException(request, error, { stage: "subscription" });
  }
}
