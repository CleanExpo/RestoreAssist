import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvidenceClass } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    evidenceItem: { findMany: vi.fn() },
    moistureReading: { findMany: vi.fn() },
    psychrometricReading: { findMany: vi.fn() },
    affectedArea: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildFieldEvidenceChecklist,
  auditInspectionById,
  type EvidenceItemForAudit,
  type MoistureReadingForAudit,
  type PsychrometricReadingForAudit,
  type AffectedAreaForAudit,
} from "../field-evidence-audit";

const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  evidenceItem: { findMany: ReturnType<typeof vi.fn> };
  moistureReading: { findMany: ReturnType<typeof vi.fn> };
  psychrometricReading: { findMany: ReturnType<typeof vi.fn> };
  affectedArea: { findMany: ReturnType<typeof vi.fn> };
};

// ============================================
// FIXTURE FACTORIES
// ============================================

/** A well-formed evidence item that scores >=85 under every qa-scorer
 * branch (photo / moisture reading / technician note / generic). */
function makeGoodItem(
  evidenceClass: EvidenceClass,
  idx: number,
  overrides: Partial<EvidenceItemForAudit> = {},
): EvidenceItemForAudit {
  return {
    id: `${evidenceClass}-${idx}`,
    evidenceClass,
    status: "ACTIVE",
    fileUrl: "https://storage.example.com/evidence.jpg",
    fileSizeBytes: 250_000,
    description:
      "Detailed field observation noting moisture, damage, and drying equipment status.",
    capturedLat: -27.47,
    capturedLng: 153.02,
    capturedAt: new Date("2026-07-01T09:00:00Z"),
    structuredData: JSON.stringify({
      numericValue: 22,
      materialType: "drywall",
      roomLocation: "Kitchen",
      gpsAccuracy: 5,
    }),
    roomName: "Kitchen",
    ...overrides,
  } as EvidenceItemForAudit;
}

function items(
  evidenceClass: EvidenceClass,
  count: number,
  overrides: Partial<EvidenceItemForAudit> = {},
): EvidenceItemForAudit[] {
  return Array.from({ length: count }, (_, i) =>
    makeGoodItem(evidenceClass, i, overrides),
  );
}

function readings(count: number, affectedArea: string): MoistureReadingForAudit[] {
  return Array.from({ length: count }, () => ({ affectedArea }));
}

function psy(count: number): PsychrometricReadingForAudit[] {
  return Array.from({ length: count }, (_, i) => ({ id: `psy-${i}` }));
}

function findRequired(
  result: ReturnType<typeof buildFieldEvidenceChecklist>,
  evidenceClass: EvidenceClass,
) {
  const item = result.categories.required.find(
    (i) => i.evidenceClass === evidenceClass,
  );
  if (!item) throw new Error(`Expected required item for ${evidenceClass}`);
  return item;
}

// ============================================
// WATER_DAMAGE
// ============================================

describe("buildFieldEvidenceChecklist — water damage", () => {
  it("complete: every required evidence class present and scoring well", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("TECHNICIAN_NOTE", 2),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("SCOPE_DOCUMENT", 1),
      ...items("PHOTO_COMPLETION", 3),
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-water-complete", claimType: "WATER" },
      evidenceItems,
      readings(5, "Kitchen"),
      psy(2),
      [{ roomZoneId: "Kitchen" }],
    );

    expect(result.claimType).toBe("WATER_DAMAGE");
    expect(result.categories.required).toHaveLength(10);
    expect(
      result.categories.required.every((i) => i.status === "present"),
    ).toBe(true);
    expect(result.gapsByAffectedArea).toEqual([]);
    expect(result.unlinkedEvidence).toEqual([]);
  });

  it("partial: below-minimum count is weak, absent class is missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("TECHNICIAN_NOTE", 2),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 1), // below the workflow minimum of 2
      ...items("SCOPE_DOCUMENT", 1),
      // PHOTO_COMPLETION never captured
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-water-partial", claimType: "WATER" },
      evidenceItems,
      readings(5, "Kitchen"),
      psy(2),
      [{ roomZoneId: "Kitchen" }],
    );

    expect(findRequired(result, "EQUIPMENT_LOG").status).toBe("weak");
    expect(findRequired(result, "PHOTO_COMPLETION").status).toBe("missing");
    expect(result.gapsByEvidenceClass.EQUIPMENT_LOG).toBeDefined();
    expect(result.gapsByEvidenceClass.PHOTO_COMPLETION).toBeDefined();
    expect(result.gapsByEvidenceClass.PHOTO_DAMAGE).toBeUndefined();
  });

  it("high-risk: the tier-3 contamination evidence class (TECHNICIAN_NOTE) is entirely missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("SCOPE_DOCUMENT", 1),
      ...items("PHOTO_COMPLETION", 3),
      // TECHNICIAN_NOTE never captured — the contamination-assessment step
      // is riskTier 3 (misclassification is a health/liability risk).
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-water-high-risk", claimType: "water" },
      evidenceItems,
      readings(5, "Kitchen"),
      psy(2),
      [{ roomZoneId: "Kitchen" }],
    );

    const note = findRequired(result, "TECHNICIAN_NOTE");
    expect(note.status).toBe("missing");
    expect(note.riskTier).toBe(3);
    expect(result.gapsByEvidenceClass.TECHNICIAN_NOTE?.riskTier).toBe(3);
  });
});

