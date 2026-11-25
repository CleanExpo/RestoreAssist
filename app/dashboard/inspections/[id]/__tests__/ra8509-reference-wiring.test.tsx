import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// RA-8509: the job page and the NIR form are too large to render here. These
// guard that both feed the moisture map the job's reference readings, and that
// the job API selects what pickReferenceReadings needs to skip an invalidated
// reference. The behaviour itself is tested on the map component.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("RA-8509 reference readings reach the moisture map", () => {
  it("job page computes references from its readings and passes them to the map", () => {
    const page = read("app/dashboard/inspections/[id]/page.tsx");
    expect(page).toMatch(/const moistureReferences = useMemo\(\s*\(\) =>\s*pickReferenceReadings\(/);
    expect(page).toMatch(/invalidatedAt: r\.invalidatedAt/);
    expect(page).toMatch(/<MoistureMappingCanvas[\s\S]*?references=\{moistureReferences\}[\s\S]*?\/>/);
  });

  it("NIR form passes references to both maps", () => {
    const form = read("components/NIRTechnicianInputForm.tsx");
    expect(form).toMatch(/const moistureReferences = useMemo\(/);
    expect(form.match(/references=\{moistureReferences\}/g)).toHaveLength(2);
  });

  it("job API selects isBaseline, unit and invalidatedAt on moisture readings", () => {
    const api = read("app/api/inspections/[id]/route.ts");
    const block = api.slice(api.indexOf("moistureReadings: {"), api.indexOf("affectedAreas: {"));
    for (const field of ["isBaseline: true", "unit: true", "invalidatedAt: true"]) {
      expect(block).toContain(field);
    }
  });
});
