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
    wHSIncident: {
      create: vi.fn(),
    },
    inspection: {
      // RA-6798: all handlers now use findFirst (ownership-scoped)
      findFirst: vi.fn(),
    },
  },
}));

// ─── Mock @/lib/cloudinary (durable photo hosting) ───────────────────────────

vi.mock("@/lib/cloudinary", () => ({
  uploadImage: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/cloudinary";
import { takeReading } from "../take-reading";
import { capturePhoto } from "../capture-photo";
import { startLidarScan } from "../start-lidar-scan";
import { fillScopeItem } from "../fill-scope-item";
import { flagWhsHazard } from "../flag-whs-hazard";
import { checkReportGaps } from "../check-report-gaps";
import { TOOL_HANDLERS } from "../index";

const mockPrisma = prisma as {
  moistureReading: { create: ReturnType<typeof vi.fn> };
  inspectionPhoto: { create: ReturnType<typeof vi.fn> };
  scopeItem: { create: ReturnType<typeof vi.fn> };
  wHSIncident: { create: ReturnType<typeof vi.fn> };
  inspection: { findFirst: ReturnType<typeof vi.fn> };
};
const mockUploadImage = vi.mocked(uploadImage);

// Default: owned inspection — overridden per-test for IDOR rejection cases.
const OWNED_INSPECTION = { id: "insp-1" };
const CTX_OWNER = { userId: "user-owner-1" };
const CTX_OTHER = { userId: "user-other-9" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default to the happy path; individual tests override for rejection.
  mockPrisma.inspection.findFirst.mockResolvedValue(OWNED_INSPECTION);
});

// ─── 1. takeReading ───────────────────────────────────────────────────────────

describe("takeReading", () => {
  it("creates a MoistureReading row and returns summary", async () => {
    mockPrisma.moistureReading.create.mockResolvedValue({
      id: "mr-1",
      location: "Kitchen",
      moistureLevel: 42.5,
    });

    const result = await takeReading(
      {
        inspectionId: "insp-1",
        location: "Kitchen",
        surfaceType: "drywall",
        moistureLevel: 42.5,
        unit: "PERCENT_MC",
        depth: "surface",
        source: "manual",
      },
      CTX_OWNER,
    );

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

  // RA-6798: ownership check
  it("throws Forbidden when the inspection does not belong to the caller", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    await expect(
      takeReading(
        {
          inspectionId: "insp-other",
          location: "Kitchen",
          surfaceType: "drywall",
          moistureLevel: 42.5,
          unit: "PERCENT_MC",
        },
        CTX_OTHER,
      ),
    ).rejects.toThrow(/Forbidden/);

    expect(mockPrisma.moistureReading.create).not.toHaveBeenCalled();
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

    const result = await capturePhoto(
      {
        inspectionId: "insp-1",
        caption: "wet wall near vanity",
        location: "Bathroom",
        contextTag: "damage",
        sourceUri: "blob://temp/photo.jpg",
      },
      CTX_OWNER,
    );

    expect(mockPrisma.inspectionPhoto.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("ph-1");
    expect(result.url).toBe("blob://temp/photo.jpg");
    // A non-hostable blob: handle is stored as-is, never uploaded.
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("routes a hostable https sourceUri through Cloudinary and stores the secure url", async () => {
    mockUploadImage.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/x/inspection-photos/ph-2.jpg",
    });
    mockPrisma.inspectionPhoto.create.mockResolvedValue({
      id: "ph-2",
      url: "https://res.cloudinary.com/x/inspection-photos/ph-2.jpg",
      location: null,
      description: "ceiling stain",
    });

    const result = await capturePhoto(
      {
        inspectionId: "insp-1",
        caption: "ceiling stain",
        sourceUri: "https://uploads.example.com/raw/ph-2.jpg",
      },
      CTX_OWNER,
    );

    expect(mockUploadImage).toHaveBeenCalledWith(
      "https://uploads.example.com/raw/ph-2.jpg",
      "inspection-photos",
    );
    // The persisted url is the durable Cloudinary url, not the raw source.
    expect(mockPrisma.inspectionPhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://res.cloudinary.com/x/inspection-photos/ph-2.jpg",
        }),
      }),
    );
    expect(result.url).toBe(
      "https://res.cloudinary.com/x/inspection-photos/ph-2.jpg",
    );
  });

  // RA-6798
  it("throws Forbidden when the inspection does not belong to the caller", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    await expect(
      capturePhoto(
        { inspectionId: "insp-other", caption: "photo", sourceUri: "blob://x" },
        CTX_OTHER,
      ),
    ).rejects.toThrow(/Forbidden/);

    expect(mockPrisma.inspectionPhoto.create).not.toHaveBeenCalled();
  });
});

