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
import { fromException } from "@/lib/api-errors";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import {
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
    });
    return NextResponse.json(
      { outcome, organizationId: org.id },
      { status: STATUS_CODE[outcome.status] ?? 500 },
    );
  } catch (err) {
    if (err instanceof FoundingTrialGrantError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return fromException(request, err, { stage: "admin.founding-trial" });
  }
}
