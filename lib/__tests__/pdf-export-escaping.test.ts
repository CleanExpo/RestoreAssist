/**
 * RA-8515 — office intake stores the address as typed, so the HTML the PDF
 * export draws must escape it.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("jspdf", () => ({ default: class {} }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));

import { buildReportHtml } from "@/lib/pdf-export";

describe("buildReportHtml escapes stored text (RA-8515)", () => {
  it("escapes the address and notes", () => {
    const html = buildReportHtml({
      inspection: {
        inspectionNumber: "NIR-2026-11-ABC123",
        status: "DRAFT",
        propertyAddress: `1 O'Brien St <img src=x onerror=alert(1)> & Co`,
        createdAt: "2026-11-21T00:00:00.000Z",
        notes: "RH < 40%",
      },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("1 O&#039;Brien St &lt;img src=x onerror=alert(1)&gt; &amp; Co");
    expect(html).toContain("RH &lt; 40%");
  });
});
