/**
 * RA-6917 Phase 2 — admin-only endpoint over the de-identified restoration data
 * asset. Returns N-anonymity-suppressed aggregates for annual-report / industry
 * outputs. The underlying table holds no PII and is cross-org, but access is
 * gated to platform admins (re-validated from the DB, not the JWT).
 *
 * GET /api/admin/restoration-insights?dimensions=state,waterCategory&state=NSW&from=2026-01-01&to=2026-12-31
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";
import {
  getRestorationInsights,
  type IncidentDimension,
} from "@/lib/analytics/restorationInsights";

const VALID_DIMENSIONS: IncidentDimension[] = [
  "state",
  "postcode",
  "waterCategory",
  "damageClass",
  "lossSource",
];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const dimensions = (searchParams.get("dimensions") ?? "state")
      .split(",")
      .map((d) => d.trim())
      .filter((d): d is IncidentDimension =>
        VALID_DIMENSIONS.includes(d as IncidentDimension),
      );

    const state = searchParams.get("state") ?? undefined;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;

    const insights = await getRestorationInsights(dimensions, {
      state,
      from: from && !Number.isNaN(from.getTime()) ? from : undefined,
      to: to && !Number.isNaN(to.getTime()) ? to : undefined,
    });

    return NextResponse.json({ data: insights });
  } catch (error) {
    return fromException(request, error);
  }
}
