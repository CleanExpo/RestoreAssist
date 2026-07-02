/**
 * POST /api/inspections/[id]/close-summary
 *
 * Returns a freshly-drafted close summary for the inspection. Distinct
 * route from /close so each regeneration is observable in the AuditLog
 * as a separate credit-charged event (§5.2 — admins can compare draft
 * vs final).
 *
 * Body: { invoiceId?: string }
 * Returns: { draft: { text: string, inspectionNumber: string }, source }
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 6.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { buildCloseSummary } from "@/lib/ai/lifecycle/on-close";
import { apiError, fromException } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: inspectionId } = await params;

  // Tenancy gate — owner OR active workspace member (admin bypass inside helper).
  const tenancy = await assertInspectionTenancy(session, inspectionId);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  let body: { invoiceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is acceptable — invoiceId is optional.
  }

  try {
    const result = await buildCloseSummary({
      inspectionId,
      invoiceId: body.invoiceId ?? null,
      userId: session.user.id,
      orgId: tenancy.data.workspaceId,
    });

    if (!result.ok) {
      if (result.code === "SUBSCRIPTION_REQUIRED") {
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message: "Subscription required",
          status: 402,
        });
      }
      // Rule 7 — never leak internal error.message.
      return apiError(request, {
        code: "INTERNAL",
        message: "Internal server error",
        status: 500,
      });
    }

    return NextResponse.json({
      draft: result.draft,
      source: result.source,
    });
  } catch (err) {
    return fromException(request, err, { stage: "close-summary" });
  }
}
