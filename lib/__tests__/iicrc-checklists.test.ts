import { describe, it, expect } from "vitest";
import { IICRC_CHECKLISTS } from "../iicrc-checklists";

/**
 * RA-877 — Verify NADCA ACR 2021, Safe Work Australia, and expanded
 * IICRC S700/S520/S760 checklists are present, findable by ID, and
 * each carries at least 6 items with section references.
 */
describe("RA-877 — expanded IICRC / NADCA / SWA checklist templates", () => {
  const requiredIds = [
    "nadca-hvac-2021",
    "safe-work-biohazard",
    "iicrc-s700-fire-smoke-expanded",
    "iicrc-s520-mould-expanded",
    "iicrc-s760-environmental",
  ] as const;

  it.each(requiredIds)("includes a checklist with id %s", (id) => {
    const t = IICRC_CHECKLISTS.find((c) => c.id === id);
    expect(t, `checklist ${id} not found`).toBeDefined();
  });

  it.each(requiredIds)("checklist %s has at least 6 items", (id) => {
    const t = IICRC_CHECKLISTS.find((c) => c.id === id)!;
    expect(t.items.length).toBeGreaterThanOrEqual(6);
  });

  it.each(requiredIds)(
    "checklist %s items all carry a clause/section justification",
    (id) => {
      const t = IICRC_CHECKLISTS.find((c) => c.id === id)!;
      for (const item of t.items) {
        expect(item.justification).toBeTruthy();
        // Every item must reference a standard + section marker (§ or edition year)
        expect(item.justification).toMatch(
          /§|20\d{2}|ACR|CoP|AS\/NZS|Reg|Guidance|Safe Work/,
        );
      }
    },
  );

  it("exposes new categories 'hvac' and 'environmental'", () => {
    const hvac = IICRC_CHECKLISTS.find((c) => c.category === "hvac");
    const env = IICRC_CHECKLISTS.find((c) => c.category === "environmental");
    expect(hvac).toBeDefined();
    expect(env).toBeDefined();
  });

  it("NADCA template references ACR 2021", () => {
    const t = IICRC_CHECKLISTS.find((c) => c.id === "nadca-hvac-2021")!;
    expect(
      t.items.some((i) => i.justification.includes("NADCA ACR 2021")),
    ).toBe(true);
  });

  it("Safe Work Australia template references Model WHS or AS/NZS", () => {
    const t = IICRC_CHECKLISTS.find((c) => c.id === "safe-work-biohazard")!;
    const combined = t.items.map((i) => i.justification).join(" ");
    expect(combined).toMatch(/WHS|AS\/NZS|Safe Work Australia/);
  });
});
