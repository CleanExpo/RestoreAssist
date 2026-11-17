import { describe, expect, it, vi } from "vitest";
import type { CostEstimateResult } from "@/lib/nir-cost-estimation";
import { SPM_LINE_DESCRIPTION } from "@/lib/billing/spm-line";
import { saveEstimateRows } from "@/lib/billing/spm-estimate-rows";

function estimateTotalling(total: number): CostEstimateResult {
  return {
    items: [
      {
        category: "Labour",
        description: "Water extraction",
        quantity: 1,
        unit: "job",
        rate: total,
        subtotal: total,
        nrpgField: null,
        nrpgCompliant: true,
        rateSource: "company-config",
        isEstimated: true,
      },
    ],
    subtotal: total,
    contingency: 0,
    contingencyPercentage: 0,
    total,
    currency: "AUD",
    breakdown: { equipment: 0, labour: total, materials: 0, other: 0 },
    nrpgCompliant: true,
    nrpgViolations: [],
    pricingSource: "company-config",
  };
}

/** Unit oracles for lock order, NULL-safe replacement and choice preservation. */
function fakeTx(saved: Array<{ id: string; total: number; lineKind: string | null }> = []) {
  const calls: string[] = [];
  const createMany = vi.fn(async (_arg: { data: Array<{ lineKind: string | null; total: number }> }) => { calls.push("write"); });
  const deleteMany = vi.fn(async (_arg: unknown) => { calls.push("delete"); });
  const tx = {
    $queryRaw: vi.fn(async (_arg: { sql: string }) => { calls.push("lock"); return []; }),
    costEstimate: { createMany, deleteMany, findMany: vi.fn(async () => { calls.push("read"); return saved; }) },
  };
  return { tx, calls, createMany, deleteMany };
}
const savedSpm = { id: "spm", total: 350, lineKind: "SPM" };
describe("saveEstimateRows saves generated work only", () => {
  it.each([true, false])("locks first and never inserts a fee: replace=%s", async replace => {
    const f = fakeTx([{ id: "work", total: 3000, lineKind: null }]);
    const result = await saveEstimateRows(f.tx as never, { inspectionId: "i1", estimate: estimateTotalling(3000), country: "AU", replace });
    expect(f.calls).toEqual(replace ? ["lock", "delete", "write", "read"] : ["lock", "write", "read"]);
    expect(f.tx.$queryRaw.mock.calls[0][0].sql).toMatch(/FROM "Inspection".*FOR UPDATE/);
    expect(f.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ inspectionId: "i1", total: 3000, lineKind: null })]);
    expect(result.estimate.total).toBe(3000); expect(result.savedTotalExGst).toBe(3000); expect(result.spmRowKept).toBe(false);
  });
  it("replace uses the exact NULL-safe work filter, preserving the added row", async () => {
    const f = fakeTx([{ id: "work", total: 4000, lineKind: null }, savedSpm]);
    const result = await saveEstimateRows(f.tx as never, { inspectionId: "i1", estimate: estimateTotalling(4000), country: "AU", replace: true });
    expect(f.deleteMany).toHaveBeenCalledWith({ where: { inspectionId: "i1", OR: [{ lineKind: null }, { lineKind: { not: "SPM" } }] } });
    expect(result.savedTotalExGst).toBe(4350); expect(result.spmRowKept).toBe(true);
    expect(f.createMany.mock.calls[0][0].data.map((row: { lineKind: string | null }) => row.lineKind)).toEqual([null]);
  });
  it("append never deletes or re-adds a saved SPM row", async () => {
    const f = fakeTx([savedSpm]);
    await saveEstimateRows(f.tx as never, { inspectionId: "i1", estimate: estimateTotalling(4000), country: "AU", replace: false });
    expect(f.deleteMany).not.toHaveBeenCalled(); expect(f.createMany.mock.calls[0][0].data).toHaveLength(1);
  });
  it("a work row with SPM wording remains work", async () => {
    const f = fakeTx(); const estimate = estimateTotalling(3000); estimate.items[0].description = SPM_LINE_DESCRIPTION;
    await saveEstimateRows(f.tx as never, { inspectionId: "i1", estimate, country: "AU", replace: true });
    expect(f.createMany.mock.calls[0][0].data[0]).toMatchObject({ description: SPM_LINE_DESCRIPTION, total: 3000, lineKind: null });
  });
});
