import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { stripe } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// RA-1243: accept optional reason + comment so we can capture churn signal.
// Both are optional to preserve backwards compatibility with the old
// confirm()-based cancel that sent an empty body.
const cancelSchema = z.object({
  reason: z
    .enum([
      "too_expensive",
      "not_using",
      "missing_feature",
      "switching",
      "other",
    ])
    .optional(),
  comment: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
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
    maxRequests: 5,
    prefix: "cancel-sub",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: subscription cancel is a terminal action — retry must not
  // flip the cancel_at_period_end flag or duplicate churn feedback rows.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let bodyRaw: any = {};
      try {
        bodyRaw = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        bodyRaw = {};
      }
      const parsed = cancelSchema.safeParse(bodyRaw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", issues: parsed.error.issues },
          { status: 422 },
        );
      }

      // RA-6939: resolve the customer from the authenticated user's stored
      // stripeCustomerId, not a first-hit email lookup — a shared email can
      // map to multiple Stripe customers and cancel the wrong subscription.
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true, subscriptionId: true },
      });

      let customerId = dbUser?.stripeCustomerId ?? null;

      // Back-compat: fall back to email lookup only when no stored id exists.
      if (!customerId) {
        const customers = await stripe.customers.list({
          email: session.user.email!,
          limit: 1,
        });
        customerId = customers.data[0]?.id ?? null;
      }

      if (!customerId) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Customer not found",
          status: 404,
        });
      }

      // Prefer the user's stored subscriptionId; otherwise resolve the active
      // subscription for THIS customer id.
      let subscriptionId = dbUser?.subscriptionId ?? null;
      if (!subscriptionId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        subscriptionId = subscriptions.data[0]?.id ?? null;
      }

      if (!subscriptionId) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "No active subscription found",
          status: 404,
        });
      }

      // Cancel subscription at period end
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // RA-6939: sync local DB so the app reflects the scheduled cancel
      // without waiting for the webhook. Matches the status the subscription
      // route reads as cancelAtPeriodEnd.
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "CANCELED" },
      });

      // Persist churn feedback (best-effort — never block the cancel on this).
      if (parsed.data.reason) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, subscriptionPlan: true },
          });
          const tenureDays = user?.createdAt
            ? Math.floor(
                (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000),
              )
            : null;

          await prisma.cancellationFeedback.create({
            data: {
              userId,
              reason: parsed.data.reason,
              comment: parsed.data.comment ?? null,
              subscriptionPlan: user?.subscriptionPlan ?? null,
              tenureDays,
            },
          });
        } catch (err) {
          console.error(
            "[cancel-subscription] Failed to persist feedback:",
            err,
          );
        }
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      return fromException(request, err, { stage: "cancel" });
    }
  });
}
