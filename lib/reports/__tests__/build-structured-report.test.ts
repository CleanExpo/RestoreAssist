import { describe, it, expect } from "vitest";
import { buildStructuredBasicReport } from "../build-structured-report";

// RA-6687 (pt 2): DB-free unit tests for the primary report data-shaping module
// lib/reports/build-structured-report.ts. buildStructuredBasicReport is a pure
// function whose only dependency is the in-memory equipment matrix lookup — no
// Prisma, no AI, no PDF. These tests cover section assembly, cost/numeric maths,
// photo/area extraction priority, hazard inference, compliance standards, and
// null/empty handling.

// Minimal report stub — only `id` is structurally required (used to derive a
// fallback report number).
const baseReport = (overrides: Record<string, unknown> = {}) => ({
  id: "abcdef1234567890",
  ...overrides,
});

const build = (data: Record<string, unknown> = {}) =>
  buildStructuredBasicReport({
    report: baseReport(),
    analysis: null,
    stateInfo: null,
    ...data,
  } as Parameters<typeof buildStructuredBasicReport>[0]);

describe("buildStructuredBasicReport — envelope & defaults", () => {
  it("returns a typed envelope with version and report type", () => {
    const result = build();
    expect(result.type).toBe("restoration_inspection_report");
    expect(result.version).toBe("1.0");
    expect(typeof result.generatedAt).toBe("string");
  });

  it("defaults business name to RestoreAssist when no businessInfo", () => {
    expect(build().header.businessName).toBe("RestoreAssist");
  });

  it("derives a report number from the id when none supplied", () => {
    // id.substring(0, 8).toUpperCase() => "ABCDEF12"
    expect(build().header.reportNumber).toBe("RPT-ABCDEF12");
  });

  it("prefers an explicit reportNumber over the derived fallback", () => {
    const result = buildStructuredBasicReport({
      report: baseReport({ reportNumber: "RA-2026-001" }),
      analysis: null,
      stateInfo: null,
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.header.reportNumber).toBe("RA-2026-001");
  });

  it("produces empty collections and null sections for empty input", () => {
    const result = build();
    expect(result.affectedAreas).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result.scopeItems).toEqual([]);
    expect(result.costEstimates).toEqual([]);
    expect(result.equipment).toEqual([]);
    expect(result.classification).toBeNull();
    expect(result.environmental).toBeNull();
    expect(result.psychrometric).toBeNull();
    expect(result.summary.averageMoisture).toBeNull();
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.roomsAffected).toBe(0);
  });
});

describe("buildStructuredBasicReport — business info passthrough", () => {
  it("threads business identity (incl. ABN) into the header", () => {
    const result = buildStructuredBasicReport({
      report: baseReport(),
      analysis: null,
      stateInfo: null,
      businessInfo: {
        businessName: "Acme Restoration",
        businessABN: "95 691 477 844",
        businessPhone: "0400 000 000",
        businessEmail: "ops@acme.test",
      },
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.header.businessName).toBe("Acme Restoration");
    expect(result.header.businessABN).toBe("95 691 477 844");
    expect(result.header.businessPhone).toBe("0400 000 000");
    expect(result.header.businessEmail).toBe("ops@acme.test");
  });
});

describe("buildStructuredBasicReport — scope areas (priority 1)", () => {
  const scopeAreas = [
    { name: "Kitchen", length: 4, width: 3, height: 2.5, wetPercentage: 50 },
  ];

  it("computes volume and wet area from dimensions", () => {
    const result = build({ scopeAreas });
    const area = result.affectedAreas[0];
    expect(area.name).toBe("Kitchen");
    expect(area.volume).toBe(4 * 3 * 2.5); // 30
    expect(area.wetArea).toBe(4 * 3 * 0.5); // 6
    expect(area.dimensions).toEqual({ length: 4, width: 3, height: 2.5 });
    expect(area.wetPercentage).toBe(50);
  });

  it("counts rooms affected from scope areas in the summary", () => {
    expect(build({ scopeAreas }).summary.roomsAffected).toBe(1);
  });

  it("emits a metric (m × m × m) dimension description", () => {
    const desc = build({ scopeAreas }).affectedAreas[0].description as string;
    expect(desc).toContain("4m × 3m × 2.5m");
    expect(desc).toContain("Wet: 50%");
  });
});

describe("buildStructuredBasicReport — photo extraction", () => {
  it("normalises NIR photos and falls back thumbnailUrl to the main url", () => {
    const result = build({
      inspectionData: { photos: [{ url: "https://x/a.jpg" }] },
    });
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].url).toBe("https://x/a.jpg");
    expect(result.photos[0].thumbnailUrl).toBe("https://x/a.jpg");
  });

  it("dedupes analysis photos already present from NIR data", () => {
    const result = build({
      inspectionData: { photos: [{ url: "https://x/a.jpg" }] },
      analysis: { photos: [{ url: "https://x/a.jpg" }, { url: "https://x/b.jpg" }] },
    });
    const urls = result.photos.map((p: { url: string }) => p.url);
    expect(urls).toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });

  it("parses legacy JSON-string photos stored on the report", () => {
    const result = buildStructuredBasicReport({
      report: baseReport({
        photos: JSON.stringify([{ secure_url: "https://x/legacy.jpg" }]),
      }),
      analysis: null,
      stateInfo: null,
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.photos[0].url).toBe("https://x/legacy.jpg");
  });
});

