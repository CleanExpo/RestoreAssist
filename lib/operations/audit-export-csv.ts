/**
 * W6-1 — org-scoped audit trail CSV (inspection-linked AuditLog rows).
 */

export type AuditExportRow = {
  timestamp: string;
  inspectionId: string;
  inspectionNumber: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string;
  device: string | null;
};

function cell(value: string | null | undefined): string {
  const raw = value ?? "";
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function renderAuditExportCsv(rows: readonly AuditExportRow[]): string {
  const header = [
    "timestamp",
    "inspection_id",
    "inspection_number",
    "action",
    "entity_type",
    "entity_id",
    "user_id",
    "device",
  ].join(",");
  const body = rows.map((r) =>
    [
      cell(r.timestamp),
      cell(r.inspectionId),
      cell(r.inspectionNumber),
      cell(r.action),
      cell(r.entityType),
      cell(r.entityId),
      cell(r.userId),
      cell(r.device),
    ].join(","),
  );
  return [header, ...body].join("\n");
}