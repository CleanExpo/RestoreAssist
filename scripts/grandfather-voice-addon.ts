import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import { VOICE_SKU } from "@/lib/billing/voice-addon";

/**
 * One-shot grandfather backfill for RA-6920 B2. Every workspace with an
 * ACTIVE ElevenLabs `ProviderConnection` (i.e. already has its own BYOK key
 * configured, which is the only way the ElevenLabs SFX route could have been
 * called before this PR) gets an ACTIVE `FeatureEntitlement` for the VOICE
 * sku, so the new `requireAddon(VOICE)` gate at `/api/elevenlabs/sfx` doesn't
 * 402 an existing user out of a feature they already set up and are using.
 *
 * Run in the same maintenance window as deploying this gate, BEFORE it goes
 * live in production. New ElevenLabs key connections (post-deploy) are NOT
 * backfilled — they hit the gate like any other unentitled workspace, which
 * is the intended behaviour.
 *
 * Idempotent — `upsert` on the unique (workspaceId, sku) key means repeated
 * runs are no-ops once active=true.
 */
export async function grandfatherVoiceAddon(): Promise<{
  granted: number;
}> {
  const connections = await prisma.providerConnection.findMany({
    where: { provider: "ELEVENLABS", status: "ACTIVE" },
    select: { workspaceId: true },
  });

  const workspaceIds = new Set(connections.map((c) => c.workspaceId));

  let granted = 0;
  for (const workspaceId of workspaceIds) {
    await prisma.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId, sku: VOICE_SKU } },
      create: { workspaceId, sku: VOICE_SKU, active: true },
      update: { active: true },
    });
    granted += 1;
  }

  return { granted };
}

// ESM-compatible CLI entry point (project uses "type": "module")
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].split("/").pop() ?? "");
if (isMainModule) {
  grandfatherVoiceAddon()
    .then((r) => {
      console.log(
        `Grandfather backfill: granted VOICE entitlement to ${r.granted} workspace(s)`,
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
