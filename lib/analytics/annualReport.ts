import { prisma } from "@/lib/prisma";
import {
  getRestorationInsights,
  MIN_CELL_COUNT,
  type IncidentDimension,
  type InsightCell,
} from "@/lib/analytics/restorationInsights";

/**
 * RA-6917 Phase 2.5 — de-identified annual report over the restoration data
 * asset. Assembles a year's incidents into a set of N-anonymity-suppressed
 * breakdowns (JSON) and a flat CSV, for annual-report / industry-topic use.
 *
 * PRIVACY: every breakdown reuses getRestorationInsights, so the N>=5 cell
 * suppression applies throughout. The single headline total is also gated: if
 * the whole year has fewer than MIN_CELL_COUNT incidents, the report is
 * suppressed entirely (no breakdowns, no total emitted).
 */

/** The breakdowns a report always attempts (each suppressed to N>=5). */
const REPORT_BREAKDOWNS: { label: string; dimensions: IncidentDimension[] }[] = [
  { label: "by_state", dimensions: ["state"] },
  { label: "by_water_category", dimensions: ["waterCategory"] },
  { label: "by_damage_class", dimensions: ["damageClass"] },
  { label: "by_loss_source", dimensions: ["lossSource"] },
  { label: "by_state_water_category", dimensions: ["state", "waterCategory"] },
];

export interface AnnualReportSection {
  breakdown: string;
  dimensions: IncidentDimension[];
  cells: InsightCell[];
  suppressedCells: number;
}

export interface AnnualReport {
  year: number;
  state: string | null;
  minCellCount: number;
  /** True count of incidents in the year (a single aggregate; not re-identifying). */
  totalIncidents: number;
  /** When totalIncidents < minCellCount the whole report is withheld. */
  suppressed: boolean;
  sections: AnnualReportSection[];
  notes: string[];
}

export async function buildAnnualReport(
  year: number,
  filters: { state?: string } = {},
): Promise<AnnualReport> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const state = filters.state ?? null;

  const where = {
    capturedAt: { gte: from, lte: to },
    ...(state ? { state } : {}),
  };
  const totalIncidents = await prisma.restorationIncident.count({ where });

  const notes = [
    `Cells with fewer than ${MIN_CELL_COUNT} incidents are suppressed to protect privacy (N-anonymity).`,
    "Geography is postcode-level at finest; no address, owner, or narrative is included.",
  ];

  // Whole-report suppression when the year itself is too small to publish.
  if (totalIncidents < MIN_CELL_COUNT) {
    return {
      year,
      state,
      minCellCount: MIN_CELL_COUNT,
      totalIncidents: 0,
      suppressed: true,
      sections: [],
      notes: [
        `Insufficient data for ${year}: fewer than ${MIN_CELL_COUNT} incidents in scope; report withheld.`,
      ],
    };
  }

  const sections: AnnualReportSection[] = [];
  for (const b of REPORT_BREAKDOWNS) {
    const insight = await getRestorationInsights(b.dimensions, {
      state: filters.state,
      from,
      to,
    });
    sections.push({
      breakdown: b.label,
      dimensions: insight.dimensions,
      cells: insight.cells,
      suppressedCells: insight.suppressedCells,
    });
  }

  return {
    year,
    state,
    minCellCount: MIN_CELL_COUNT,
    totalIncidents,
    suppressed: false,
    sections,
    notes,
  };
}

/** Escape a CSV field: wrap in quotes, double internal quotes, and neutralise
 *  spreadsheet formula-injection by prefixing a leading =,+,-,@ with a quote. */
function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Flatten an AnnualReport to a single CSV: one row per published cell. */
export function toAnnualReportCsv(report: AnnualReport): string {
  const header = [
    "breakdown",
    "state",
    "waterCategory",
    "damageClass",
    "lossSource",
    "incidentCount",
    "avgRemediationDays",
    "avgFloorAreaM2",
  ];
  const rows: string[] = [header.map(csvField).join(",")];

  // Headline total as its own row.
  rows.push(
    [
      csvField("total"),
      csvField(report.state ?? "ALL"),
      "",
      "",
      "",
      csvField(report.totalIncidents),
      "",
      "",
    ].join(","),
  );

  for (const section of report.sections) {
    for (const cell of section.cells) {
      rows.push(
        [
          csvField(section.breakdown),
          csvField(cell.key.state ?? ""),
          csvField(cell.key.waterCategory ?? ""),
          csvField(cell.key.damageClass ?? ""),
          csvField(cell.key.lossSource ?? ""),
          csvField(cell.count),
          csvField(
            cell.avgRemediationDays === null
              ? ""
              : Math.round(cell.avgRemediationDays * 10) / 10,
          ),
          csvField(
            cell.avgFloorAreaM2 === null
              ? ""
              : Math.round(cell.avgFloorAreaM2),
          ),
        ].join(","),
      );
    }
  }

  return rows.join("\r\n") + "\r\n";
}
