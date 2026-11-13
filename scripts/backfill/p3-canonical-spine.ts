/**
 * V1 Phase 3 backfill — populate Inspection.clientId from Report.clientId
 * and Inspection.reportId where missing but report exists by address (legacy).
 *
 * Usage: npx tsx scripts/backfill/p3-canonical-spine.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const rows = await prisma.inspection.findMany({
    where: { clientId: null, reportId: { not: null } },
    select: {
      id: true,
      reportId: true,
      report: { select: { clientId: true } },
    },
    take: 5000,
  });

  let updated = 0;
  for (const row of rows) {
    const clientId = row.report?.clientId;
    if (!clientId) continue;
    if (!dryRun) {
      await prisma.inspection.update({
        where: { id: row.id },
        data: { clientId },
      });
    }
    updated++;
  }

  console.log(
    `[p3-backfill] clientId from report: ${updated}${dryRun ? " (dry-run)" : ""}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