// ─── 3. startLidarScan ───────────────────────────────────────────────────────

describe("startLidarScan", () => {
  it("returns graceful not_implemented status without throwing", async () => {
    const result = await startLidarScan(
      { inspectionId: "insp-1", roomName: "Living Room" },
      CTX_OWNER,
    );

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
      clauseRef: "S500:2025 §7.1",
    });

    const result = await fillScopeItem(
      {
        inspectionId: "insp-1",
        itemType: "remove_carpet",
        description: "Remove and dispose of water-damaged carpet",
        quantity: 25,
        unit: "sqm",
        clauseRef: "S500:2025 §7.1",
      },
      CTX_OWNER,
    );

    expect(mockPrisma.scopeItem.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("si-1");
    expect(result.clauseRef).toBe("S500:2025 §7.1");
  });

  // RA-6798
  it("throws Forbidden when the inspection does not belong to the caller", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    await expect(
      fillScopeItem(
        { inspectionId: "insp-other", itemType: "remove_carpet", description: "x" },
        CTX_OTHER,
      ),
    ).rejects.toThrow(/Forbidden/);

    expect(mockPrisma.scopeItem.create).not.toHaveBeenCalled();
  });
});

// ─── 5. flagWhsHazard ────────────────────────────────────────────────────────

describe("flagWhsHazard", () => {
  it("persists a WHSIncident and returns the created incident summary", async () => {
    const createdAt = new Date("2026-04-18T00:00:00Z");
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-1",
      incidentType: "asbestos",
      severity: "CRITICAL",
      createdAt,
    });

    const result = await flagWhsHazard(
      {
        inspectionId: "insp-1",
        hazardType: "asbestos",
        severity: "CRITICAL",
        controls: ["stop-work", "notify-regulator", "barrier-tape"],
        source: "teacher_proactive",
      },
      CTX_OWNER,
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("whs-1");
    expect(result.incidentType).toBe("asbestos");
    expect(result.severity).toBe("CRITICAL");
    expect(result.createdAt).toEqual(createdAt);
  });

  it("dual-writes free-text incidentType + incidentTypeEnum when caller passes the enum (P1 #20 step 1 of 2)", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-2",
      incidentType: "biohazard",
      severity: "HIGH",
      createdAt: new Date(),
    });

    await flagWhsHazard(
      {
        inspectionId: "insp-1",
        hazardType: "biohazard",
        severity: "HIGH",
        incidentTypeEnum: "BIOHAZARD",
      },
      CTX_OWNER,
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incidentType: "biohazard",
          incidentTypeEnum: "BIOHAZARD",
        }),
      }),
    );
  });

  it("writes incidentTypeEnum=null when caller omits the enum (legacy callers unchanged)", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-3",
      incidentType: "electrical",
      severity: "MEDIUM",
      createdAt: new Date(),
    });

    await flagWhsHazard(
      { inspectionId: "insp-1", hazardType: "electrical", severity: "MEDIUM" },
      CTX_OWNER,
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incidentType: "electrical",
          incidentTypeEnum: null,
        }),
      }),
    );
  });


  it("attributes the incident to the authenticated userId (RA-6798)", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-4",
      incidentType: "asbestos",
      severity: "HIGH",
      createdAt: new Date(),
    });

    await flagWhsHazard(
      { inspectionId: "insp-1", hazardType: "asbestos", severity: "HIGH" },
      { userId: "user-real-123" },
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-real-123" }),
      }),
    );
  });

  // RA-6798
  it("throws Forbidden when the inspection does not belong to the caller", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    await expect(
      flagWhsHazard(
        { inspectionId: "insp-other", hazardType: "asbestos", severity: "HIGH" },
        CTX_OTHER,
      ),
    ).rejects.toThrow(/Forbidden/);

    expect(mockPrisma.wHSIncident.create).not.toHaveBeenCalled();
  });


  it("rejects an invalid incidentTypeEnum value via zod", async () => {
    await expect(
      flagWhsHazard(
        {
          inspectionId: "insp-1",
          hazardType: "biohazard",
          severity: "HIGH",
          // @ts-expect-error — invalid enum on purpose to verify zod rejection
          incidentTypeEnum: "NOT_A_REAL_ENUM",
        },
        CTX_OWNER,
      ),
    ).rejects.toThrow();
  });
});

