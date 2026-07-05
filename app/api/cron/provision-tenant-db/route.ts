import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { provisionPendingTenantDbs } from "@/lib/cron/provision-tenant-db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Tenant-DB provisioning worker (RA-6873, worker half).
 *
 * Drives workspaces in `tenantDbStatus=provisioning` (and resumes `error`) through
 * connectivity test → tenant baseline migration → ready. Fail-closed CRON_SECRET
 * auth. Runs every 5 minutes so a fresh onboarding submission is picked up
 * promptly and a transient failure is retried on the next tick.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("provision-tenant-db", provisionPendingTenantDbs);
  return NextResponse.json(result);
}
