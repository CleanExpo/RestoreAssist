import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { hvacDomain } from "../domains/hvac";

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
};

describe("hvacDomain — happy paths per condition", () => {
  it("CLEAN ducted residential: routine maintenance, no duct line, no fog", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "ducted_residential", condition: "CLEAN" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const descriptions = r.data.scope.items.map((i) => i.description);
    expect(descriptions.some((d) => d.includes("coil clean"))).toBe(true);
    expect(descriptions.some((d) => d.toLowerCase().includes("duct"))).toBe(
      false,
    );
    expect(descriptions.some((d) => d.toLowerCase().includes("fog"))).toBe(
      false,
    );
  });

  it("DUST_ACCUMULATION ducted: includes ductwork clean line", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: {
        systemType: "ducted_residential",
        condition: "DUST_ACCUMULATION",
        ductLinearMetres: 35,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const duct = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("ductwork"),
    );
    expect(duct).toBeDefined();
    expect(duct?.quantity).toBe(35);
    expect(duct?.unit).toBe("lin·m");
  });

  it("MICROBIAL_GROWTH adds sanitiser fog + cross-references S520:2024 §6", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: {
        systemType: "commercial_cav",
        condition: "MICROBIAL_GROWTH",
        areaServedM2: 200,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const fog = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("fog"),
    );
    expect(fog).toBeDefined();
    // Findings section cross-refs S520:2024 §6
    const findings = r.data.report.sections.find(
      (s) => s.heading === "Inspection findings",
    );
    expect(findings?.body.toLowerCase()).toContain("s520:2024");
  });

  it("FIRE_SMOKE_RESIDUE cross-references S700:2025 §6.3", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: {
        systemType: "ducted_residential",
        condition: "FIRE_SMOKE_RESIDUE",
        areaServedM2: 120,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const findings = r.data.report.sections.find(
      (s) => s.heading === "Inspection findings",
    );
    expect(findings?.body.toLowerCase()).toContain("s700:2025");
  });
});

describe("hvacDomain — system-type specifics", () => {
  it("evaporative system omits condensate-pan + ductwork lines", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "evaporative", condition: "DUST_ACCUMULATION" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const descriptions = r.data.scope.items.map((i) => i.description);
    expect(
      descriptions.some((d) => d.toLowerCase().includes("condensate")),
    ).toBe(false);
    expect(descriptions.some((d) => d.toLowerCase().includes("ductwork"))).toBe(
      false,
    );
    // Cleaning protocol body still surfaces evaporative-specific guidance
    const cleaning = r.data.report.sections.find(
      (s) => s.heading === "Cleaning protocol",
    );
    expect(cleaning?.body.toLowerCase()).toContain("evaporative");
  });

  it("split-system omits ductwork even with non-CLEAN condition", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "split", condition: "DUST_ACCUMULATION" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.scope.items.some((i) =>
        i.description.toLowerCase().includes("ductwork"),
      ),
    ).toBe(false);
  });
});

describe("hvacDomain — citations + ATP", () => {
  it("aggregates NADCA + AS/NZS 3666 citations, includes ATP testing", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: {
        systemType: "ducted_residential",
        condition: "DUST_ACCUMULATION",
        ductLinearMetres: 25,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.citations.some((c) => c.standard === "NADCA ACR 2021")).toBe(
      true,
    );
    expect(
      r.data.citations.some((c) => c.standard.startsWith("AS/NZS 3666")),
    ).toBe(true);
    const atp = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("atp"),
    );
    expect(atp).toBeDefined();
    expect(atp?.category).toBe("TESTING");
    expect(atp?.quantity).toBe(3);
  });
});

describe("hvacDomain — error paths", () => {
  it("INSUFFICIENT_DATA when options missing", async () => {
    const r = await hvacDomain.generate({ ...baseInput, options: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when systemType invalid", async () => {
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "swamp_cooler", condition: "CLEAN" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when condition invalid", async () => {
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "split", condition: "FILTHY" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("NOT_FOUND when inspection missing", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "split", condition: "CLEAN" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INTERNAL on DB throw", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await hvacDomain.generate({
      ...baseInput,
      options: { systemType: "split", condition: "CLEAN" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("hvacDomain — estimate self-consistency", () => {
  it("subtotal=sum(lines), total=sub+GST, GST=10%, AUD", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await hvacDomain.generate({
      ...baseInput,
      options: {
        systemType: "ducted_residential",
        condition: "MICROBIAL_GROWTH",
        ductLinearMetres: 30,
        areaServedM2: 150,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const subtotal = r.data.estimate.lines.reduce(
      (s, l) => s + l.lineTotalExGst,
      0,
    );
    expect(
      Math.abs(subtotal - r.data.estimate.totals.subtotalExGst),
    ).toBeLessThan(0.05);
    expect(
      Math.abs(
        r.data.estimate.totals.totalIncGst -
          (r.data.estimate.totals.subtotalExGst +
            r.data.estimate.totals.gstTotal),
      ),
    ).toBeLessThan(0.05);
    expect(r.data.estimate.totals.gstRate).toBe(0.1);
    expect(r.data.estimate.totals.currency).toBe("AUD");
  });
});

describe("hvacDomain — registry contract", () => {
  it("registers under HVAC with NADCA + AS/NZS 3666 label", () => {
    expect(hvacDomain.domain).toBe("HVAC");
    expect(hvacDomain.label).toMatch(/NADCA|3666/);
  });
});
