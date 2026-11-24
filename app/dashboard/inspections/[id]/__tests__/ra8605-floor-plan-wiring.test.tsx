import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// RA-8605: the job page and the NIR form are too large to render here. The
// wrapper's behaviour (draws the saved picture, saves uploads) is tested in
// components/inspection/__tests__/FloorPlanMoistureMap.ra8605.test.tsx; these
// guard that every editable moisture map goes through it.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("RA-8605 moisture maps use the shared floor plan wrapper", () => {
  it("job page mounts FloorPlanMoistureMap with the inspection's saved floor plan", () => {
    const page = read("app/dashboard/inspections/[id]/page.tsx");
    expect(page).toMatch(
      /<FloorPlanMoistureMap[\s\S]*?floorPlanImageUrl=\{inspection\.floorPlanImageUrl \?\? null\}[\s\S]*?\/>/,
    );
    expect(page).not.toMatch(/<MoistureMappingCanvas\b/);
  });

  it("NIR form's editable map uses the wrapper and no longer posts the file itself", () => {
    const form = read("components/NIRTechnicianInputForm.tsx");
    expect(form).toMatch(
      /<FloorPlanMoistureMap[\s\S]*?floorPlanImageUrl=\{floorPlanImageUrl\}[\s\S]*?\/>/,
    );
    expect(form).not.toContain('formData.append("type", "floor-plan")');
    expect(form).not.toMatch(/onImageUpload=/);
  });
});