// ─── 6. checkReportGaps ──────────────────────────────────────────────────────

describe("checkReportGaps", () => {
  it("returns gaps array identifying missing readings, photos, classification and incomplete make-safe", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue({
      id: "insp-1",
      moistureReadings: [],
      photos: [],
      scopeItems: [],
      classifications: [],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
      ],
    });

    const result = await checkReportGaps({ inspectionId: "insp-1" }, CTX_OWNER);

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
    mockPrisma.inspection.findFirst.mockResolvedValue({
      id: "insp-2",
      moistureReadings: [{ id: "mr-1" }],
      photos: [{ id: "ph-1" }],
      scopeItems: [{ id: "si-1" }],
      classifications: [{ id: "cl-1" }],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: true },
      ],
    });

    const result = await checkReportGaps({ inspectionId: "insp-2" }, CTX_OWNER);
    expect(result.gaps).toHaveLength(0);
  });

  // RA-6798: non-owned inspection returns "not found" gap — no cross-tenant read
  it("returns a block gap (not found) when the inspection does not belong to the caller", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    const result = await checkReportGaps(
      { inspectionId: "insp-other" },
      CTX_OTHER,
    );

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].field).toBe("inspection");
    expect(result.gaps[0].severity).toBe("block");
  });
});

// ─── 7. TOOL_HANDLERS dispatcher — ownership threading ───────────────────────

describe("TOOL_HANDLERS dispatcher", () => {
  it("threads the owning userId through to flag_whs_hazard", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-d1",
      incidentType: "biohazard",
      severity: "HIGH",
      createdAt: new Date(),
    });

    await TOOL_HANDLERS.flag_whs_hazard(
      { inspectionId: "insp-1", hazardType: "biohazard", severity: "HIGH" },
      { userId: "user-dispatch-9" },
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-dispatch-9" }),
      }),
    );
  });

  it("threads userId to fill_scope_item and enforces ownership", async () => {
    mockPrisma.scopeItem.create.mockResolvedValue({
      id: "si-d1",
      itemType: "remove_carpet",
      description: "Remove carpet",
      quantity: 10,
      unit: "sqm",
      clauseRef: "S500:2025 §7.1",
    });

    const result = (await TOOL_HANDLERS.fill_scope_item(
      {
        inspectionId: "insp-1",
        itemType: "remove_carpet",
        description: "Remove carpet",
        quantity: 10,
        unit: "sqm",
        clauseRef: "S500:2025 §7.1",
      },
      { userId: "user-dispatch-9" },
    )) as { id: string };

    expect(mockPrisma.scopeItem.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("si-d1");
  });

  // RA-6798: ensure TOOL_HANDLERS propagates ownership so dispatch can't bypass
  it("rejects take_reading when inspection is not owned by the dispatched userId", async () => {
    mockPrisma.inspection.findFirst.mockResolvedValue(null);

    await expect(
      TOOL_HANDLERS.take_reading(
        {
          inspectionId: "insp-other",
          location: "Roof",
          surfaceType: "tile",
          moistureLevel: 10,
          unit: "PERCENT_MC",
        },
        { userId: "user-attacker" },
      ),
    ).rejects.toThrow(/Forbidden/);

    expect(mockPrisma.moistureReading.create).not.toHaveBeenCalled();
  });
});

