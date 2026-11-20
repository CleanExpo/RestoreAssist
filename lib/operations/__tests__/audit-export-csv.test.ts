import { describe, expect, it } from "vitest";
import { renderAuditExportCsv } from "../audit-export-csv";

describe("audit-export-csv", () => {
  it("renders header and escapes commas", () => {
    const csv = renderAuditExportCsv([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        inspectionId: "insp_1",
        inspectionNumber: "NIR-2026-01-0001",
        action: 'note, with "quote"',
        entityType: null,
        entityId: null,
        userId: "u1",
        device: "Web",
      },
    ]);
    expect(csv.split("\n")[0]).toContain("timestamp");
    expect(csv).toContain('"note, with ""quote"""');
  });
});