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
      findUnique: vi.fn(),
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
  inspection: { findUnique: ReturnType<typeof vi.fn> };
};
const mockUploadImage = vi.mocked(uploadImage);

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

  it("persists unit / device / source to their real columns (not a notes blob)", async () => {
    mockPrisma.moistureReading.create.mockResolvedValue({
      id: "mr-2",
      location: "Bathroom",
      moistureLevel: 60,
    });

    await takeReading({
      inspectionId: "insp-1",
      location: "Bathroom",
      surfaceType: "drywall",
      moistureLevel: 60,
      unit: "RH",
      deviceVendor: "Tramex",
      deviceModel: "CME5",
      source: "ble",
    });

    expect(mockPrisma.moistureReading.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unit: "RH",
          deviceVendor: "Tramex",
          deviceModel: "CME5",
          source: "ble",
        }),
      }),
    );
    // Metadata must NOT be smuggled into a notes JSON blob.
    const passedData = mockPrisma.moistureReading.create.mock.calls[0][0].data;
    expect(passedData).not.toHaveProperty("notes");
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

    const result = await capturePhoto({
      inspectionId: "insp-1",
      caption: "ceiling stain",
      sourceUri: "https://uploads.example.com/raw/ph-2.jpg",
    });

    expect(mockUploadImage).toHaveBeenCalledWith(
      "https://uploads.example.com/raw/ph-2.jpg",
      "inspection-photos",
    );
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
      clauseRef: "S500:2021 §7.1",
    });

    const result = await fillScopeItem({
      inspectionId: "insp-1",
      itemType: "remove_carpet",
      description: "Remove and dispose of water-damaged carpet",
      quantity: 25,
      unit: "sqm",
      clauseRef: "S500:2021 §7.1",
    });

    expect(mockPrisma.scopeItem.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("si-1");
    expect(result.clauseRef).toBe("S500:2021 §7.1");
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

    const result = await flagWhsHazard({
      inspectionId: "insp-1",
      hazardType: "asbestos",
      severity: "CRITICAL",
      controls: ["stop-work", "notify-regulator", "barrier-tape"],
      source: "teacher_proactive",
    });

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

    await flagWhsHazard({
      inspectionId: "insp-1",
      hazardType: "biohazard",
      severity: "HIGH",
      incidentTypeEnum: "BIOHAZARD",
    });

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

    await flagWhsHazard({
      inspectionId: "insp-1",
      hazardType: "electrical",
      severity: "MEDIUM",
    });

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incidentType: "electrical",
          incidentTypeEnum: null,
        }),
      }),
    );
  });

  it("attributes the incident to the real owning user when context.userId is provided", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-4",
      incidentType: "asbestos",
      severity: "HIGH",
      createdAt: new Date(),
    });

    await flagWhsHazard(
      {
        inspectionId: "insp-1",
        hazardType: "asbestos",
        severity: "HIGH",
      },
      { userId: "user-real-123" },
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-real-123",
        }),
      }),
    );
  });

  it('falls back to "system" only when no owning user is provided', async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-5",
      incidentType: "electrical",
      severity: "LOW",
      createdAt: new Date(),
    });

    await flagWhsHazard({
      inspectionId: "insp-1",
      hazardType: "electrical",
      severity: "LOW",
    });

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "system",
        }),
      }),
    );
  });

  it("rejects an invalid incidentTypeEnum value via zod", async () => {
    await expect(
      flagWhsHazard({
        inspectionId: "insp-1",
        hazardType: "biohazard",
        severity: "HIGH",
        // @ts-expect-error — invalid enum on purpose to verify zod rejection
        incidentTypeEnum: "NOT_A_REAL_ENUM",
      }),
    ).rejects.toThrow();
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

// ─── 7. TOOL_HANDLERS dispatcher (owning-user context threading) ──────────────

describe("TOOL_HANDLERS dispatcher", () => {
  it("threads the owning userId through to flag_whs_hazard", async () => {
    mockPrisma.wHSIncident.create.mockResolvedValue({
      id: "whs-d1",
      incidentType: "biohazard",
      severity: "HIGH",
      createdAt: new Date(),
    });

    await TOOL_HANDLERS.flag_whs_hazard(
      {
        inspectionId: "insp-1",
        hazardType: "biohazard",
        severity: "HIGH",
      },
      { userId: "user-dispatch-9" },
    );

    expect(mockPrisma.wHSIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-dispatch-9" }),
      }),
    );
  });

  it("leaves other tools unaffected by the additive context parameter", async () => {
    mockPrisma.scopeItem.create.mockResolvedValue({
      id: "si-d1",
      itemType: "remove_carpet",
      description: "Remove carpet",
      quantity: 10,
      unit: "sqm",
      clauseRef: "S500:2021 §7.1",
    });

    // Context is ignored by tools that don't consume it; call still succeeds.
    const result = (await TOOL_HANDLERS.fill_scope_item(
      {
        inspectionId: "insp-1",
        itemType: "remove_carpet",
        description: "Remove carpet",
        quantity: 10,
        unit: "sqm",
        clauseRef: "S500:2021 §7.1",
      },
      { userId: "user-dispatch-9" },
    )) as { id: string };

    expect(mockPrisma.scopeItem.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("si-d1");
  });
});
