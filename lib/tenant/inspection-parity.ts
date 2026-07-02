/**
 * Read-parity comparator for the tenant-DB read-shadow pilot (PR: tenant-db-pilot).
 *
 * Given the same logical rows read from the shared DB and from a tenant DB, report
 * whether they are byte-for-parity equal: rows missing on either side and, for rows
 * present on both, which fields differ. Pure and dependency-free so it can run in a
 * unit test and in the live parity harness unchanged.
 */
export interface ParityResult {
  /** True only when nothing is missing, extra, or field-mismatched. */
  match: boolean;
  /** Rows seen on the shared side. */
  total: number;
  /** Rows present on both sides with all compared fields equal. */
  matched: number;
  /** ids present in shared but absent from tenant. */
  missingInTenant: string[];
  /** ids present in tenant but absent from shared. */
  extraInTenant: string[];
  /** Per-id list of fields whose values differ. */
  fieldMismatches: { id: string; fields: string[] }[];
}

export interface ParityOptions {
  /** Row key used to pair the two sides. Default "id". */
  idKey?: string;
  /** Restrict comparison to these fields. Default: every key seen on the shared row. */
  compareFields?: string[];
}

type Row = Record<string, unknown>;

function index(rows: Row[], idKey: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) m.set(String(r[idKey]), r);
  return m;
}

export function compareInspectionParity(
  shared: Row[],
  tenant: Row[],
  opts: ParityOptions = {},
): ParityResult {
  const idKey = opts.idKey ?? "id";
  const sharedById = index(shared, idKey);
  const tenantById = index(tenant, idKey);

  const missingInTenant: string[] = [];
  const fieldMismatches: { id: string; fields: string[] }[] = [];
  let matched = 0;

  for (const [id, sRow] of sharedById) {
    const tRow = tenantById.get(id);
    if (!tRow) {
      missingInTenant.push(id);
      continue;
    }
    const fields = opts.compareFields ?? Object.keys(sRow);
    const diff = fields.filter(
      (f) => JSON.stringify(sRow[f]) !== JSON.stringify(tRow[f]),
    );
    if (diff.length > 0) fieldMismatches.push({ id, fields: diff });
    else matched++;
  }

  const extraInTenant: string[] = [];
  for (const id of tenantById.keys()) {
    if (!sharedById.has(id)) extraInTenant.push(id);
  }

  return {
    match:
      missingInTenant.length === 0 &&
      extraInTenant.length === 0 &&
      fieldMismatches.length === 0,
    total: sharedById.size,
    matched,
    missingInTenant,
    extraInTenant,
    fieldMismatches,
  };
}
