import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    organizationPricingConfig: { findUnique: vi.fn() },
    companyPricingConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { fireSmokeDomain } from "../domains/fire-smoke";

const inspectionFindUnique = (
  prisma as unknown as {
    inspection: { findUnique: ReturnType<typeof vi.fn> };
  }
).inspection.findUnique;

const pricingMocks = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  organizationPricingConfig: { findUnique: ReturnType<typeof vi.fn> };
  companyPricingConfig: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  inspectionFindUnique.mockReset();
  // Default: the contractor has no price list configured.
  pricingMocks.user.findUnique.mockReset().mockResolvedValue(null);
  pricingMocks.organizationPricingConfig.findUnique
    .mockReset()
    .mockResolvedValue(null);
  pricingMocks.companyPricingConfig.findUnique
    .mockReset()
    .mockResolvedValue(null);
});

/** A contractor price list (test fixture values, each inside its NRPG range). */
const CONTRACTOR_CONFIG = {
  qualifiedTechnicianNormalHours: 91,
  masterQualifiedNormalHours: 121,
  afdUnitLargeDailyRate: 61,
  hepaVacuumDailyRate: 57,
  callOutFee: 151,
  administrationFee: 201,
  rateOzoneGenerator: 111,
  rateContentsClean: 53,
  mouldRemediationTreatmentRate: 66,
  antimicrobialTreatmentRate: 6,
};

const LABOUR_OPTIONS = {
  technicians: 2,
  supervisors: 1,
  buildingDays: 2,
  contentsDays: 1,
  airScrubbers: 2,
  hepaVacuumUnitDays: 2,
  ozoneUnitDays: 2,
};

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

  it("every scope item carries an IICRC ref + positive or 'needed' quantity", async () => {
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
      // RA-8275: null means "quantity needed"; never a guessed 1 or a 0.
      if (item.quantity !== null) expect(item.quantity).toBeGreaterThan(0);
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
    pricingMocks.companyPricingConfig.findUnique.mockResolvedValue(
      CONTRACTOR_CONFIG,
    );
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "wet", charLevel: 2, ...LABOUR_OPTIONS },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const { totals } = r.data.estimate;
    expect(totals.status).toBe("complete");
    const subtotal = r.data.estimate.lines.reduce(
      (s, l) => s + (l.lineTotalExGst ?? 0),
      0,
    );
    expect(Math.abs(subtotal - (totals.subtotalExGst as number))).toBeLessThan(
      0.05,
    );
    expect(
      Math.abs(
        (totals.totalIncGst as number) -
          ((totals.subtotalExGst as number) + (totals.gstTotal as number)),
      ),
    ).toBeLessThan(0.05);
    expect(r.data.estimate.totals.gstRate).toBe(0.1);
    expect(r.data.estimate.totals.currency).toBe("AUD");
  });
});

describe("RA-8275 — a missing rate blocks the estimate total", () => {
  it("protein smoke with no fire rates: total is blocked and no line is $0", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const { lines, totals } = r.data.estimate;
    for (const line of lines) {
      expect(line.rate).not.toBe(0);
      expect(line.lineTotalExGst).not.toBe(0);
    }
    expect(totals.status).toBe("blocked");
    expect(totals.subtotalExGst).toBeNull();
    expect(totals.totalIncGst).toBeNull();
    expect(totals.missing?.length).toBeGreaterThan(0);
  });
});

describe("RA-8275 — prices come from the contractor's own price list", () => {
  it("labour lines use the contractor's rates, not built-in defaults", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    pricingMocks.companyPricingConfig.findUnique.mockResolvedValue(
      CONTRACTOR_CONFIG,
    );
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1, ...LABOUR_OPTIONS },
    });
    if (!r.ok) throw new Error(r.message);
    const line = (d: string) =>
      r.data.estimate.lines.find((l) => l.description === d);
    expect(line("Technician Labour")?.rate).toBe(91);
    expect(line("Supervisor Labour")?.rate).toBe(121);
    expect(line("Call-out Fee")?.rate).toBe(151);
    expect(r.data.estimate.totals.basis).toBe(
      "Priced from your contractor's own rates, within the NRPG national average range.",
    );
    for (const l of r.data.estimate.lines) {
      expect([66, 6, 65, 4.5]).not.toContain(l.rate);
    }
  });

  it("with no price list, every line says why it is unpriced", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1 },
    });
    if (!r.ok) throw new Error(r.message);
    const fee = r.data.estimate.lines.find(
      (l) => l.description === "Call-out Fee",
    );
    expect(fee?.rate).toBeNull();
    expect(fee?.pricingStatus).toBe("rate_not_set");
    expect(fee?.pricingNote).toContain("national range $100-$350");
  });

  it("contents count comes from the inspection's pack-out register", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      _count: { contentsPackOutItems: 37 },
    });
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1 },
    });
    if (!r.ok) throw new Error(r.message);
    const contents = r.data.scope.items.find((i) =>
      i.description.startsWith("Contents"),
    );
    expect(contents?.quantity).toBe(37);
    expect(contents?.unit).toBe("item");
  });
});

describe("RA-8275 — affected area is m², converted from sq ft once", () => {
  async function enzymeQuantity(affectedAreas: unknown[]) {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      affectedAreas,
    });
    const r = await fireSmokeDomain.generate({
      ...baseInput,
      options: { smokeType: "protein", charLevel: 1 },
    });
    if (!r.ok) throw new Error(r.message);
    return r.data.scope.items.find((i) =>
      i.description.startsWith("Enzyme Treatment"),
    )?.quantity;
  }

  it("a legacy sq ft row of 1076.39 sq ft is 100 m², not 1076 m²", async () => {
    const q = await enzymeQuantity([
      { affectedSquareFootage: 1076.391041670972, affectedAreaSqm: null },
    ]);
    expect(q).toBeCloseTo(100, 2);
  });

  it("a row with the m² column set is not converted a second time", async () => {
    const q = await enzymeQuantity([
      { affectedSquareFootage: 1076.391041670972, affectedAreaSqm: 100 },
    ]);
    expect(q).toBeCloseTo(100, 2);
  });

  it("mixed rows sum in m²", async () => {
    const q = await enzymeQuantity([
      { affectedSquareFootage: 538.195520835486, affectedAreaSqm: null },
      { affectedSquareFootage: 0, affectedAreaSqm: 25 },
    ]);
    expect(q).toBeCloseTo(75, 2);
  });
});

describe("fireSmokeDomain — registry", () => {
  it("registers under FIRE_SMOKE with S700 label", () => {
    expect(fireSmokeDomain.domain).toBe("FIRE_SMOKE");
    expect(fireSmokeDomain.label).toMatch(/S700/);
  });
});
