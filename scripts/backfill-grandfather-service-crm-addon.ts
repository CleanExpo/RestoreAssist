import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { SERVICE_CRM_SKU } from "@/lib/billing/service-crm-addon";

/**
 * RA-6920 B1 — grandfather backfill for the SERVICE_CRM add-on gate.
 *
 * Gating `requireAddon("SERVICE_CRM")` at the Ascora / DR-NRPG connect (and
 * ascora/sync) surfaces would 402 every workspace that already connected one
 * of these integrations before the add-on existed. This one-off backfill
 * marks every such workspace's `FeatureEntitlement{sku: SERVICE_CRM}` as
 * `active = true` so no current user is broken by the new gate.
 *
 * Idempotent — a workspace already marked active is left alone, so this is
 * safe to re-run. Run once in the same deploy window the gate ships in:
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-grandfather-service-crm-addon.ts --dry-run
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-grandfather-service-crm-addon.ts
 */

const DRY_RUN = process.argv.includes("--dry-run");

export interface GrandfatherServiceCrmResult {
  usersWithIntegration: number;
  workspacesGrandfathered: number;
  alreadyEntitled: number;
  noWorkspace: number;
}

export async function grandfatherServiceCrmAddon(): Promise<GrandfatherServiceCrmResult> {
  const [ascoraUsers, drNrpgUsers] = await Promise.all([
    (prisma as any).ascoraIntegration.findMany({
      where: { isActive: true },
      select: { userId: true },
    }),
    (prisma as any).drNrpgIntegration.findMany({
      where: { isActive: true },
      select: { userId: true },
    }),
  ]);

  const userIds = new Set<string>([
    ...ascoraUsers.map((r: { userId: string }) => r.userId),
    ...drNrpgUsers.map((r: { userId: string }) => r.userId),
  ]);

  let workspacesGrandfathered = 0;
  let alreadyEntitled = 0;
  let noWorkspace = 0;
  const seenWorkspaces = new Set<string>();

  for (const userId of userIds) {
    const workspace = await getWorkspaceForUser(userId);
    if (!workspace) {
      noWorkspace++;
      continue;
    }
    // Multiple integration-owning users can share a workspace (owner +
    // members) — only grandfather each workspace once.
    if (seenWorkspaces.has(workspace.id)) continue;
    seenWorkspaces.add(workspace.id);

    const existing = await prisma.featureEntitlement.findUnique({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: SERVICE_CRM_SKU },
      },
      select: { active: true },
    });

    if (existing?.active) {
      alreadyEntitled++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.featureEntitlement.upsert({
        where: {
          workspaceId_sku: { workspaceId: workspace.id, sku: SERVICE_CRM_SKU },
        },
        create: { workspaceId: workspace.id, sku: SERVICE_CRM_SKU, active: true },
        update: { active: true },
      });
    }
    workspacesGrandfathered++;
  }

  return {
    usersWithIntegration: userIds.size,
    workspacesGrandfathered,
    alreadyEntitled,
    noWorkspace,
  };
}

// ESM-compatible CLI entry point (project uses "type": "module")
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].split("/").pop() ?? "");
if (isMainModule) {
  grandfatherServiceCrmAddon()
    .then((r) => {
      console.log(
        `${DRY_RUN ? "[dry-run] " : ""}SERVICE_CRM grandfather backfill: ` +
          `${r.usersWithIntegration} users with an active integration, ` +
          `${r.workspacesGrandfathered} workspaces ${DRY_RUN ? "would be" : ""} grandfathered, ` +
          `${r.alreadyEntitled} already entitled, ${r.noWorkspace} with no workspace.`,
      );
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[backfill-grandfather-service-crm-addon] failed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
