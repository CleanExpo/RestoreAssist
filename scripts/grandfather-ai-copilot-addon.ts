import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

/**
 * One-shot grandfather backfill for the AI_COPILOT add-on gate.
 *
 * The Margot technician co-pilot (the `app/api/live-teacher/*` routes) predates
 * its entitlement gate. Until now it was gated only on an active base
 * subscription plus a workspace-supplied Anthropic key, so any workspace that
 * brought a key has been using it inside the $99/month base plan. Switching the
 * gate on without this backfill removes a tool a technician may be standing in a
 * flooded property relying on, mid-job, with no warning. Mirrors
 * scripts/grandfather-client-comms-addon.ts, which exists because CLIENT_COMMS
 * hit exactly this.
 *
 * WHAT COUNTS AS "ALREADY USING IT". A LiveTeacherSession row on its own is not
 * enough — a session is created when the panel is opened, so an open-and-close
 * with no question asked would look identical to real use. The bar here is at
 * least one `role: "user"` TeacherUtterance: the technician actually asked the
 * co-pilot something. This is the same shape as the CLIENT_COMMS backfill, which
 * keyed on a ClientCommsLog actually reaching status SENT rather than merely
 * existing.
 *
 * Deliberately generous at the edges. Grandfathering a workspace that would not
 * have paid costs $11/month of foregone revenue; failing to grandfather one that
 * depends on the co-pilot breaks a live job. Those are not symmetric.
 *
 * RUN IT IN THE SAME DEPLOY WINDOW AS THE GATE, BEFORE the gate goes live.
 * Idempotent — the upsert is a no-op on repeat runs once the entitlement is
 * active.
 */
export async function grandfatherAiCopilotAddon(): Promise<{
  grandfathered: number;
  skipped: number;
}> {
  const users = await prisma.liveTeacherSession.findMany({
    where: { utterances: { some: { role: "user" } } },
    select: { userId: true },
    distinct: ["userId"],
  });

  let grandfathered = 0;
  let skipped = 0;

  for (const { userId } of users) {
    const workspace = await getWorkspaceForUser(userId);
    if (!workspace) {
      skipped++;
      continue;
    }

    await prisma.featureEntitlement.upsert({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: "AI_COPILOT" },
      },
      create: { workspaceId: workspace.id, sku: "AI_COPILOT", active: true },
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
  grandfatherAiCopilotAddon()
    .then((r) => {
      console.log(
        `Grandfather backfill: entitled ${r.grandfathered} workspace(s) for AI_COPILOT (${r.skipped} skipped — no workspace)`,
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
