import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Manual verification endpoint for add-on purchases
 * This can be called from the success page or subscription page to verify and process add-on purchases
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: CRITICAL — verify credits an addon purchase to the user.
  // Retry without idempotency would double-credit.
  return withIdempotency(request, userId, async (rawBody) => {
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
          sessionId,
          {
            expand: ["payment_intent"],
          },
        );

        // Verify this session belongs to the current user
        const sessionUserId = checkoutSession.metadata?.userId;
        if (sessionUserId !== userId) {
          console.error("USER ID MISMATCH:", {
            sessionUserId,
            currentUserId: userId,
          });
          return apiError(request, {
            code: "FORBIDDEN",
            message: "Invalid session",
            status: 403,
          });
        }

        // Check if this is an add-on purchase
        if (
          checkoutSession.mode !== "payment" ||
          checkoutSession.metadata?.type !== "addon"
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Not an add-on purchase",
            status: 400,
          });
        }

        // Check if payment was successful — preserve payment_status payload
        if (checkoutSession.payment_status !== "paid") {
          return NextResponse.json(
            {
              error: "Payment not completed",
              payment_status: checkoutSession.payment_status,
            },
            { status: 400 },
          );
        }

        const addonKey = checkoutSession.metadata?.addonKey;
        const addonReports = parseInt(
          checkoutSession.metadata?.addonReports || "0",
        );
        const addon =
          PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons];

        if (!addonKey || addonReports <= 0 || !addon) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Invalid add-on data",
            status: 400,
          });
        }

        // Check if already processed
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { addonReports: true },
        });

        // Check if purchase record already exists
        let existingPurchase = null;
        try {
          existingPurchase = await prisma.addonPurchase.findFirst({
            where: {
              stripeSessionId: checkoutSession.id,
            },
          });
        } catch (error: any) {
          // Table not available
        }

        if (existingPurchase) {
          return NextResponse.json({
            success: true,
            message: "Add-on already processed",
            addonReports: user?.addonReports,
          });
        }

        // Process the add-on purchase
        const paymentIntentId = checkoutSession.payment_intent as
          | string
          | undefined;

        // Atomically create purchase record + increment user's addonReports.
        // Without a transaction, a server crash between the two writes leaves the
        // user with a purchase record but no reports credited (unrecoverable without
        // manual intervention). P2002 on the unique stripeSessionId means already processed.
        let updatedUser: { addonReports: number | null };
        try {
          const [_, updated] = await prisma.$transaction([
            prisma.addonPurchase.create({
              data: {
                userId: userId,
                addonKey: addonKey,
                addonName: addon.name,
                reportLimit: addonReports,
                amount: addon.amount,
                currency: addon.currency,
                stripeSessionId: checkoutSession.id,
                stripePaymentIntentId: paymentIntentId,
                status: "COMPLETED",
              },
            }),
            prisma.user.update({
              where: { id: userId },
              data: { addonReports: { increment: addonReports } },
              select: { addonReports: true },
            }),
          ]);
          updatedUser = updated;
        } catch (error: any) {
          // Unique constraint on stripeSessionId — already processed
          if (
            error.code === "P2002" ||
            error.message?.includes("Unique constraint") ||
            error.message?.includes("unique")
          ) {
            return NextResponse.json({
              success: true,
              message: "Add-on purchase already processed",
              addonReports: user?.addonReports || 0,
            });
          }
          console.warn("Could not process AddonPurchase:", error.message);
          throw error;
        }

        return NextResponse.json({
          success: true,
          message: "Add-on purchase processed successfully",
          addonReports: updatedUser.addonReports,
          increment: addonReports,
        });
      } catch (stripeError) {
        return fromException(request, stripeError, { stage: "stripe-verify" });
      }
    } catch (err) {
      return fromException(request, err, { stage: "verify" });
    }
  });
}
