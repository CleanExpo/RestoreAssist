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
 *   3. Reassign statutory records (Invoice, Report, Estimate,
 *      RestorationDocument, CreditNote, InvoicePayment) onto the dedicated
 *      PII-free retention owner, then prisma.user.delete — all inside one
 *      transaction (see the delete block for the full rationale).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

/**
 * account-deletion-retention: statutory records freed by account deletion are
 * reassigned onto this dedicated, PII-free system user rather than being
 * cascade-destroyed. Seeded (idempotently) by the
 * 20260705000000_account_delete_retention_owner migration — keep this literal
 * in sync with that migration's INSERT.
 */
const RETENTION_OWNER_USER_ID = "system-retention-owner";

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
    maxRequests: 3,
    prefix: "account-delete",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: account deletion is terminal. Idempotency lets the retry
  // path return the cached success response rather than hitting a
  // "user not found" 404 from the cascade.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: { confirmation?: unknown } = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid request body",
          status: 400,
        });
      }

      if (body.confirmation !== CONFIRMATION_PHRASE) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Confirmation phrase must be "${CONFIRMATION_PHRASE}"`,
          status: 400,
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          stripeCustomerId: true,
          subscriptionId: true,
        },
      });
      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      if (user.subscriptionId) {
        try {
          await stripe.subscriptions.cancel(user.subscriptionId);
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
        details: { hadSubscription: Boolean(user.subscriptionId) },
      }).catch((err) =>
        console.error("[account-delete] audit log failed:", err),
      );

      // account-deletion-retention: the account holder's PII is erased (the
      // User row is deleted below), but the statutory financial/compliance
      // records the Privacy Policy promises to retain (/privacy#retention)
      // MUST survive account closure. Every one of these User back-relations is
      // onDelete: Cascade, so a bare user.delete would destroy them — a direct
      // self-contradiction of our own retention promise and an AU compliance
      // exposure:
      //   - Invoice / RestorationDocument (RESTORATION_INVOICE, ESTIMATE) —
      //     tax invoices & BAS working papers, 7yr, Taxation Administration
      //     Act s.262A.
      //   - InvoicePayment — the payment records that "record and explain" the
      //     amounts on those tax invoices (TAA s.262A); destroying them would
      //     leave a retained invoice showing amountPaid with nothing to
      //     explain it.
      //   - CreditNote — GST adjustment / refund tax documents.
      //   - Report — restoration & building-defect reports, up to 10yr.
      //   - Estimate — the priced estimates behind the invoices.
      // (CreditNoteLineItem and InvoicePaymentAllocation cascade from their
      // CreditNote / InvoicePayment parents, so reassigning those parents keeps
      // the children alive transitively — no separate reassignment needed.)
      //
      // So we DETACH them onto the PII-free system retention owner (the row is
      // no longer linked to the deleted account holder) BEFORE deleting the
      // user, leaving the cascade nothing to destroy. All in one transaction
      // so it is strictly all-or-nothing — a mid-way failure can never orphan
      // records or half-delete the user. If the retention owner is missing the
      // reassignment fails closed (P2003) and rolls back rather than destroying
      // data.
      const reassignToRetentionOwner = {
        where: { userId: user.id },
        data: { userId: RETENTION_OWNER_USER_ID },
      };
      await prisma.$transaction(async (tx) => {
        await tx.invoice.updateMany(reassignToRetentionOwner);
        await tx.report.updateMany(reassignToRetentionOwner);
        await tx.estimate.updateMany(reassignToRetentionOwner);
        await tx.restorationDocument.updateMany(reassignToRetentionOwner);
        await tx.creditNote.updateMany(reassignToRetentionOwner);
        await tx.invoicePayment.updateMany(reassignToRetentionOwner);
        await tx.user.delete({ where: { id: user.id } });
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return fromException(request, error, { stage: "delete" });
    }
  });
}
