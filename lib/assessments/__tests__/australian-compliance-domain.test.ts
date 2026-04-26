import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { australianComplianceDomain } from "../domains/australian-compliance";

const inspectionFindUnique = (
  prisma as unknown as {
    inspection: { findUnique: ReturnType<typeof vi.fn> };
  }
).inspection.findUnique;

beforeEach(() => {
  inspectionFindUnique.mockReset();
});

const baseInput = {
  inspectionId: "i_1",
  workspaceId: "ws_1",
  userId: "u_1",
};

const baseInspection = {
  id: "i_1",
  propertyAddress: "12 Smith St, Brisbane",
  propertyPostcode: "4000", // QLD
};

describe("australianComplianceDomain — base scope (no flags)", () => {
  it("emits the 5 always-on documentation items", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const descriptions = r.data.scope.items.map((i) => i.description);
    expect(
      descriptions.some((d) => d.toLowerCase().includes("whs site safety")),
    ).toBe(true);
    expect(descriptions.some((d) => d.includes("GICOP"))).toBe(true);
    expect(descriptions.some((d) => d.toLowerCase().includes("privacy act"))).toBe(true);
    expect(descriptions.some((d) => d.toLowerCase().includes("iicrc"))).toBe(true);
    expect(descriptions.some((d) => d.toLowerCase().includes("consumer law"))).toBe(true);
    // No conditional items.
    expect(descriptions.some((d) => d.toLowerCase().includes("labour-hire"))).toBe(false);
    expect(descriptions.some((d) => d.toLowerCase().includes("epa"))).toBe(false);
  });

  it("citations always include WHS / GICOP / Privacy / Consumer Law", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const standards = r.data.citations.map((c) => c.standard);
    expect(standards).toContain("Work Health and Safety Act 2011 (Cth)");
    expect(standards).toContain("General Insurance Code of Practice 2020");
    expect(standards).toContain("Privacy Act 1988 (Cth)");
    expect(standards).toContain("Competition and Consumer Act 2010 (Cth)");
  });
});

describe("australianComplianceDomain — conditional sections", () => {
  it("hasLabourHire=true adds Fair Work + SG section + scope line", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { hasLabourHire: true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const lh = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("labour-hire"),
    );
    expect(lh).toBeDefined();
    const fwSection = r.data.report.sections.find((s) =>
      s.heading.toLowerCase().includes("fair work"),
    );
    expect(fwSection).toBeDefined();
    expect(r.data.citations.some((c) => c.standard === "Fair Work Act 2009 (Cth)")).toBe(
      true,
    );
  });

  it("hasBiohazard=true adds state-specific EPA manifest line + section", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { hasBiohazard: true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    // Postcode 4000 → QLD.
    const epa = r.data.scope.items.find((i) =>
      i.description.includes("QLD EPA"),
    );
    expect(epa).toBeDefined();
    const epaSection = r.data.report.sections.find((s) =>
      s.heading.toLowerCase().includes("epa"),
    );
    expect(epaSection).toBeDefined();
  });

  it("explicit state override beats postcode-derived state", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      propertyPostcode: "4000", // QLD
    });
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { hasBiohazard: true, state: "NSW" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.scope.items.some((i) => i.description.includes("NSW EPA")),
    ).toBe(true);
    expect(
      r.data.scope.items.some((i) => i.description.includes("QLD EPA")),
    ).toBe(false);
  });

  it("falls back to NSW when no state override + no postcode", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      propertyPostcode: null,
    });
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { hasBiohazard: true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.scope.items.some((i) => i.description.includes("NSW EPA")),
    ).toBe(true);
  });
});

describe("australianComplianceDomain — IICRC certifications", () => {
  it("filters out invalid cert codes + uppercases input", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { iicrcCertifications: ["wrt", "amrt", "MADE_UP", "S520"] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const certSection = r.data.report.sections.find((s) =>
      s.heading.toLowerCase().includes("iicrc certification"),
    );
    expect(certSection).toBeDefined();
    expect(certSection?.body).toContain("WRT");
    expect(certSection?.body).toContain("AMRT");
    expect(certSection?.body).toContain("S520");
    expect(certSection?.body).not.toContain("MADE_UP");
  });

  it("surfaces 'no certifications recorded' when list is empty", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const certSection = r.data.report.sections.find((s) =>
      s.heading.toLowerCase().includes("iicrc certification"),
    );
    expect(certSection?.body.toLowerCase()).toContain(
      "no iicrc certifications recorded",
    );
  });
});

describe("australianComplianceDomain — error paths", () => {
  it("NOT_FOUND when inspection missing", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INTERNAL on DB throw", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("australianComplianceDomain — estimate self-consistency", () => {
  it("subtotal=sum(lines), total=sub+GST, GST=10%, AUD", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await australianComplianceDomain.generate({
      ...baseInput,
      options: { hasLabourHire: true, hasBiohazard: true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const subtotal = r.data.estimate.lines.reduce(
      (s, l) => s + l.lineTotalExGst,
      0,
    );
    expect(Math.abs(subtotal - r.data.estimate.totals.subtotalExGst)).toBeLessThan(0.05);
    expect(
      Math.abs(
        r.data.estimate.totals.totalIncGst -
          (r.data.estimate.totals.subtotalExGst + r.data.estimate.totals.gstTotal),
      ),
    ).toBeLessThan(0.05);
    expect(r.data.estimate.totals.gstRate).toBe(0.1);
    expect(r.data.estimate.totals.currency).toBe("AUD");
  });
});

describe("australianComplianceDomain — registry contract", () => {
  it("registers under AUSTRALIAN_COMPLIANCE with WHS/GICOP/Privacy label", () => {
    expect(australianComplianceDomain.domain).toBe("AUSTRALIAN_COMPLIANCE");
    expect(australianComplianceDomain.label).toMatch(/WHS|GICOP|Privacy/);
  });
});
