import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @/lib/prisma ────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      create: vi.fn(),
    },
    inspectionPhoto: {
      create: vi.fn(),
    },
    scopeItem: {
      create: vi.fn(),
    },
    inspection: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { takeReading } from "../take-reading";
import { capturePhoto } from "../capture-photo";
import { startLidarScan } from "../start-lidar-scan";
import { fillScopeItem } from "../fill-scope-item";
import { flagWhsHazard } from "../flag-whs-hazard";
import { checkReportGaps } from "../check-report-gaps";

const mockPrisma = prisma as {
  moistureReading: { create: ReturnType<typeof vi.fn> };
  inspectionPhoto: { create: ReturnType<typeof vi.fn> };
  scopeItem: { create: ReturnType<typeof vi.fn> };
  inspection: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. takeReading ───────────────────────────────────────────────────────────

describe("takeReading", () => {
  it("creates a MoistureReading row and returns summary", async () => {
    mockPrisma.moistureReading.create.mockResolvedValue({
      id: "mr-1",
      location: "Kitchen",
      moistureLevel: 42.5,
    });

    const result = await takeReading({
      inspectionId: "insp-1",
      location: "Kitchen",
      surfaceType: "drywall",
      moistureLevel: 42.5,
      unit: "PERCENT_MC",
      depth: "surface",
      source: "manual",
    });

    expect(mockPrisma.moistureReading.create).toHaveBeenCalledOnce();
    expect(mockPrisma.moistureReading.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "insp-1",
          location: "Kitchen",
          surfaceType: "drywall",
          moistureLevel: 42.5,
        }),
      }),
    );
    expect(result).toEqual({
      id: "mr-1",
      location: "Kitchen",
      value: 42.5,
      unit: "PERCENT_MC",
    });
  });
});

// ─── 2. capturePhoto ──────────────────────────────────────────────────────────

describe("capturePhoto", () => {
  it("creates an InspectionPhoto row and returns the stored record", async () => {
    mockPrisma.inspectionPhoto.create.mockResolvedValue({
      id: "ph-1",
      url: "blob://temp/photo.jpg",
      location: "Bathroom",
      description: "[damage] wet wall near vanity",
    });

    const result = await capturePhoto({
      inspectionId: "insp-1",
      caption: "wet wall near vanity",
      location: "Bathroom",
      contextTag: "damage",
      sourceUri: "blob://temp/photo.jpg",
    });

    expect(mockPrisma.inspectionPhoto.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("ph-1");
    expect(result.url).toBe("blob://temp/photo.jpg");
  });
});

// ─── 3. startLidarScan ───────────────────────────────────────────────────────

describe("startLidarScan", () => {
  it("returns graceful not_implemented status without throwing", async () => {
    const result = await startLidarScan({
      inspectionId: "insp-1",
      roomName: "Living Room",
    });

    expect(result.status).toBe("not_implemented");
    expect(result.hint).toMatch(/RA-1133/);
  });
});

// ─── 4. fillScopeItem ────────────────────────────────────────────────────────

describe("fillScopeItem", () => {
  it("creates a ScopeItem row and returns the item", async () => {
    mockPrisma.scopeItem.create.mockResolvedValue({
      id: "si-1",
      itemType: "remove_carpet",
      description: "Remove and dispose of water-damaged carpet",
      quantity: 25,
      unit: "sqm",
      justification: "S500:2025 §7.1",
    });

    const result = await fillScopeItem({
      inspectionId: "insp-1",
      itemType: "remove_carpet",
      description: "Remove and dispose of water-damaged carpet",
      quantity: 25,
      unit: "sqm",
      clauseRef: "S500:2025 §7.1",
    });

    expect(mockPrisma.scopeItem.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("si-1");
    expect(result.clauseRef).toBe("S500:2025 §7.1");
  });
});

// ─── 5. flagWhsHazard ────────────────────────────────────────────────────────

describe("flagWhsHazard", () => {
  it("returns queued status with validated hazard payload (WHSIncident model pending migration)", async () => {
    const result = await flagWhsHazard({
      inspectionId: "insp-1",
      hazardType: "asbestos",
      severity: "critical",
      controls: ["stop-work", "notify-regulator", "barrier-tape"],
      source: "teacher_proactive",
    });

    expect(result.status).toBe("queued");
    expect(result.hazard.hazardType).toBe("asbestos");
    expect(result.hazard.severity).toBe("critical");
    expect(result.hazard.controls).toContain("stop-work");
  });
});

// ─── 6. checkReportGaps ──────────────────────────────────────────────────────

describe("checkReportGaps", () => {
  it("returns gaps array identifying missing readings, photos, classification and incomplete make-safe", async () => {
    mockPrisma.inspection.findUnique.mockResolvedValue({
      id: "insp-1",
      moistureReadings: [],
      photos: [],
      scopeItems: [],
      classifications: [],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
      ],
    });

    const result = await checkReportGaps({ inspectionId: "insp-1" });

    expect(Array.isArray(result.gaps)).toBe(true);

    const fields = result.gaps.map((g) => g.field);
    expect(fields).toContain("moistureReadings");
    expect(fields).toContain("photos");
    expect(fields).toContain("iicrcClassification");
    expect(fields).toContain("makeSafe.water_stopped");

    const blockGaps = result.gaps.filter((g) => g.severity === "block");
    expect(blockGaps.length).toBeGreaterThan(0);
  });

  it("returns empty gaps when inspection is complete", async () => {
    mockPrisma.inspection.findUnique.mockResolvedValue({
      id: "insp-2",
      moistureReadings: [{ id: "mr-1" }],
      photos: [{ id: "ph-1" }],
      scopeItems: [{ id: "si-1" }],
      classifications: [{ id: "cl-1" }],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: true },
      ],
    });

    const result = await checkReportGaps({ inspectionId: "insp-2" });
    expect(result.gaps).toHaveLength(0);
  });
});
