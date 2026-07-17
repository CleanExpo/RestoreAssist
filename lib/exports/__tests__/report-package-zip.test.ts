import { describe, expect, it } from "vitest";
import { buildReportPackageZip } from "@/lib/exports/report-package-zip";

describe("buildReportPackageZip", () => {
  it("returns a ZIP buffer containing the listed entries", async () => {
    const zip = await buildReportPackageZip([
      { name: "report.pdf", buffer: Buffer.from("%PDF-1.4 mock") },
      { name: "export.json", buffer: Buffer.from('{"ok":true}') },
    ]);

    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(40);
    // ZIP local file header magic
    expect(zip.subarray(0, 2).toString("binary")).toBe("PK");
  });
});
