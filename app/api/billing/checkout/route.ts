import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const VALID_TIERS = ["STANDARD", "PREMIUM", "ENTERPRISE"] as const;
const Body = z.object({ tier: z.enum(VALID_TIERS) });

function tierToPriceId(tier: (typeof VALID_TIERS)[number]): string {
  const map = {
    STANDARD: process.env.STRIPE_PRICE_STANDARD,
    PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
    ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE,
  } as const;
  const priceId = map[tier];
  if (!priceId) throw new Error(`Missing STRIPE_PRICE_${tier} env var`);
  return priceId;
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

    const json = await request.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid tier",
        status: 400,
      });
    }
    const { tier } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user || !user.email) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-05-27.dahlia",
    });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = new URL(request.url).origin;
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: tierToPriceId(tier), quantity: 1 }],
      metadata: { userId: user.id, tier },
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/upgrade?cancelled=1`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ data: { url: checkoutSession.url } });
  } catch (err) {
    return fromException(request, err, { stage: "billing/checkout" });
  }
}
