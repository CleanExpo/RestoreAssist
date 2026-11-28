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
 *     Preview with a bare 500), the operator gets a 503 that says so, and
 *     nothing is written.
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
  FoundingTrialGrantError,
  runFoundingTrialGrant,
} from "@/lib/billing/founding-trial-grant";

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
      { outcome, organizationId: org.id },
      { status: STATUS_CODE[outcome.status] ?? 500 },
    );
  } catch (err) {
    if (err instanceof FoundingTrialGrantError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const stripeType = stripeErrorType(err);
    if (stripeType) {
      const keyRefused =
        stripeType === "StripeAuthenticationError" ||
        stripeType === "StripePermissionError";
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        status: 503,
        message: keyRefused ? STRIPE_KEY_REFUSED : STRIPE_UNAVAILABLE,
        err,
        stage: "admin.founding-trial.stripe",
      });
    }
    return fromException(request, err, { stage: "admin.founding-trial" });
  }
}
