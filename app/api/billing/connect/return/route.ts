import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { apiError, fromException } from "@/lib/api-errors";
import { getAppUrl } from "@/lib/app-url";
import { refuseNonOwner } from "@/lib/billing/require-billing-owner";
import { getEntitlementWorkspaceForUser } from "@/lib/entitlements/require-addon";
import { syncConnectAccountStatus } from "@/lib/billing/stripe-connect";

/**
 * P1-MNY-01 — where Stripe-hosted onboarding sends the firm owner back to
 * (return_url) or when the link has expired (refresh_url, ?refresh=1).
 *
 * Arriving here proves nothing: the account is re-read from Stripe and its
 * charges_enabled / details_submitted are stored. On refresh with details
 * still outstanding, a new onboarding link is minted. Then the owner lands on
 * the invoices page with ?connect=ready|pending.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const notOwner = await refuseNonOwner(request, userId);
  if (notOwner) return notOwner;

  const base = getAppUrl();
  try {
    const owned = await getEntitlementWorkspaceForUser(userId);
    const workspace = owned
      ? await prisma.workspace.findUnique({
          where: { id: owned.id },
          select: { stripeConnectAccountId: true },
        })
      : null;
    const accountId = workspace?.stripeConnectAccountId;
    if (!accountId) {
      return NextResponse.redirect(`${base}/dashboard/invoices?connect=missing`);
    }

    const account = await stripe.accounts.retrieve(accountId);
    await syncConnectAccountStatus(account);

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (refresh && !account.details_submitted) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${base}/api/billing/connect/return?refresh=1`,
        return_url: `${base}/api/billing/connect/return`,
      });
      return NextResponse.redirect(link.url);
    }

    const state = account.charges_enabled ? "ready" : "pending";
    return NextResponse.redirect(`${base}/dashboard/invoices?connect=${state}`);
  } catch (error) {
    return fromException(request, error, { stage: "connect-return" });
  }
}
