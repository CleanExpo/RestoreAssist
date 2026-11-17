/**
 * RA-8419 review round 1 (Codex P1): two concurrent estimate writes for one
 * job could each see no saved SPM row and each add one, charging $700.
 *
 * Fix: saveEstimateRows() is the one writer of CostEstimate rows. Inside the
 * caller's transaction it locks the inspection row FIRST, so concurrent
 * writers queue, and only then reads the saved rows and applies the SPM rule.
 * These tests pin the order (lock before any read or delete) and the
 * counting; a real-database concurrency check is not possible in unit tests.
 */
import { describe, expect, it } from "vitest";
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

/** A fake transaction client that records every call in order. */
function fakeTx(saved: { description: string; total: number }[] = []) {
  const calls: string[] = [];
  const created: { description: string; total: number; inspectionId: string }[] = [];
  let lockSql = "";
  const tx = {
    $queryRaw: async (q: { sql?: string; strings?: string[] }) => {
      lockSql = q.sql ?? (q.strings ?? []).join("?");
      calls.push("lock");
      return [{ id: "i1" }];
    },
    costEstimate: {
      deleteMany: async () => {
        calls.push("deleteMany");
        return { count: saved.length };
      },
      findMany: async () => {
        calls.push("findMany");
        return saved;
      },
      createMany: async ({ data }: { data: typeof created }) => {
        calls.push("createMany");
        created.push(...data);
        return { count: data.length };
      },
    },
  };
  return { tx, calls, created, lockSql: () => lockSql };
}

const spmRows = (rows: { description: string }[]) =>
  rows.filter((r) => r.description === SPM_LINE_DESCRIPTION);

describe("RA-8419 saveEstimateRows: one locked writer", () => {
  it("locks the inspection row before reading saved rows (append)", async () => {
    const f = fakeTx();
    await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(3000),
      country: "AU",
      replace: false,
    });
    expect(f.calls).toEqual(["lock", "findMany", "createMany"]);
    expect(f.lockSql()).toMatch(/FROM "Inspection"/);
    expect(f.lockSql()).toMatch(/FOR UPDATE/);
  });

  it("locks the inspection row before deleting saved rows (replace)", async () => {
    const f = fakeTx();
    await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(3000),
      country: "AU",
      replace: true,
    });
    expect(f.calls).toEqual(["lock", "deleteMany", "createMany"]);
  });

  it("append: saved work counts towards the threshold", async () => {
    const f = fakeTx([{ description: "Earlier work", total: 1500 }]);
    const priced = await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(1200),
      country: "AU",
      replace: false,
    });
    expect(spmRows(f.created)).toHaveLength(1);
    expect(priced.total).toBe(1550);
    expect(f.created.every((r) => r.inspectionId === "i1")).toBe(true);
  });

  it("append: a saved SPM row is never charged again", async () => {
    const f = fakeTx([
      { description: "Earlier work", total: 3000 },
      { description: SPM_LINE_DESCRIPTION, total: 350 },
    ]);
    await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(4000),
      country: "AU",
      replace: false,
    });
    expect(spmRows(f.created)).toHaveLength(0);
  });

  it("replace: saved rows are ignored (they are deleted first)", async () => {
    const f = fakeTx([{ description: SPM_LINE_DESCRIPTION, total: 350 }]);
    await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(4000),
      country: "AU",
      replace: true,
    });
    expect(spmRows(f.created)).toHaveLength(1);
  });

  it("NZ: no SPM row", async () => {
    const f = fakeTx();
    await saveEstimateRows(f.tx as never, {
      inspectionId: "i1",
      estimate: estimateTotalling(9000),
      country: "NZ",
      replace: true,
    });
    expect(spmRows(f.created)).toHaveLength(0);
  });
});
