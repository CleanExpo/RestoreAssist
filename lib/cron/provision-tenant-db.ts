/**
 * provision-tenant-db.ts — Tenant-DB provisioning worker (RA-6873, worker half).
 *
 * Consumes workspaces whose `tenantDbStatus` is `provisioning` (a fresh
 * onboarding submission) or `error` (a prior attempt to resume), and drives the
 * provisioning state machine (`lib/tenant/provision.ts`) with its real
 * DB-touching dependencies (`lib/tenant/provision-deps.ts`):
 *
 *   validate → connectivity test → tenant baseline migration → store → ready
 *
 * The state machine flips the workspace to `ready` (via the markReady dep) on
 * success. On failure this worker records the phase it reached in
 * `tenantDbProvisionPhase`, so the next run resumes from that phase instead of
 * restarting. It is idempotent: `ready` workspaces are never selected, and a
 * mid-`error` workspace simply resumes.
 *
 * G2 first-claim write-cutover is explicitly OUT of scope for this worker.
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";
import { provisionTenantDb, type ProvisionPhase } from "@/lib/tenant/provision";
import { buildProvisionDeps } from "@/lib/tenant/provision-deps";
import type { CronJobResult } from "./runner";

// Provisioning applies real migrations (slow, DDL-heavy). Keep the per-run batch
// small so the Vercel function (maxDuration 60s) is never killed mid-migration,
// and process least-recently-touched workspaces first so none is starved.
const BATCH_SIZE = 1;

interface PendingWorkspace {
  id: string;
  tenantDbConnectionEnc: string | null;
  tenantDbProvisionPhase: string | null;
}

export async function provisionPendingTenantDbs(): Promise<CronJobResult> {
  const pending = (await prisma.workspace.findMany({
    where: { tenantDbStatus: { in: ["provisioning", "error"] } },
    select: {
      id: true,
      tenantDbConnectionEnc: true,
      tenantDbProvisionPhase: true,
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_SIZE,
  } as never)) as unknown as PendingWorkspace[];

  if (pending.length === 0) {
    return { itemsProcessed: 0, metadata: { reason: "no-pending-workspaces" } };
  }

  let ready = 0;
  let errored = 0;
  const results: Array<{ id: string; status: string; phase?: ProvisionPhase }> = [];

  for (const ws of pending) {
    // A workspace in `provisioning`/`error` with no stored connection can never
    // progress — pin it to `error` at the first phase so it stops being retried
    // as if a connection existed.
    if (!ws.tenantDbConnectionEnc) {
      const recorded = await markError(ws.id, null, "validate");
      if (recorded) {
        errored++;
        results.push({ id: ws.id, status: "error", phase: "validate" });
      } else {
        results.push({ id: ws.id, status: "stale" });
      }
      continue;
    }

    let connectionString: string;
    try {
      connectionString = decrypt(ws.tenantDbConnectionEnc);
    } catch {
      const recorded = await markCredentialError(ws.id, ws.tenantDbConnectionEnc);
      if (recorded) errored++;
      results.push({
        id: ws.id,
        status: recorded ? "credential_error" : "stale",
        phase: "validate",
      });
      continue;
    }
    const resumeFrom = (ws.tenantDbProvisionPhase ?? undefined) as
      | ProvisionPhase
      | undefined;

    const result = await provisionTenantDb(
      { workspaceId: ws.id, connectionString, resumeFrom },
      buildProvisionDeps(ws.tenantDbConnectionEnc),
    );

    if (result.status === "ready") {
      // markReady (a dep) already flipped status→ready and cleared the phase.
      ready++;
      results.push({ id: ws.id, status: "ready" });
    } else {
      const recorded = await markError(
        ws.id,
        ws.tenantDbConnectionEnc,
        result.reachedPhase,
      );
      if (recorded) {
        errored++;
        results.push({ id: ws.id, status: "error", phase: result.reachedPhase });
      } else {
        results.push({ id: ws.id, status: "stale" });
      }
    }
  }

  return {
    itemsProcessed: pending.length,
    metadata: { ready, errored, results },
  };
}

/** Quarantine an unreadable ciphertext so it cannot starve the oldest-first queue. */
async function markCredentialError(
  workspaceId: string,
  expectedConnectionEnc: string,
): Promise<boolean> {
  const result = await prisma.workspace.updateMany({
    where: {
      id: workspaceId,
      tenantDbConnectionEnc: expectedConnectionEnc,
      tenantDbStatus: { in: ["provisioning", "error"] },
    },
    data: {
      tenantDbStatus: "credential_error",
      tenantDbProvisionPhase: "validate",
    } as never,
  });
  return result.count === 1;
}

/** Record a failed attempt with its resumable phase marker. */
async function markError(
  workspaceId: string,
  expectedConnectionEnc: string | null,
  phase: ProvisionPhase,
): Promise<boolean> {
  const result = await prisma.workspace.updateMany({
    where: {
      id: workspaceId,
      tenantDbConnectionEnc: expectedConnectionEnc,
      tenantDbStatus: { in: ["provisioning", "error"] },
    },
    data: {
      tenantDbStatus: "error",
      tenantDbProvisionPhase: phase,
    } as never,
  });
  return result.count === 1;
}
