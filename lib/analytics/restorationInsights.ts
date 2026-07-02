import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * RA-6917 Phase 2 — de-identified aggregation over the RestorationIncident data
 * asset, for annual-report / industry-topic outputs.
 *
 * N-ANONYMITY (owner-confirmed 2026-07-02): any grouped cell with fewer than
 * MIN_CELL_COUNT incidents is SUPPRESSED, so a postcode+category combination can
 * never re-identify a single job. This is the published-output safety valve and
 * must not be weakened.
 */
export const MIN_CELL_COUNT = 5;

export type IncidentDimension =
  | "state"
  | "postcode"
  | "waterCategory"
  | "damageClass"
  | "lossSource";

const ALLOWED_DIMENSIONS: readonly IncidentDimension[] = [
  "state",
  "postcode",
  "waterCategory",
  "damageClass",
  "lossSource",
];

export interface InsightCell {
  /** The grouped dimension values for this cell (e.g. { state: "NSW", waterCategory: "CAT_3" }). */
  key: Record<string, string | null>;
  count: number;
  avgRemediationDays: number | null;
  /** RA-6917 Phase 3 — avg derived floor area (operator-measured only). */
  avgFloorAreaM2: number | null;
}

export interface RestorationInsights {
  dimensions: IncidentDimension[];
  minCellCount: number;
  cells: InsightCell[];
  /** Groups dropped because they fell below the anonymity threshold. */
  suppressedCells: number;
  /** Sum of counts across the surviving (published) cells only. */
  totalIncidents: number;
}

export interface InsightFilters {
  state?: string;
  from?: Date;
  to?: Date;
}

/**
 * Aggregate the incident asset by the requested dimensions, suppressing any cell
 * below MIN_CELL_COUNT. Reads the de-identified RestorationIncident table only —
 * no PII, no per-tenant scoping (the asset is deliberately cross-org).
 */
export async function getRestorationInsights(
  dimensions: IncidentDimension[],
  filters: InsightFilters = {},
): Promise<RestorationInsights> {
  const by = dimensions.filter((d) => ALLOWED_DIMENSIONS.includes(d));
  if (by.length === 0) by.push("state");

  const where: Prisma.RestorationIncidentWhereInput = {};
  if (filters.state) where.state = filters.state;
  if (filters.from || filters.to) {
    where.capturedAt = {};
    if (filters.from) where.capturedAt.gte = filters.from;
    if (filters.to) where.capturedAt.lte = filters.to;
  }

  const groups = await prisma.restorationIncident.groupBy({
    by: by as Prisma.RestorationIncidentScalarFieldEnum[],
    where,
    _count: { id: true },
    _avg: { remediationDays: true, floorAreaM2: true },
  });

  let suppressedCells = 0;
  const cells: InsightCell[] = [];

  for (const group of groups as Array<
    Record<string, unknown> & {
      _count: { id: number };
      _avg: { remediationDays: number | null; floorAreaM2: number | null };
    }
  >) {
    const count = group._count.id;
    if (count < MIN_CELL_COUNT) {
      suppressedCells += 1;
      continue;
    }
    const key: Record<string, string | null> = {};
    for (const d of by) {
      const value = group[d];
      key[d] = value == null ? null : String(value);
    }
    cells.push({
      key,
      count,
      avgRemediationDays: group._avg.remediationDays,
      avgFloorAreaM2: group._avg.floorAreaM2,
    });
  }

  const totalIncidents = cells.reduce((sum, c) => sum + c.count, 0);

  return {
    dimensions: by,
    minCellCount: MIN_CELL_COUNT,
    cells,
    suppressedCells,
    totalIncidents,
  };
}
