/**
 * RA-7721 — operator grant of the Founding Trial (founder rulings 27/09 and
 * 28/09/2026): every technician seat and add-on free, and the $99/month base
 * plan free for 60 days from the grant.
 *
 * POST { abn | organizationId, apply?: true }
 *   - dry run unless `apply` is exactly `true`;
 *   - the business must hold an ABN the Australian Business Register
 *     confirmed at signup (422 otherwise), and the response names the ABR
 *     entity so the operator confirms the right business before applying;
 *   - calls the same runFoundingTrialGrant as scripts/grant-founding-trial.ts.
 *   - RA-8664: `override: { reason }` lets the operator grant a business whose
 *     ABR lookup never finished; the reason is recorded with the grant. A
 *     different or cancelled ABN still refuses.
 *   - RA-8664: when Stripe cannot be read (an expired key answered every
 *     Preview with a bare 500), the operator gets a 424 that says so. A 503
 *     body is replaced by the host's own error page, so 424 is used for
 *     every Stripe failure.
 *   - RA-8664b: when Stripe refuses the key itself, the grant checks
 *     RestoreAssist's own records instead. With no Stripe billing on record
 *     the preview and the apply both go ahead (apply writes the grant), and
 *     the outcome carries billingCheckedBy "database" so the page says so.
 *     With any Stripe billing on record it answers 424, names what is on
 *     record, and writes nothing (or, in the second check, puts the grant
 *     back).
 *   - A Preview also returns `current`: what the business holds now (add-ons
 *     held free, the owner's base plan, any founder override), read before
 *     the ABN check, so an already-granted business is not shown as never
 *     granted. Read-only; a failed read returns `currentError` instead.
 *
 * Platform staff only. `role: "ADMIN"` is every self-registered firm owner, so
 * verifyAdminFromDb is followed by verifyPlatformSupportOperator, which fails
 * closed when PLATFORM_SUPPORT_USER_IDS is unset.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { validateCsrf } from "@/lib/csrf";
import { normaliseAbn } from "@/lib/abn/checksum";
import { apiError, fromException } from "@/lib/api-errors";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import {
  ABN_OVERRIDE_MIN_REASON,
  FoundingTrialBillingUncheckedError,
  FoundingTrialGrantError,
  FoundingTrialSettleCheckError,
  foundingTrialCurrentState,
  runFoundingTrialGrant,
  type FoundingTrialCurrentState,
  type StripeHistory,
} from "@/lib/billing/founding-trial-grant";
import { reportError } from "@/lib/observability";

const CURRENT_STATE_UNREADABLE =
  "What this business holds now could not be read, so this Preview cannot " +
  "say whether it is already on the Founding Trial.";

// The script waits five minutes (GRANT_SETTLE_MS) before its second Stripe
// check. That wait is margin, not correctness (see GRANT_SETTLE_MS): checkout
// re-reads the grant after creating a session and withholds the link. An HTTP
// request cannot hold five minutes, so the route waits a short margin instead.
const ROUTE_SETTLE_MS = 10_000;

const STATUS_CODE: Record<string, number> = {
  dry_run: 200,
  granted: 200,
  unverified_abn: 422,
  identity_changed: 409,
  refused: 409,
  reverted: 409,
};

/** Stripe SDK errors carry `type: "Stripe..."` (stripe/esm/Error.js). */
function stripeErrorType(err: unknown): string | null {
  const type = (err as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.startsWith("Stripe") ? type : null;
}

const STRIPE_KEY_REFUSED =
  "Stripe refused RestoreAssist's API key, so add-on billing could not be " +
  "checked. Nothing was written. The Stripe secret key in production needs " +
  "replacing.";
const STRIPE_UNAVAILABLE =
  "Stripe could not be read, so add-on billing could not be checked. Nothing " +
  "was written. Try again in a few minutes.";
// The second check runs after the grant committed. The grant was put back,
// so these never say nothing was written.
const SETTLE_KEY_REFUSED =
  "Stripe refused RestoreAssist's API key during the second billing check, so " +
  "the grant was put back as it was. The Stripe secret key in production needs " +
  "replacing.";
const SETTLE_UNAVAILABLE =
  "Stripe could not be read for the second billing check, so the grant was put " +
  "back as it was. Try again in a few minutes.";

/**
 * RA-8664b: every Stripe failure here answers 424 (Failed Dependency), not
 * 503. On production DigitalOcean App Platform replaced the body of this
 * route's 503 with its own error page (28/11/2026, eventId eo4wgvsb), so the
 * operator saw none of the message. A 4xx reaches the page as sent.
 */
const STRIPE_FAILED_STATUS = 424;

const HISTORY_TEXT: Record<StripeHistory, string> = {
  linked_customer: "a person linked to this business has a Stripe customer record",
  workspace_customer: "its workspace has a Stripe customer record",
  linked_subscription: "one of its add-ons is linked to a Stripe subscription",
  recent_account_deletion: "an account was deleted in the last 25 hours",
};

function historyText(history: StripeHistory[]): string {
  return history.map((h) => HISTORY_TEXT[h]).join("; ");
}

function uncheckedMessage(e: FoundingTrialBillingUncheckedError): string {
  return (
    `Stripe refused RestoreAssist's API key, and ${historyText(e.history)}, so ` +
    "add-on billing could not be checked. Nothing was written. The Stripe " +
    "secret key in production needs replacing."
  );
}

function settleUncheckedMessage(e: FoundingTrialBillingUncheckedError): string {
  return (
    "Stripe refused RestoreAssist's API key during the second billing check, " +
    `and ${historyText(e.history)}, so the grant was put back as it was. The ` +
    "Stripe secret key in production needs replacing."
  );
}

function isKeyRefused(stripeType: string | null): boolean {
  return (
    stripeType === "StripeAuthenticationError" ||
    stripeType === "StripePermissionError"
  );
}

export async function POST(request: NextRequest) {
  const csrfErr = validateCsrf(request);
  if (csrfErr) return csrfErr;

  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const operator = verifyPlatformSupportOperator(auth);
    if (operator.response) return operator.response;

    const body = (await request.json().catch(() => null)) as {
      abn?: unknown;
      organizationId?: unknown;
      apply?: unknown;
      confirmed?: unknown;
      override?: unknown;
    } | null;
    const apply = body?.apply === true;
    // Apply must name the business the operator previewed: organisation id,
    // ABN and ABR name. The grant compares them with the locked record.
    const c = (body?.confirmed ?? null) as Record<string, unknown> | null;
    const confirmed =
      c &&
      typeof c.organizationId === "string" &&
      typeof c.abn === "string" &&
      typeof c.legalName === "string"
        ? { organizationId: c.organizationId, abn: c.abn, legalName: c.legalName }
        : null;
    let abnOverride: { reason: string; operatorUserId: string } | undefined;
    if (body?.override !== undefined && body?.override !== null) {
      const reason = (body.override as { reason?: unknown }).reason;
      if (typeof reason !== "string" || reason.trim().length < ABN_OVERRIDE_MIN_REASON) {
        return NextResponse.json(
          {
            error: `A founder override needs a reason of at least ${ABN_OVERRIDE_MIN_REASON} characters.`,
          },
          { status: 400 },
        );
      }
      abnOverride = { reason: reason.trim(), operatorUserId: operator.user!.id };
    }
    const hasAbn = typeof body?.abn === "string" && body.abn.trim() !== "";
    const hasOrg =
      typeof body?.organizationId === "string" && body.organizationId !== "";
    if (hasAbn === hasOrg) {
      return NextResponse.json(
        { error: "Give exactly one of abn or organizationId." },
        { status: 400 },
      );
    }

    let where: { abn: string } | { id: string };
    if (hasAbn) {
      const abn = normaliseAbn(body!.abn as string);
      if (!abn) {
        return NextResponse.json(
          { error: "An ABN is 11 digits." },
          { status: 400 },
        );
      }
      where = { abn };
    } else {
      where = { id: body!.organizationId as string };
    }

    const org = await prisma.organization.findUnique({
      where,
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: "No business holds that ABN or id." },
        { status: 404 },
      );
    }

    if (apply && !confirmed) {
      return NextResponse.json(
        { error: "Preview the business first; Apply must confirm what Preview showed." },
        { status: 400 },
      );
    }

    // Preview reads what the business holds now before the ABN check can stop
    // the dry run, so a business already granted (on an override, say) is not
    // shown as never granted. Read-only. A failed read is said, never shown
    // as an empty state.
    let current: FoundingTrialCurrentState | null = null;
    let currentError: string | undefined;
    if (!apply) {
      try {
        current = await foundingTrialCurrentState(prisma, org.id);
      } catch (err) {
        reportError(err, {
          route: "/api/admin/founding-trial",
          stage: "admin.founding-trial.current-state",
          organizationId: org.id,
        });
        currentError = CURRENT_STATE_UNREADABLE;
      }
    }

    const outcome = await runFoundingTrialGrant({
      db: prisma,
      stripe,
      organizationId: org.id,
      apply,
      settleMs: ROUTE_SETTLE_MS,
      ...(apply && confirmed ? { confirmed } : {}),
      ...(abnOverride ? { abnOverride } : {}),
    });
    return NextResponse.json(
      {
        outcome,
        organizationId: org.id,
        ...(apply ? {} : { current }),
        ...(currentError ? { currentError } : {}),
      },
      { status: STATUS_CODE[outcome.status] ?? 500 },
    );
  } catch (err) {
    if (err instanceof FoundingTrialGrantError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof FoundingTrialSettleCheckError) {
      const inner = err.settleError;
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        status: STRIPE_FAILED_STATUS,
        message:
          inner instanceof FoundingTrialBillingUncheckedError
            ? settleUncheckedMessage(inner)
            : isKeyRefused(stripeErrorType(inner))
              ? SETTLE_KEY_REFUSED
              : SETTLE_UNAVAILABLE,
        err: inner instanceof FoundingTrialBillingUncheckedError ? inner.stripeError : inner,
        stage: "admin.founding-trial.settle",
      });
    }
    if (err instanceof FoundingTrialBillingUncheckedError) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        status: STRIPE_FAILED_STATUS,
        message: uncheckedMessage(err),
        err: err.stripeError,
        stage: "admin.founding-trial.stripe",
      });
    }
    const stripeType = stripeErrorType(err);
    if (stripeType) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        status: STRIPE_FAILED_STATUS,
        message: isKeyRefused(stripeType) ? STRIPE_KEY_REFUSED : STRIPE_UNAVAILABLE,
        err,
        stage: "admin.founding-trial.stripe",
      });
    }
    return fromException(request, err, { stage: "admin.founding-trial" });
  }
}
