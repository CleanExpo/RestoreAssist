import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Check for pending add-on purchases that haven't been processed
 * This can be called to find and process any unprocessed add-on purchases
 */
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

    // Get user's Stripe customer ID and check if we can use AddonPurchase table
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        addonReports: true,
      },
    });

    // Check if AddonPurchase table exists and get already processed session IDs
    let processedSessionIds: string[] = [];
    let canUsePurchaseTable = false;
    try {
      const existingPurchases = await prisma.addonPurchase.findMany({
        where: { userId: session.user.id },
        select: { stripeSessionId: true },
      });
      processedSessionIds = existingPurchases
        .map((p) => p.stripeSessionId)
        .filter((id): id is string => id !== null);
      canUsePurchaseTable = true;
    } catch {
      canUsePurchaseTable = false;
    }

    if (!user?.stripeCustomerId) {
      // Preserve dual error/message payload for client UX
      return NextResponse.json(
        {
          error: "No Stripe customer found",
          message: "Please contact support to process your add-on purchase",
        },
        { status: 404 },
      );
    }

    // Get recent checkout sessions for this customer
    const sessions = await stripe.checkout.sessions.list({
      customer: user.stripeCustomerId,
      limit: 10,
    });

    // Find add-on purchases that are paid but might not be processed
    const userId = session.user.id;
    const addonSessions = sessions.data.filter((checkoutSession) => {
      const isAddon =
        checkoutSession.mode === "payment" &&
        checkoutSession.metadata?.type === "addon" &&
        checkoutSession.payment_status === "paid" &&
        checkoutSession.metadata?.userId === userId;

      return isAddon;
    });

    if (addonSessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending add-on purchases found",
        addonReports: user.addonReports,
      });
    }

    // Process each add-on purchase
    const processed = [];
    const now = Date.now();

    for (const checkoutSession of addonSessions) {
      try {
        // Check if already processed
        let alreadyProcessed = false;

        if (canUsePurchaseTable) {
          // Use AddonPurchase table to check
          alreadyProcessed = processedSessionIds.includes(checkoutSession.id);
        } else {
          // Fallback: Only process sessions created in the last 10 minutes
          // This prevents reprocessing old purchases when table doesn't exist
          if (checkoutSession.created) {
            const sessionAge = (now - checkoutSession.created * 1000) / 60000; // age in minutes
            if (sessionAge > 10) {
              alreadyProcessed = true;
            }
          } else {
            // If no creation time, skip to be safe
            alreadyProcessed = true;
          }
        }

        if (alreadyProcessed) {
          continue;
        }

        // Import the verification logic
        const addonKey = checkoutSession.metadata?.addonKey;
        const addonReports = parseInt(
          checkoutSession.metadata?.addonReports || "0",
        );

        if (!addonKey || addonReports <= 0) {
          continue;
        }

        // Wrap purchase record creation + credit increment in a single transaction.
        // A crash between the two writes would otherwise leave the record marked
        // COMPLETED but with no credits granted (or credits granted with no record).
        // The unique constraint on stripeSessionId ensures exactly-once processing.
        if (canUsePurchaseTable) {
          try {
            await prisma.$transaction(async (tx) => {
              await tx.addonPurchase.create({
                data: {
                  userId: session.user.id,
                  addonKey: addonKey,
                  addonName: checkoutSession.metadata?.addonName || addonKey,
                  reportLimit: addonReports,
                  amount: 0,
                  currency: "AUD",
                  stripeSessionId: checkoutSession.id,
                  status: "COMPLETED",
                },
              });
              await tx.user.update({
                where: { id: session.user.id },
                data: { addonReports: { increment: addonReports } },
              });
            });
          } catch (error: any) {
            if (
              error.code === "P2002" ||
              error.message?.includes("Unique constraint") ||
              error.message?.includes("unique")
            ) {
              continue; // Already processed — skip
            }
            console.error("❌ Error processing addon purchase:", error.message);
            continue;
          }
        } else {
          // AddonPurchase table absent — update user field only.
          // This is a degraded path; treat canUsePurchaseTable === false as a
          // warning signal and still credit the user.
          await prisma.user.update({
            where: { id: session.user.id },
            data: { addonReports: { increment: addonReports } },
          });
        }

        processed.push({
          sessionId: checkoutSession.id,
          addonReports,
          addonKey,
        });

        // Add to processed list to prevent duplicate processing in this run
        processedSessionIds.push(checkoutSession.id);
      } catch (error: any) {
        console.error(
          "❌ ERROR PROCESSING SESSION:",
          checkoutSession.id,
          error.message,
        );
      }
    }

    // Get updated user data
    const finalUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { addonReports: true },
    });

    return NextResponse.json({
      success: true,
      message:
        processed.length > 0
          ? `Processed ${processed.length} add-on purchase(s)`
          : "No new purchases to process",
      processed: processed.length,
      addonReports: finalUser?.addonReports || 0,
      previousAddonReports: user.addonReports,
    });
  } catch (err) {
    return fromException(request, err, { stage: "check-pending" });
  }
}