// ============================================
// FIRE_SMOKE
// ============================================

describe("buildFieldEvidenceChecklist — fire & smoke", () => {
  it("complete: every required evidence class present and scoring well", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("TECHNICIAN_NOTE", 4),
      ...items("SCOPE_DOCUMENT", 3),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("PHOTO_COMPLETION", 3),
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-fire-complete", claimType: "FIRE" },
      evidenceItems,
      readings(3, "Lounge"),
      psy(2),
      [{ roomZoneId: "Lounge" }],
    );

    expect(result.claimType).toBe("FIRE_SMOKE");
    expect(
      result.categories.required.every((i) => i.status === "present"),
    ).toBe(true);
  });

  it("partial: below-minimum note count is weak, completion photos missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("TECHNICIAN_NOTE", 2), // below the workflow minimum of 4
      ...items("SCOPE_DOCUMENT", 3),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      // PHOTO_COMPLETION never captured
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-fire-partial", claimType: "FIRE" },
      evidenceItems,
      readings(3, "Lounge"),
      psy(2),
      [{ roomZoneId: "Lounge" }],
    );

    expect(findRequired(result, "TECHNICIAN_NOTE").status).toBe("weak");
    expect(findRequired(result, "PHOTO_COMPLETION").status).toBe("missing");
  });

  it("high-risk: fire-smoke-assessment technician notes (riskTier 2, the highest uniquely-claimed tier for this template) are missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("SCOPE_DOCUMENT", 3),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("PHOTO_COMPLETION", 3),
      // TECHNICIAN_NOTE never captured
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-fire-high-risk", claimType: "FIRE" },
      evidenceItems,
      readings(3, "Lounge"),
      psy(2),
      [{ roomZoneId: "Lounge" }],
    );

    const note = findRequired(result, "TECHNICIAN_NOTE");
    expect(note.status).toBe("missing");
    expect(note.riskTier).toBe(2);
  });
});

// ============================================
// MOULD
// ============================================

