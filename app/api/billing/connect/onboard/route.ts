import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getAppUrl } from "@/lib/app-url";
import { refuseNonOwner } from "@/lib/billing/require-billing-owner";
import { requireAddon } from "@/lib/entitlements/require-addon";
import { PAYMENTS_SKU } from "@/lib/billing/payments-addon";
import {
  STANDARD_ACCOUNT_CONTROLLER,
  connectAccountIdempotencyKey,
} from "@/lib/billing/stripe-connect";
import {
  INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE,
  isInvoiceOnlinePaymentEnabled,
} from "@/lib/invoices/online-payment";

/**
 * P1-MNY-01 — start (or resume) Stripe Connect onboarding for the caller's
 * business.
 *
 * Creates at most ONE Standard connected account per workspace: the stored
 * `Workspace.stripeConnectAccountId` is checked first, and the Stripe create
 * carries an idempotency key bound to the workspace as a second line. Then a
 * fresh Stripe-hosted onboarding link (account links expire) is returned.
 *
 * The return route re-reads the account from Stripe; nothing here or there
 * trusts the browser coming back as proof that onboarding finished.
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

  if (!isInvoiceOnlinePaymentEnabled()) {
    return apiError(request, {
      code: "FEATURE_UNAVAILABLE",
      message: INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE,
      status: 409,
    });
  }

  const notOwner = await refuseNonOwner(request, userId);
  if (notOwner) return notOwner;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "connect-onboard",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // The account belongs to the workspace whose PAYMENTS add-on is active.
  const gate = await requireAddon(userId, PAYMENTS_SKU);
  if (!gate.allowed) return gate.response;
  const workspaceId = gate.workspaceId;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, stripeConnectAccountId: true },
    });
    if (!workspace) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Workspace not found",
        status: 404,
      });
    }

    let accountId = workspace.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          country: "AU",
          controller: STANDARD_ACCOUNT_CONTROLLER,
          metadata: { workspaceId, userId },
          ...(session.user.email ? { email: session.user.email } : {}),
        },
        { idempotencyKey: connectAccountIdempotencyKey(workspaceId) },
      );

      // Store only if still empty; a concurrent request may have won.
      const stored = await prisma.workspace.updateMany({
        where: { id: workspaceId, stripeConnectAccountId: null },
        data: {
          stripeConnectAccountId: account.id,
          stripeConnectChargesEnabled: account.charges_enabled === true,
          stripeConnectDetailsSubmitted: account.details_submitted === true,
          stripeConnectStatusAt: new Date(),
        },
      });
      if (stored.count === 0) {
        const winner = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true, stripeConnectAccountId: true },
        });
        if (!winner?.stripeConnectAccountId) {
          throw new Error("Connected account could not be stored");
        }
        if (winner.stripeConnectAccountId !== account.id) {
          console.error(
            "[connect-onboard] a second connected account was created and not stored",
            { workspaceId, kept: winner.stripeConnectAccountId, orphan: account.id },
          );
        }
        accountId = winner.stripeConnectAccountId;
      } else {
        accountId = account.id;
      }
    }

    const base = getAppUrl();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${base}/api/billing/connect/return?refresh=1`,
      return_url: `${base}/api/billing/connect/return`,
    });

    return NextResponse.json({ url: link.url });
  } catch (error) {
    return fromException(request, error, { stage: "connect-onboard" });
  }
}
