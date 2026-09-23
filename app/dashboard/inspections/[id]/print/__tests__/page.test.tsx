// @vitest-environment jsdom
/**
 * RA-7725: the insurer-facing print page labelled Σtotal − Σsubtotal as GST.
 * Since RA-7708 that difference is the contingency row, not tax. The totals
 * must show the contingency as its own line and compute GST from
 * lib/gst-rules.ts on (priced lines + contingency), the same base the
 * invoice generator uses.
 */
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import InspectionPrintPage from "../page";

// NIR-2026-09-F1C142 shape: five priced lines (2259.00) + one contingency row.
const PRICED = [325, 175, 225, 484, 1050];
const costEstimates = [
  ...PRICED.map((amount, i) => ({
    id: `ce-${i}`,
    category: "Labour",
    description: `Priced line ${i + 1}`,
    quantity: 1,
    unit: "job",
    rate: amount,
    subtotal: amount,
    contingency: 0,
    total: amount,
  })),
  {
    id: "ce-contingency",
    category: "Other",
    description: "Contingency (12%)",
    quantity: 1,
    unit: "job",
    rate: 271.08,
    subtotal: 0,
    contingency: 271.08,
    total: 271.08,
  },
];

const inspection = {
  id: "insp-1",
  inspectionNumber: "NIR-2026-09-F1C142",
  propertyAddress: "1 Test St",
  propertyPostcode: "2000",
  technicianName: null,
  status: "SUBMITTED",
  claimType: "WATER",
  createdAt: "2026-09-22T00:00:00.000Z",
  submittedAt: null,
  environmentalData: null,
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  classifications: [],
  costEstimates,
};

function mockFetch(country: "AU" | "NZ") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/inspections/insp-1") {
        return { ok: true, status: 200, json: async () => ({ inspection }) };
      }
      if (url === "/api/gst-treatment") {
        return { ok: true, status: 200, json: async () => ({ data: { country } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

/** Label → amount text for each row of the estimate totals footer. */
function footerRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const tr of Array.from(document.querySelectorAll("tfoot tr"))) {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent ?? "").trim(),
    );
    rows.set(cells[0], cells[cells.length - 1]);
  }
  return rows;
}

function gstRow(rows: Map<string, string>): [string, string] | undefined {
  return Array.from(rows.entries()).find(([label]) => /^GST\b/.test(label));
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPage() {
  // Same pattern as ../../invoice/__tests__/page.test.tsx: `use(params)`
  // resolves inside an async act().
  await act(async () => {
    render(<InspectionPrintPage params={Promise.resolve({ id: "insp-1" })} />);
  });
  await waitFor(() =>
    expect(screen.getAllByText("NIR-2026-09-F1C142", { exact: false }).length).toBeGreaterThan(0),
  );
  // Let the GST treatment fetch settle before reading the totals.
  await waitFor(() => expect(document.querySelector("tfoot")).not.toBeNull());
}

describe("inspection print page totals (RA-7725)", () => {
  it.each([
    ["AU" as const, "253.01", "2,783.09"],
    ["NZ" as const, "379.51", "2,909.59"],
  ])(
    "%s: contingency is its own line and GST is computed on priced lines + contingency",
    async (country, gst, grand) => {
      mockFetch(country);
      await renderPage();

      await waitFor(() => {
        const rows = footerRows();
        expect(gstRow(rows)?.[1]).toBe(`$${gst}`);
        expect(rows.get("Contingency")).toBe("$271.08");
      });

      const rows = footerRows();
      // No amount labelled GST may equal the contingency.
      for (const [label, amount] of rows) {
        if (/GST/.test(label) && !/ex\.|inc\./.test(label)) {
          expect(amount).not.toBe("$271.08");
        }
      }
      expect(rows.get("Subtotal (ex. GST)")).toBe("$2,530.08");
      expect(rows.get("Grand Total (inc. GST)")).toBe(`$${grand}`);
    },
  );
});
