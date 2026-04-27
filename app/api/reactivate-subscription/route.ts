import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limiter";
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

    const customers = await stripe.customers.list({
      email: session.user.email!,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Customer not found",
        status: 404,
      });
    }

    const customer = customers.data[0];
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No subscription found",
        status: 404,
      });
    }

    const subscription = subscriptions.data[0];

    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "reactivate-subscription" });
  }
}