describe("buildFieldEvidenceChecklist — mould", () => {
  it("complete: every required evidence class present and scoring well", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("LAB_RESULT", 3),
      ...items("TECHNICIAN_NOTE", 2),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("SCOPE_DOCUMENT", 1),
      ...items("PHOTO_COMPLETION", 3),
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-mould-complete", claimType: "MOULD" },
      evidenceItems,
      readings(5, "Bathroom"),
      psy(2),
      [{ roomZoneId: "Bathroom" }],
    );

    expect(result.claimType).toBe("MOULD");
    expect(
      result.categories.required.every((i) => i.status === "present"),
    ).toBe(true);
  });

  it("partial: below-minimum lab samples is weak, completion photos missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("LAB_RESULT", 1), // below the workflow minimum of 3
      ...items("TECHNICIAN_NOTE", 2),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("SCOPE_DOCUMENT", 1),
      // PHOTO_COMPLETION never captured
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-mould-partial", claimType: "MOULD" },
      evidenceItems,
      readings(5, "Bathroom"),
      psy(2),
      [{ roomZoneId: "Bathroom" }],
    );

    expect(findRequired(result, "LAB_RESULT").status).toBe("weak");
    expect(findRequired(result, "PHOTO_COMPLETION").status).toBe("missing");
  });

  it("high-risk: both tier-3 classes (mould sampling LAB_RESULT + hazmat TECHNICIAN_NOTE) are missing", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      ...items("PHOTO_DAMAGE", 1),
      ...items("AUTHORITY_FORM", 1),
      ...items("FLOOR_PLAN", 1),
      ...items("PHOTO_EQUIPMENT", 2),
      ...items("EQUIPMENT_LOG", 2),
      ...items("SCOPE_DOCUMENT", 1),
      ...items("PHOTO_COMPLETION", 3),
      // LAB_RESULT and TECHNICIAN_NOTE never captured
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-mould-high-risk", claimType: "MOULD" },
      evidenceItems,
      readings(5, "Bathroom"),
      psy(2),
      [{ roomZoneId: "Bathroom" }],
    );

    const labResult = findRequired(result, "LAB_RESULT");
    const techNote = findRequired(result, "TECHNICIAN_NOTE");
    expect(labResult.status).toBe("missing");
    expect(labResult.riskTier).toBe(3);
    expect(techNote.status).toBe("missing");
    expect(techNote.riskTier).toBe(3);
  });
});

// ============================================
// AFFECTED-AREA LINKAGE (RA-1196)
// ============================================

describe("buildFieldEvidenceChecklist — affected-area linkage", () => {
  it("flags unmatched room-tag strings as unlinked evidence without dropping them, and flags zero-evidence declared areas as gaps", () => {
    const evidenceItems: EvidenceItemForAudit[] = [
      makeGoodItem("PHOTO_DAMAGE", 0, { roomName: "Kitchen" }),
      makeGoodItem("PHOTO_DAMAGE", 1, { roomName: "Garage" }), // not a declared AffectedArea
    ];
    const moistureReadings: MoistureReadingForAudit[] = [
      { affectedArea: "Shed" }, // also not declared
    ];
    const affectedAreas: AffectedAreaForAudit[] = [
      { roomZoneId: "Kitchen" },
      { roomZoneId: "Lounge" }, // declared but zero evidence tagged to it
    ];

    const result = buildFieldEvidenceChecklist(
      { id: "insp-linkage", claimType: "WATER" },
      evidenceItems,
      moistureReadings,
      [],
      affectedAreas,
    );

    expect(result.unlinkedEvidence).toEqual(["Garage", "Shed"]);
    expect(result.gapsByAffectedArea).toEqual([
      { roomZoneId: "Lounge", evidenceCount: 0 },
    ]);
  });

  it("throws for a claimType that doesn't map to a known workflow job type", () => {
    expect(() =>
      buildFieldEvidenceChecklist(
        { id: "insp-unmapped", claimType: "ASBESTOS" },
        [],
        [],
        [],
        [],
      ),
    ).toThrow(/does not map to a known workflow job type/);
  });
});

// ============================================
// I/O WRAPPER
// ============================================

describe("auditInspectionById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.inspection.findUnique.mockResolvedValue({
      id: "insp-1",
      claimType: "WATER",
    });
    p.evidenceItem.findMany.mockResolvedValue([]);
    p.moistureReading.findMany.mockResolvedValue([]);
    p.psychrometricReading.findMany.mockResolvedValue([]);
    p.affectedArea.findMany.mockResolvedValue([]);
  });

  it("queries all three measurement stores plus affected areas and builds the checklist", async () => {
    const result = await auditInspectionById("insp-1");

    expect(p.evidenceItem.findMany).toHaveBeenCalledTimes(1);
    expect(p.moistureReading.findMany).toHaveBeenCalledTimes(1);
    expect(p.psychrometricReading.findMany).toHaveBeenCalledTimes(1);
    expect(p.affectedArea.findMany).toHaveBeenCalledTimes(1);
    expect(result.inspectionId).toBe("insp-1");
    expect(result.claimType).toBe("WATER_DAMAGE");
  });

  it("throws when the inspection does not exist", async () => {
    p.inspection.findUnique.mockResolvedValue(null);
    await expect(auditInspectionById("missing")).rejects.toThrow(
      /not found/,
    );
  });
});
