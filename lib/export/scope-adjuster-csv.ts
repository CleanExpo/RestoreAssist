/**
 * Wave 4 (W4-1) — adjuster-friendly scope CSV from captured ScopeItems + costs.
 */

export type AdjusterScopeCsvRow = {
  lineNumber: number;
  itemType: string;
  description: string;
  quantity: string;
  unit: string;
  clauseRef: string;
  required: string;
  selected: string;
  costCategory: string;
  rate: string;
  subtotalExTax: string;
  justification: string;
};

export type ScopeItemForCsv = {
  id: string;
  itemType: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  clauseRef: string | null;
  isRequired: boolean;
  isSelected: boolean;
  justification: string | null;
};

export type CostEstimateForCsv = {
  scopeItemId: string | null;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  subtotal: number;
};

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function costForScopeItem(
  scopeItemId: string,
  estimates: readonly CostEstimateForCsv[],
) {
  const rows = estimates.filter((e) => e.scopeItemId === scopeItemId);
  if (rows.length === 0) return null;
  const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const primary = rows[0]!;
  return { category: primary.category, rate: primary.rate, subtotal };
}

export function buildAdjusterScopeCsvRows(
  scopeItems: readonly ScopeItemForCsv[],
  costEstimates: readonly CostEstimateForCsv[],
): AdjusterScopeCsvRow[] {
  return scopeItems
    .filter((s) => s.isSelected)
    .map((item, index) => {
      const linked = costForScopeItem(item.id, costEstimates);
      return {
        lineNumber: index + 1,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity != null ? String(item.quantity) : "",
        unit: item.unit ?? "",
        clauseRef: item.clauseRef ?? "",
        required: item.isRequired ? "yes" : "no",
        selected: "yes",
        costCategory: linked?.category ?? "",
        rate: linked != null ? linked.rate.toFixed(2) : "",
        subtotalExTax: linked != null ? linked.subtotal.toFixed(2) : "",
        justification: (item.justification ?? "").replace(/\s+/g, " ").trim(),
      };
    });
}

const HEADER = [
  "line_number",
  "item_type",
  "description",
  "quantity",
  "unit",
  "clause_ref",
  "required",
  "selected",
  "cost_category",
  "rate_ex_tax",
  "subtotal_ex_tax",
  "justification",
];

export function renderAdjusterScopeCsv(
  meta: {
    jobNumber: string;
    claimReference: string;
    propertyAddress: string;
  },
  rows: AdjusterScopeCsvRow[],
): string {
  const preamble = [
    `# RestoreAssist adjuster scope export`,
    `# job_number,${csvCell(meta.jobNumber)}`,
    `# claim_reference,${csvCell(meta.claimReference)}`,
    `# property_address,${csvCell(meta.propertyAddress)}`,
    "",
    HEADER.join(","),
  ];
  const body = rows.map((row) =>
    [
      row.lineNumber,
      csvCell(row.itemType),
      csvCell(row.description),
      csvCell(row.quantity),
      csvCell(row.unit),
      csvCell(row.clauseRef),
      csvCell(row.required),
      csvCell(row.selected),
      csvCell(row.costCategory),
      csvCell(row.rate),
      csvCell(row.subtotalExTax),
      csvCell(row.justification),
    ].join(","),
  );
  return [...preamble, ...body].join("\n");
}

export function buildAdjusterScopeCsvFromInspection(input: {
  jobNumber: string;
  claimReference: string;
  propertyAddress: string;
  scopeItems: readonly ScopeItemForCsv[];
  costEstimates: readonly CostEstimateForCsv[];
}): string {
  const rows = buildAdjusterScopeCsvRows(
    input.scopeItems,
    input.costEstimates,
  );
  return renderAdjusterScopeCsv(
    {
      jobNumber: input.jobNumber,
      claimReference: input.claimReference,
      propertyAddress: input.propertyAddress,
    },
    rows,
  );
}