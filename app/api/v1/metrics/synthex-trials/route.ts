/**
 * GET /api/v1/metrics/synthex-trials?window=7d|30d|90d — SPM audit G7.
 *
 * Count-only outcome read for Synthex, the internal marketing agency, which
 * reports it to Mission Control as `outcome.trials`. Counts of
 * Synthex-attributed signups, how many saved a first report, and how many are
 * paying now. No email, user id or attribution detail is returned; internal
 * and test accounts are excluded (lib/analytics/attributed-trials.ts).
 *
 * Auth (either passes), the /api/v1/connections/status pattern:
 *  1. `Authorization: Bearer <SYNTHEX_METRICS_TOKEN>`, timing-safe. While the
 *     token is unset a bearer caller gets 503 so Synthex can tell "not armed"
 *     from "wrong key" (401). It never falls open.
 *  2. A platform-staff session (verifyAdminFromDb + verifyPlatformSupportOperator):
 *     these are RestoreAssist's own figures, not a tenant's.
 *
 * A read failure returns 500, never a zero count: Synthex must report
 * "unknown", not "no trials".
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  countSynthexTrials,
  TRIAL_COUNT_WINDOWS,
  type TrialCountWindow,
} from "@/lib/analytics/attributed-trials";

export const dynamic = "force-dynamic";

type BearerResult = "absent" | "unconfigured" | "mismatch" | "match";

function checkBearer(request: NextRequest): BearerResult {
  const header = request.headers.get("authorization");
  if (!header) return "absent";
  const token = process.env.SYNTHEX_METRICS_TOKEN;
  if (!token) return "unconfigured";
  try {
    const a = Buffer.from(header, "utf8");
    const b = Buffer.from(`Bearer ${token}`, "utf8");
    return a.length === b.length && timingSafeEqual(a, b) ? "match" : "mismatch";
  } catch {
    return "mismatch";
  }
}

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    prefix: "synthex-trials",
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const bearer = checkBearer(request);
  if (bearer === "unconfigured") {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (bearer === "mismatch") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (bearer === "absent") {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const operator = verifyPlatformSupportOperator(auth);
    if (operator.response) return operator.response;
  }

  const window = request.nextUrl.searchParams.get("window") ?? "7d";
  if (!Object.hasOwn(TRIAL_COUNT_WINDOWS, window)) {
    return NextResponse.json(
      { error: "window must be one of 7d, 30d, 90d" },
      { status: 400 },
    );
  }

  try {
    const counts = await countSynthexTrials(window as TrialCountWindow);
    return NextResponse.json(counts, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[metrics/synthex-trials] read failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
