/**
 * RA-8327 — one owner for the asbestos presumption year.
 *
 * The fire job's hazmat step and the fire voice walkthrough must take the
 * year from lib/compliance/asbestos-era.ts (which reads the regulatory
 * registry), never carry their own copy. The year is swapped here for one no
 * real rule uses, so a hard-coded copy anywhere in those texts cannot pass.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/compliance/asbestos-era", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/compliance/asbestos-era")>();
  return { ...real, ASBESTOS_PRESUMPTION_YEAR: { AU: 2091, NZ: 2087 } };
});

import { getWorkflowTemplate } from "@/lib/evidence/workflow-definitions";
import { FIRE_CHECKLIST } from "@/lib/voice/fire-smoke/checklist";

describe("asbestos year comes from asbestos-era.ts", () => {
  it("the fire job's hazmat step states the registry years for AU and NZ", () => {
    const fire = getWorkflowTemplate("FIRE_SMOKE");
    const hazmat = fire.steps.find((s) => s.stepKey === "hazmat_assessment");
    expect(hazmat).toBeDefined();
    expect(hazmat!.stepDescription).toContain("2091");
    expect(hazmat!.stepDescription).toContain("2087");
    expect(hazmat!.stepDescription).not.toMatch(/\b2004\b/);
  });

  it("the water job's asbestos escalation trigger states the registry years", () => {
    const triggers = getWorkflowTemplate("WATER_DAMAGE").riskEscalationTriggers ?? [];
    const asbestos = triggers.find((t) => /asbestos/i.test(t));
    expect(asbestos).toBeDefined();
    expect(asbestos).toContain("2091");
    expect(asbestos).toContain("2087");
  });

  it("the fire walkthrough's building-age question states the registry year", () => {
    const section = FIRE_CHECKLIST.find((s) => s.id === "asbestos_hazmat");
    const item = section?.items.find((i) => i.id === "building_age");
    expect(item?.prompt).toContain("2091");
    expect(item?.prompt).not.toMatch(/\b2004\b/);
  });
});
