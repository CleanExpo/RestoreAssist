import { prisma } from "@/lib/prisma";
import { disconnectCliPrisma } from "./cli-prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

/**
 * RA-6954 — one-shot grandfather backfill for the CLIENT_COMMS add-on gate.
 *
 * Restoration Pulse client-comms sends (lib/pulse/dispatcher.ts,
 * lib/pulse/review-ask.ts — epic RA-6948) predate the CLIENT_COMMS
 * entitlement gate by several weeks and have been sending real client emails
 * for free. Any workspace whose owner has already had at least one Pulse
 * email actually SENT (a real ClientCommsLog row with status SENT) is
 * grandfathered with an ACTIVE FeatureEntitlement so the new gate does not
 * lock out existing usage — mirrors scripts/grandfather-payments-addon.ts.
 *
 * Run in the same deploy window as the gate lands. Idempotent — the upsert
 * is a no-op on repeat runs once the entitlement is active.
 */
export async function grandfatherClientCommsAddon(): Promise<{
  grandfathered: number;
  skipped: number;
}> {
  const senders = await prisma.inspection.findMany({
    where: { clientCommsLogs: { some: { status: "SENT" } } },
    select: { userId: true },
    distinct: ["userId"],
  });

  let grandfathered = 0;
  let skipped = 0;

  for (const { userId } of senders) {
    const workspace = await getWorkspaceForUser(userId);
    if (!workspace) {
      skipped++;
      continue;
    }

    await prisma.featureEntitlement.upsert({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: "CLIENT_COMMS" },
      },
      create: { workspaceId: workspace.id, sku: "CLIENT_COMMS", active: true },
      update: { active: true },
    });
    grandfathered++;
  }

  return { grandfathered, skipped };
}

/** Run the CLI. Returns the process exit code; never calls process.exit. */
export async function main(): Promise<number> {
  let code: number;
  try {
    const r = await grandfatherClientCommsAddon();
    console.log(
      `Grandfather backfill: entitled ${r.grandfathered} workspace(s) for CLIENT_COMMS (${r.skipped} skipped — no workspace)`,
    );
    code = 0;
  } catch (e) {
    console.error(e);
    code = 1;
  }
  // Only a client this run initialised is disconnected; a failed cleanup is a failure.
  return (await disconnectCliPrisma()) ? code : 1;
}
