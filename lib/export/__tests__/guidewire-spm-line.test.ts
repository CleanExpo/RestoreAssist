import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { buildNirReportOutput } from "../guidewire-report-output";
import { SPM_LINE_DESCRIPTION } from "@/lib/billing/spm-line";
function output(costEstimates: Array<{ description: string; rate: number; lineKind: string | null }>) {
  return buildNirReportOutput({
    id: "i1", propertyAddress: "Test", propertyPostcode: "", classifications: [], photos: [],
    inspectionDate: new Date("2026-11-18"), status: "ESTIMATED",
    scopeItems: [{ id: "scope", itemType: "labour", description: SPM_LINE_DESCRIPTION, quantity: 1, unit: "job", isRequired: true }],
    costEstimates,
  } as never, "Technician", "u1");
}
describe("Guidewire SPM exclusion (L2)", () => {
  it("SPM wording can never price a scope item from the added SPM row", () => {
    const p = output([{ description: SPM_LINE_DESCRIPTION, rate: 175, lineKind: "SPM" }]);
    expect(p.scopeLineItems[0].unitRate).toBeUndefined();
    expect(p.scopeLineItems).toHaveLength(1);
  });
  it("still joins the real work row with identical wording", () => {
    const p = output([{ description: SPM_LINE_DESCRIPTION, rate: 175, lineKind: "SPM" }, { description: SPM_LINE_DESCRIPTION, rate: 3000, lineKind: null }]);
    expect(p.scopeLineItems[0].unitRate).toBe(3000);
  });
});
