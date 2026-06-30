import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { fireSmokeDomain } from "../domains/fire-smoke";

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
  affectedAreas: [{ affectedSquareFootage: 50 }],
};

describe("fireSmokeDomain — happy paths per smoke type", () => {
  it("wet smoke uses S700 §6.4 + §7.1 pathway", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const headings = r.data.report.sections.map((s) => s.heading);
    expect(headings).toEqual([
      "Situation",
      "Structural assessment",
      "Cleaning + decontamination protocol",
      "Odour control",
      "Clearance criteria",
    ]);
    const cleaning = r.data.report.sections.find(
      (s) => s.heading === "Cleaning + decontamination protocol",
    );
    expect(cleaning?.body.toLowerCase()).toContain("degreaser");
    expect(cleaning?.body).toContain("ozone");
  });

  it("dry smoke uses S700 §6.2 protocol (mechanical-first)", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "dry", charLevel: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const cleaning = r.data.report.sections.find(
      (s) => s.heading === "Cleaning + decontamination protocol",
    );
    expect(cleaning?.body.toLowerCase()).toContain("dry chemical sponge");
    expect(cleaning?.body.toLowerCase()).toContain("hydroxyl");
  });

  it("protein smoke uses S700 §6.5 (enzymatic + thermal fog)", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const cleaning = r.data.report.sections.find(
      (s) => s.heading === "Cleaning + decontamination protocol",
    );
    expect(cleaning?.body.toLowerCase()).toContain("enzymatic");
    expect(cleaning?.body.toLowerCase()).toContain("thermal fog");
  });

  it("fuel_oil uses S700 §6.6 (petroleum solvent)", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "fuel_oil", charLevel: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const cleaning = r.data.report.sections.find(
      (s) => s.heading === "Cleaning + decontamination protocol",
    );
    expect(cleaning?.body.toLowerCase()).toContain("petroleum");
  });
});

describe("fireSmokeDomain — char level surfaces in report", () => {
  it("Char 4 triggers demolition-pathway language", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 4 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const structural = r.data.report.sections.find(
      (s) => s.heading === "Structural assessment",
    );
    expect(structural?.body.toLowerCase()).toContain("demolition");
  });

  it("Char 1 stays restorable", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "dry", charLevel: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const structural = r.data.report.sections.find(
      (s) => s.heading === "Structural assessment",
    );
    expect(structural?.body.toLowerCase()).toContain("restorable");
  });
});

describe("fireSmokeDomain — citations + scope", () => {
  it("aggregates only IICRC S700:2025 citations", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.citations.every((c) => c.standard === "IICRC S700:2025"),
    ).toBe(true);
    expect(r.data.citations.length).toBeGreaterThan(2);
  });

  it("every scope item carries an IICRC ref + positive quantity", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.scope.items.length).toBeGreaterThan(0);
    for (const item of r.data.scope.items) {
      expect(item.iicrcRef.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });
});

describe("fireSmokeDomain — error paths", () => {
  it("INSUFFICIENT_DATA when options missing", async () => {
    const r = await fireSmokeDomain.generate({ ...baseInput, options: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when smokeType invalid", async () => {
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "haze", charLevel: 2 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when charLevel out of range", async () => {
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 5 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("NOT_FOUND when inspection missing", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INSUFFICIENT_DATA when no affected-area data", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      affectedAreas: [],
    });
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INTERNAL on DB throw", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("fireSmokeDomain — estimate self-consistency", () => {
  it("subtotal=sum(lines), total=sub+GST, GST=10%, AUD", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2 },
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

describe("fireSmokeDomain — registry", () => {
  it("registers under FIRE_SMOKE with S700 label", () => {
    expect(fireSmokeDomain.domain).toBe("FIRE_SMOKE");
    expect(fireSmokeDomain.label).toMatch(/S700/);
  });
});
