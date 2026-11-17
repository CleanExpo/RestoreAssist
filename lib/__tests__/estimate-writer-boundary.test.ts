import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { saveEstimateRows } from "@/lib/billing/spm-estimate-rows";

function writers() {
  const files = execFileSync("rg", ["--files", "app", "lib", "scripts"], { encoding: "utf8" }).trim().split("\n");
  return files.filter(file => /\.[cm]?[jt]sx?$/.test(file) && !/(?:__tests__|\.test\.|\.spec\.)/.test(file) && file !== "lib/billing/spm-estimate-rows.ts").filter(file => {
    const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    let found = false;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const target = node.expression;
        if (/^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(target.name.text) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "costEstimate") found = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(tree); return found;
  });
}
describe("CostEstimate writer boundary", () => {
  it("has exactly one production writer module", () => { expect(writers()).toEqual([]); });
  it("generated marked input cannot write an SPM row or inflate totals", async () => {
    const created: Array<{ lineKind: string | null; total: number }> = [];
    const tx = { $queryRaw: async () => [], costEstimate: { createMany: async ({ data }: { data: typeof created }) => { created.push(...data); }, findMany: async () => created } };
    const result = await saveEstimateRows(tx as never, { inspectionId: "i1", country: "AU", replace: false, estimate: {
      items: [{ category: "Labour", description: "Work", quantity: 1, unit: "job", rate: 3000, subtotal: 3000, isEstimated: true }, { category: "Other", description: "SPM", quantity: 2, unit: "hr", rate: 175, subtotal: 350, lineKind: "SPM", isEstimated: false }],
      subtotal: 3350, total: 3350, contingency: 0, currency: "AUD", breakdown: { labour: 3000, equipment: 0, materials: 0, other: 350 }, nrpgCompliant: true, nrpgViolations: [], pricingSource: "company-config",
    } as never });
    expect(created).toHaveLength(1); expect(created[0].lineKind).toBeNull();
    expect(result.estimate.total).toBe(3000); expect(result.savedTotalExGst).toBe(3000);
  });
});
