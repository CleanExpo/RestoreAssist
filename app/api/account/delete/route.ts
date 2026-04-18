/**
 * POST /api/account/delete — permanent account deletion
 *
 * RA-1350: Australian Privacy Principle 11 requires that we provide a
 * way for a user to request deletion of their personal information. This
 * endpoint is the backend for the self-service "delete my account" flow
 * in dashboard settings.
 *
 * The caller must re-prove ownership by typing the literal string
 * "DELETE MY ACCOUNT" as the `confirmation` body field. This prevents
 * accidental deletion from CSRF-adjacent mistakes or curl typos.
 *
 * Side-effects in order:
 *   1. Cancel Stripe subscription immediately (not at period-end) so we
 *      don't keep billing them after they've asked us to stop.
 *   2. Write a security audit log entry BEFORE the delete — after the
 *      cascade the user.id is gone.
 *   3. prisma.user.delete — onDelete: Cascade on relations handles the
 *      rest (Reports, Estimates, Inspections, Integrations, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";

const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 3,
      prefix: "account-delete",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    let body: { confirmation?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (body.confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          error: `Confirmation phrase must be "${CONFIRMATION_PHRASE}"`,
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cancel the Stripe subscription immediately so no further invoices
    // are raised. We don't unwind historical invoices — those are already
    // tax-compliant records.
    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err) {
        console.error(
          "[account-delete] Stripe cancel failed (proceeding with deletion):",
          err,
        );
      }
    }

    const reqCtx = extractRequestContext(request);
    await logSecurityEvent({
      eventType: "ACCOUNT_DELETED",
      userId: user.id,
      email: user.email,
      ...reqCtx,
      details: { hadSubscription: Boolean(user.stripeSubscriptionId) },
    }).catch((err) => console.error("[account-delete] audit log failed:", err));

    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[account-delete] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
