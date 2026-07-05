import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

/**
 * RA-6920 B4 — one-shot grandfather backfill for the PAYMENTS add-on gate.
 *
 * The manual/bank-deposit payment-recording route
 * (app/api/invoices/[id]/payments) predates the PAYMENTS entitlement gate by
 * several months (feat(UNI-173), Jan 2026). Any workspace that already
 * recorded at least one manual payment through it is grandfathered with an
 * ACTIVE FeatureEntitlement so the new gate does not lock out existing usage.
 *
 * "Manual" is distinguished from the Xero/QuickBooks/MYOB webhook-created
 * rows (lib/integrations/webhook-processor.ts `recordInvoiceAllocation`),
 * which always stamp `externalProvider` — a row with `externalProvider: null`
 * can only have come from the manual POST route.
 *
 * Run in the same deploy window as the gate lands (mirrors
 * scripts/grandfather-existing-orgs.ts). Idempotent — the upsert is a no-op
 * on repeat runs once the entitlement is active.
 */
export async function grandfatherPaymentsAddon(): Promise<{
  grandfathered: number;
  skipped: number;
}> {
  const payers = await prisma.invoicePayment.findMany({
    where: { externalProvider: null },
    select: { userId: true },
    distinct: ["userId"],
  });

  let grandfathered = 0;
  let skipped = 0;

  for (const { userId } of payers) {
    const workspace = await getWorkspaceForUser(userId);
    if (!workspace) {
      skipped++;
      continue;
    }

    await prisma.featureEntitlement.upsert({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: "PAYMENTS" },
      },
      create: { workspaceId: workspace.id, sku: "PAYMENTS", active: true },
      update: { active: true },
    });
    grandfathered++;
  }

  return { grandfathered, skipped };
}

// ESM-compatible CLI entry point (project uses "type": "module")
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].split("/").pop() ?? "");
if (isMainModule) {
  grandfatherPaymentsAddon()
    .then((r) => {
      console.log(
        `Grandfather backfill: entitled ${r.grandfathered} workspace(s) for PAYMENTS (${r.skipped} skipped — no workspace)`,
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
