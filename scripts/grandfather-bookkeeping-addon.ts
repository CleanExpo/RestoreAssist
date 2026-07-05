import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import {
  BOOKKEEPING_SKU,
  BOOKKEEPING_PROVIDERS,
} from "@/lib/billing/bookkeeping-addon";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

/**
 * One-shot grandfather backfill for RA-6920 B3. Every workspace with a
 * CONNECTED Xero, QuickBooks or MYOB `Integration` gets an ACTIVE
 * `FeatureEntitlement` for the BOOKKEEPING sku, so the new
 * `requireAddon(BOOKKEEPING)` gate at the connect/sync surfaces doesn't 402 an
 * existing user out of an integration they already have connected and are
 * actively using.
 *
 * Run in the same maintenance window as deploying this gate, BEFORE it goes
 * live in production. New connections (post-deploy) are NOT backfilled — they
 * hit the gate like any other unentitled workspace, which is the intended
 * behaviour.
 *
 * Idempotent — `upsert` on the unique (workspaceId, sku) key means repeated
 * runs are no-ops once active=true.
 */
export async function grandfatherBookkeepingAddon(): Promise<{
  granted: number;
  skippedNoWorkspace: number;
}> {
  const integrations = await prisma.integration.findMany({
    where: { provider: { in: BOOKKEEPING_PROVIDERS }, status: "CONNECTED" },
    select: { userId: true, workspaceId: true },
  });

  const workspaceIds = new Set<string>();
  let skippedNoWorkspace = 0;

  for (const integration of integrations) {
    const workspaceId =
      integration.workspaceId ??
      (await getWorkspaceForUser(integration.userId))?.id;
    if (!workspaceId) {
      skippedNoWorkspace += 1;
      continue;
    }
    workspaceIds.add(workspaceId);
  }

  let granted = 0;
  for (const workspaceId of workspaceIds) {
    await prisma.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId, sku: BOOKKEEPING_SKU } },
      create: { workspaceId, sku: BOOKKEEPING_SKU, active: true },
      update: { active: true },
    });
    granted += 1;
  }

  return { granted, skippedNoWorkspace };
}

// ESM-compatible CLI entry point (project uses "type": "module")
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].split("/").pop() ?? "");
if (isMainModule) {
  grandfatherBookkeepingAddon()
    .then((r) => {
      console.log(
        `Grandfather backfill: granted BOOKKEEPING entitlement to ${r.granted} workspace(s) (${r.skippedNoWorkspace} integration(s) skipped — no workspace)`,
      );
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
