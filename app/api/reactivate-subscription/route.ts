import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      prefix: "reactivate-sub",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    // RA-6939: resolve the customer from the authenticated user's stored
    // stripeCustomerId, not a first-hit email lookup, and act on the user's
    // own subscription rather than an arbitrary status:"all" first hit.
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
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

    // Prefer the user's stored subscriptionId; otherwise resolve THIS
    // customer's subscription.
    let subscriptionId = dbUser?.subscriptionId ?? null;
    if (!subscriptionId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      subscriptionId = subscriptions.data[0]?.id ?? null;
    }

    if (!subscriptionId) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No subscription found",
        status: 404,
      });
    }

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    // RA-6939: sync local DB so the app reflects the reactivation without
    // waiting for the webhook.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { subscriptionStatus: "ACTIVE" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "reactivate-subscription" });
  }
}
