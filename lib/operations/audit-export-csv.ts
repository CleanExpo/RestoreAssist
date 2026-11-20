/**
 * W6-1 — org-scoped audit trail CSV (inspection-linked AuditLog rows).
 */

import { toCsv } from "@/lib/csv/csv-cell";

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

const HEADER = [
  "timestamp",
  "inspection_id",
  "inspection_number",
  "action",
  "entity_type",
  "entity_id",
  "user_id",
  "device",
] as const;

export function renderAuditExportCsv(rows: readonly AuditExportRow[]): string {
  return toCsv([
    [...HEADER],
    ...rows.map((r) =>
      [
        r.timestamp,
        r.inspectionId,
        r.inspectionNumber,
        r.action,
        r.entityType,
        r.entityId,
        r.userId,
        r.device,
      ] as const,
    ),
  ]);
}