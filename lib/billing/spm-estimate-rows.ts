/**
 * RA-8419: the one writer of CostEstimate rows.
 *
 * Every route that saves estimate rows calls saveEstimateRows() inside its
 * own transaction. It:
 *   1. locks the inspection row (SELECT ... FOR UPDATE), so two writes for the
 *      same job queue instead of interleaving (Codex review round 1, P1: two
 *      concurrent appends could each see no saved SPM row and each add one);
 *   2. deletes the saved rows (replace) or reads them (append);
 *   3. applies the Senior Project Manager rule (lib/billing/spm-line.ts) with
 *      saved work counted and a saved SPM row never charged twice;
 *   4. writes the rows built by buildEstimateLines.
 *
 * It returns the estimate as saved, so callers report the same totals that
 * were written. Do not write CostEstimate rows any other way.
 */
import { Prisma } from "@prisma/client";
import type { CostEstimateResult } from "@/lib/nir-cost-estimation";
import { buildEstimateLines } from "@/lib/estimate-lines";
import { isSpmLine, withSpmLine } from "@/lib/billing/spm-line";

export interface SaveEstimateRowsArgs {
  inspectionId: string;
  estimate: CostEstimateResult;
  /** The property's country (Inspection.propertyCountry). */
  country: string | null | undefined;
  /** true: replace every saved row. false: add to the saved rows. */
  replace: boolean;
}

export async function saveEstimateRows(
  tx: Prisma.TransactionClient,
  args: SaveEstimateRowsArgs,
): Promise<CostEstimateResult> {
  const { inspectionId, estimate, country, replace } = args;

  // 1. Queue behind any other estimate write for this job until commit.
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Inspection" WHERE "id" = ${inspectionId} FOR UPDATE`,
  );

  // 2. Saved rows: removed, or counted.
  let priorTotalExGst = 0;
  let spmAlreadyCharged = false;
  if (replace) {
    await tx.costEstimate.deleteMany({ where: { inspectionId } });
  } else {
    const saved = await tx.costEstimate.findMany({
      where: { inspectionId },
      select: { total: true, lineKind: true },
    });
    for (const row of saved) {
      if (isSpmLine(row)) spmAlreadyCharged = true;
      else priorTotalExGst += Number(row.total);
    }
  }

  // 3. The SPM rule, measured on the whole job.
  const priced = withSpmLine(estimate, {
    country,
    priorTotalExGst,
    spmAlreadyCharged,
  });

  // 4. Write.
  await tx.costEstimate.createMany({
    data: buildEstimateLines(priced).map((line) => ({
      inspectionId,
      ...line,
    })),
  });
  return priced;
}
