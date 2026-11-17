/** Real Postgres oracles. Run via test:db; ordinary no-DB unit runs are gated. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addSpmRow, removeSpmRow, saveEstimateRows } from "@/lib/billing/spm-estimate-rows";
import type { CostEstimateResult } from "@/lib/nir-cost-estimation";
const tag = `spm-${Date.now()}`;
let userId = "";
const ids: string[] = [];
const estimate = (total: number): CostEstimateResult => ({
  items: [{ category: "Labour", description: `Work ${total}`, quantity: 1, unit: "job", rate: total, subtotal: total, nrpgField: null, nrpgCompliant: true, rateSource: "company-config", isEstimated: true }],
  subtotal: total, contingency: 0, total, currency: "AUD", breakdown: { labour: total, equipment: 0, materials: 0, other: 0 }, nrpgCompliant: true, nrpgViolations: [], pricingSource: "company-config",
});
async function job() {
  const row = await prisma.inspection.create({ data: { userId, inspectionNumber: `${tag}-${ids.length}`, propertyAddress: "Local test", propertyPostcode: "4000", propertyCountry: "AU" }, select: { id: true } });
  ids.push(row.id); return row.id;
}
const rows = (inspectionId: string) => prisma.costEstimate.findMany({ where: { inspectionId }, select: { id: true, total: true, lineKind: true, description: true }, take: 100 });
const save = (inspectionId: string, total: number, replace: boolean) => prisma.$transaction(tx => saveEstimateRows(tx, { inspectionId, estimate: estimate(total), country: "AU", replace }));

describe.skipIf(!process.env.DATABASE_URL)("SPM real-Postgres invariants", () => {
  beforeAll(async () => { userId = (await prisma.user.create({ data: { email: `${tag}@test.local` }, select: { id: true } })).id; });
  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { id: { in: ids } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });
  it("regenerate preserves the added row id and replaces NULL and non-SPM work exactly", async () => {
    const id = await job(); await save(id, 3000, true);
    // Seed a future non-SPM database marker; generated engine items only allow SPM.
    await prisma.costEstimate.create({ data: { inspectionId: id, category: "Labour", description: "Other work", quantity: 1, unit: "job", rate: 1000, subtotal: 1000, contingency: 0, total: 1000, lineKind: "OTHER" }, select: { id: true } });
    const added = await prisma.$transaction(tx => addSpmRow(tx, id, userId));
    const spm = added.costEstimates.find(row => row.lineKind === "SPM")!;
    for (let i = 0; i < 2; i++) {
      const result = await save(id, 4000, true); const saved = await rows(id);
      expect(saved).toHaveLength(2); expect(saved.find(row => row.lineKind === "SPM")?.id).toBe(spm.id);
      expect(saved.filter(row => row.lineKind !== "SPM").map(row => row.total)).toEqual([4000]);
      expect(result.savedTotalExGst).toBe(4350); expect(result.spmRowKept).toBe(true);
    }
  });
  it("remove deletes only SPM and no-op removal is audited separately", async () => {
    const id = await job(); await save(id, 3000, true); await prisma.$transaction(tx => addSpmRow(tx, id, userId));
    const work = (await rows(id)).find(row => row.lineKind === null)!;
    await prisma.$transaction(tx => removeSpmRow(tx, id, userId));
    expect(await rows(id)).toEqual([work]);
    await prisma.$transaction(tx => removeSpmRow(tx, id, userId));
    const audit = await prisma.auditLog.findMany({ where: { inspectionId: id }, select: { action: true }, take: 100 });
    expect(audit.map(a => a.action)).toEqual(expect.arrayContaining(["SPM line removed", "SPM line remove (absent)"]));
  });
  it("two concurrent adds queue behind a held lock and leave exactly one charged row", async () => {
    const id = await job(); await save(id, 3000, true);
    let release!: () => void; let locked!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const first = prisma.$transaction(async tx => { const result = await addSpmRow(tx, id, userId); locked(); await held; return result; });
    await acquired;
    let secondFinished = false;
    const second = prisma.$transaction(tx => addSpmRow(tx, id, userId)).then(result => { secondFinished = true; return result; });
    try { await new Promise(resolve => setTimeout(resolve, 150)); expect(secondFinished).toBe(false); }
    finally { release(); }
    const results = await Promise.all([first, second]);
    expect(results.map(r => r.outcome).sort()).toEqual(["added", "already_present"]);
    expect((await rows(id)).filter(row => row.lineKind === "SPM")).toHaveLength(1);
    const audit = await prisma.auditLog.findMany({ where: { inspectionId: id, action: "SPM line added" }, select: { id: true }, take: 100 });
    expect(audit).toHaveLength(1);
  });
  it("an audit failure rolls the row creation back", async () => {
    const id = await job(); await save(id, 3000, true);
    await expect(prisma.$transaction(tx => addSpmRow(new Proxy(tx, {
      get(target, key) { if (key === "auditLog") return { create: async () => { throw new Error("Audit unavailable"); } }; return Reflect.get(target, key); },
    }), id, userId))).rejects.toThrow("Audit unavailable");
    expect((await rows(id)).filter(row => row.lineKind === "SPM")).toHaveLength(0);
  });
});
