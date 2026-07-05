import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { POST as syncAscoraHistorical } from "@/app/api/ascora/sync/route";

/**
 * GET /api/cron/sync-ascora-historical — RA-275
 *
 * The historical Ascora importer (POST /api/ascora/sync) already supports a
 * CRON_SECRET bearer-token path (sync/route.ts) and an `?incremental=true`
 * mode, but nothing ever invoked it — no cron entry existed and the
 * dashboard "Sync" button drives the separate generic client/job pipeline
 * (lib/integrations/ascora/client.ts), not this historical importer.
 *
 * Wired into vercel.json (daily, off-peak: 02:30). Re-invokes the sync
 * route's own POST handler in-process (not over HTTP) with the same
 * Authorization header this request was already verified against, so the
 * importer's existing CRON_SECRET auth path is reused unchanged.
 *
 * Mirrors the /api/cron/sync-xero-payments / sync-qbo-myob-payments pattern:
 * verifyCronAuth → runCronJob (overlap protection + audit trail) → always
 * 200 with structured stats.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const jobResult = await runCronJob("sync-ascora-historical", async () => {
    const innerUrl = new URL("/api/ascora/sync?incremental=true", request.url);
    const innerRequest = new NextRequest(innerUrl, {
      method: "POST",
      headers: {
        authorization: request.headers.get("authorization") ?? "",
      },
    });

    const res = await syncAscoraHistorical(innerRequest);
    const body = await res.json();

    if (!res.ok || body?.success === false) {
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : (body?.error?.message ?? `Ascora historical sync failed (${res.status})`),
      );
    }

    return {
      itemsProcessed: body.jobsImported ?? 0,
      metadata: body,
    };
  });

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/cron/sync-ascora-historical — manual trigger (same auth, useful for testing)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