describe("buildStructuredBasicReport — cost estimates & numeric maths", () => {
  it("derives subtotal and total from quantity × rate when absent", () => {
    const result = build({
      inspectionData: {
        costEstimates: [{ description: "Drying", quantity: 3, rate: 100 }],
      },
    });
    const cost = result.costEstimates[0];
    expect(cost.subtotal).toBe(300);
    expect(cost.total).toBe(300);
    expect(result.summary.totalCost).toBe(300);
  });

  it("coerces string numerics on cost items", () => {
    const result = build({
      inspectionData: {
        costEstimates: [{ description: "Labour", quantity: "2", rate: "50" }],
      },
    });
    expect(result.costEstimates[0].subtotal).toBe(100);
  });

  it("synthesises cost estimates from equipment selection × duration", () => {
    const result = build({
      report: baseReport({ estimatedDryingDuration: 5 }),
      equipmentSelection: [
        { groupId: "lgr-55", dailyRate: 60, quantity: 2 },
      ],
    });
    // 60 * 2 * 5 = 600
    expect(result.costEstimates).toHaveLength(1);
    expect(result.costEstimates[0].total).toBe(600);
    expect(result.summary.totalCost).toBe(600);
  });

  it("maps a known equipment group id to its matrix name and type", () => {
    const result = build({
      report: baseReport({ estimatedDryingDuration: 1 }),
      equipmentSelection: [{ groupId: "lgr-55", dailyRate: 60, quantity: 1 }],
    });
    const eq = result.equipment[0];
    expect(eq.type).toBe("LGR_DEHUMIDIFIER");
    expect(eq.name).not.toBe("lgr-55"); // resolved to the matrix display name
    expect(eq.totalCost).toBe(60);
  });
});

describe("buildStructuredBasicReport — moisture readings", () => {
  it("computes the average moisture across readings", () => {
    const result = build({
      inspectionData: {
        moistureReadings: [
          { location: "A", moistureLevel: 10 },
          { location: "B", moistureLevel: 30 },
        ],
      },
    });
    expect(result.summary.averageMoisture).toBe(20);
    expect(result.moistureReadings).toHaveLength(2);
    expect(result.moistureReadings[0].unit).toBe("%");
  });
});

describe("buildStructuredBasicReport — hazards (building age inference)", () => {
  it("flags pre-1990 buildings for asbestos and lead risk", () => {
    const result = buildStructuredBasicReport({
      report: baseReport({ buildingAge: "1975" }),
      analysis: null,
      stateInfo: null,
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.hazards.asbestosRisk).toBe("PRE-1990_BUILDING");
    expect(result.hazards.leadRisk).toBe("PRE-1990_BUILDING");
  });

  it("does not flag asbestos/lead for post-1990 buildings", () => {
    const result = buildStructuredBasicReport({
      report: baseReport({ buildingAge: "2005" }),
      analysis: null,
      stateInfo: null,
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.hazards.asbestosRisk).toBeNull();
    expect(result.hazards.leadRisk).toBeNull();
  });
});

describe("buildStructuredBasicReport — compliance & stabilisation terminology", () => {
  it("always includes the core IICRC S500/S520 standards", () => {
    const standards = build().compliance.standards as string[];
    expect(standards).toContain("IICRC S500 (Water Damage Restoration)");
    expect(standards).toContain("IICRC S520 (Mould Remediation)");
  });

  it("uses jurisdictional standards from stateInfo when present", () => {
    const result = buildStructuredBasicReport({
      report: baseReport(),
      analysis: null,
      stateInfo: {
        name: "Queensland",
        whsAct: "WHS Act QLD 2011",
        buildingCode: "QDC",
      },
    } as Parameters<typeof buildStructuredBasicReport>[0]);
    expect(result.compliance.state).toBe("Queensland");
    expect(result.compliance.standards).toContain("WHS Act QLD 2011");
    expect(result.compliance.standards).toContain("QDC");
  });

  it("labels phase 1 timeline using ANSI/IICRC S500 'Stabilisation' terminology", () => {
    expect(build().timeline.phase1.description).toBe("Stabilisation (Make-Safe)");
  });
});

describe("buildStructuredBasicReport — classification mapping", () => {
  it("maps the first IICRC classification into the classification section", () => {
    const result = build({
      inspectionData: {
        classifications: [
          {
            category: "Category 2",
            class: "Class 3",
            justification: "Grey water, large volume",
            standardReference: "IICRC S500 §10.5",
          },
        ],
      },
    });
    expect(result.classification).toEqual({
      category: "Category 2",
      class: "Class 3",
      justification: "Grey water, large volume",
      standardReference: "IICRC S500 §10.5",
    });
    // Classification also feeds the incident water category/class.
    expect(result.incident.waterCategory).toBe("Category 2");
    expect(result.incident.waterClass).toBe("Class 3");
  });
});

describe("buildStructuredBasicReport — environmental fallback", () => {
  it("prefers NIR environmental data when present", () => {
    const result = build({
      inspectionData: {
        environmentalData: {
          ambientTemperature: 24,
          humidityLevel: 60,
          dewPoint: 15,
          airCirculation: true,
        },
      },
    });
    expect(result.environmental).toEqual({
      ambientTemperature: 24,
      humidityLevel: 60,
      dewPoint: 15,
      airCirculation: true,
    });
  });

  it("derives a dew point from psychrometric data when no NIR env data", () => {
    const result = build({
      psychrometricAssessment: { temperature: 25, humidity: 50 },
    });
    // dewPoint = 25 - (100 - 50) / 5 = 15
    expect(result.environmental?.ambientTemperature).toBe(25);
    expect(result.environmental?.humidityLevel).toBe(50);
    expect(result.environmental?.dewPoint).toBe(15);
  });
});
