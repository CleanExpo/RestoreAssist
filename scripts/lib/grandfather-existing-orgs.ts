import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";

/**
 * One-shot grandfather backfill. Marks every Organization with
 * setupCompletedAt = null as setup-complete + setupMode = MANUAL.
 *
 * Used to grandfather existing customers into the wizard's hard gate
 * WITHOUT forcing them through the wizard. New signups (post-flag-flip)
 * will have setupCompletedAt = null from the moment the Organization
 * is created, so they DO see the wizard.
 *
 * Run this in the same maintenance window as the production flag flip,
 * BEFORE setting SETUP_WIZARD_ENABLED=true on the prod env.
 *
 * Idempotent — repeated runs are no-ops because setupCompletedAt is
 * non-null after the first run.
 */
export async function grandfatherExistingOrgs(): Promise<{ marked: number }> {
  const result = await prisma.organization.updateMany({
    where: { setupCompletedAt: null },
    data: { setupCompletedAt: new Date(), setupMode: "MANUAL" },
  });
  return { marked: result.count };
}

// ESM-compatible CLI entry point (project uses "type": "module")
/** Run the CLI. Returns the process exit code; never calls process.exit. */
export async function main(): Promise<number> {
  try {
    const r = await grandfatherExistingOrgs();
    console.log(
      `Grandfather backfill: marked ${r.marked} organizations as setup-complete`,
    );
    await prisma.$disconnect();
    return 0;
  } catch (e) {
    console.error(e);
    await prisma.$disconnect();
    return 1;
  }
}
