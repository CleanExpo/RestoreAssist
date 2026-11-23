/**
 * RA-8548 — one test per WRITER shape of saved moisture and psychrometric
 * readings. Each fixture copies the shape the writer really saves (file named
 * above each case). A case fails if a saved reading is read as absent, or if
 * metadata (water class, system type, drying potential, targets, areas,
 * photos) is read as a reading.
 */
import { describe, expect, it } from "vitest";
import { readSavedReadings } from "../saved-readings";

describe("readSavedReadings — moisture writer shapes (RA-8548)", () => {
  it("W1 NIR envelope: app/api/reports/initial-entry + nir-data write {moistureReadings, affectedAreas, scopeItems, photos}", () => {
    // components/InitialDataEntryForm.tsx (nirData) → initial-entry/route.ts nirDataJson
    const saved = JSON.stringify({
      moistureReadings: [
        {
          location: "Kitchen",
          surfaceType: "Plasterboard",
          moistureLevel: 28,
          depth: "Surface",
        },
      ],
      affectedAreas: [
        {
          roomZoneId: "Kitchen",
          affectedAreaSqm: 12,
          waterSource: "Burst pipe",
          timeSinceLoss: 6,
        },
      ],
      scopeItems: [
        {
          itemType: "remove_carpet",
          description: "Remove carpet",
          autoDetermined: false,
          isSelected: true,
        },
      ],
      photos: [{ url: "https://example.test/p.jpg", caption: "p" }],
    });
    const out = readSavedReadings({ moistureReadings: saved });
    expect(out.moisture).toHaveLength(1);
    expect(out.moisture[0]).toMatchObject({
      location: "Kitchen",
      material: "Plasterboard",
      value: "28",
      depth: "Surface",
    });
    expect(out.psychrometric).toEqual([]);
    expect(out.noneRecorded).toBe(false);
  });

  it("W2 monitoring array: POST/PUT /api/reports stores MonitoringVerificationProcedures moisture rows", () => {
    // components/MonitoringVerificationProcedures.tsx addMoistureReading
    const saved = JSON.stringify([
      {
        id: 1,
        timestamp: "2026-11-01T09:00:00.000Z",
        material: "Timber",
        location: "Hall",
        moistureContent: "22",
        targetLevel: "15",
        notes: "",
      },
    ]);
    const out = readSavedReadings({ moistureReadings: saved });
    expect(out.moisture).toHaveLength(1);
    expect(out.moisture[0]).toMatchObject({
      location: "Hall",
      material: "Timber",
      value: "22",
      savedTarget: "15",
      recordedAt: "2026-11-01T09:00:00.000Z",
    });
    // A saved target is not a dry standard.
    expect(out.moisture[0].dryStandard).toBeNull();
  });

  it("W3 seed demo envelope: prisma/seed-demo-inspection.ts (readingDate, instrument, status)", () => {
    const saved = JSON.stringify({
      moistureReadings: [
        {
          location: "Kitchen — base cabinet (north wall)",
          surfaceType: "Particleboard (Yellow Tongue)",
          moistureLevel: 42,
          depth: "Subsurface",
          readingDate: "2026-04-01T09:30:00Z",
          instrument: "Protimeter Surveymaster",
          status: "above-goal",
        },
      ],
      affectedAreas: [
        {
          roomZoneId: "Kitchen",
          affectedSquareFootage: 14,
          waterSource: "Burst pipe under sink",
          timeSinceLoss: 6,
        },
      ],
    });
    const out = readSavedReadings({ moistureReadings: saved });
    expect(out.moisture).toHaveLength(1);
    expect(out.moisture[0]).toMatchObject({
      value: "42",
      status: "above-goal",
      recordedAt: "2026-04-01T09:30:00Z",
    });
  });

  it("W4 relational MoistureReading rows (moisture route, draft-snapshot, evidence, take-reading, seed-demo)", () => {
    const out = readSavedReadings({
      moistureReadingRows: [
        {
          location: "Kitchen — plasterboard, north wall 150mm AFF",
          surfaceType: "plasterboard",
          moistureLevel: 4.8,
          depth: "Subsurface",
          unit: "WME",
          isBaseline: false,
          isMonitoringPoint: true,
          recordedAt: new Date("2026-11-01T00:00:00.000Z"),
          invalidatedAt: null,
          notes: null,
        },
        {
          location: "Laundry",
          surfaceType: "concrete",
          moistureLevel: 0,
          depth: "Surface",
          unit: null,
          recordedAt: new Date("2026-11-01T00:00:00.000Z"),
          invalidatedAt: null,
        },
      ],
    });
    expect(out.moisture.map((r) => r.value)).toEqual(["4.8", "0"]);
    expect(out.moisture[0]).toMatchObject({
      source: "relational",
      unit: "WME",
      isMonitoringPoint: true,
      recordedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("W4b an invalidated relational reading is not a current reading", () => {
    const out = readSavedReadings({
      moistureReadingRows: [
        {
          location: "Hall",
          surfaceType: "timber",
          moistureLevel: 30,
          depth: "Surface",
          invalidatedAt: new Date("2026-11-02T00:00:00.000Z"),
        },
      ],
    });
    expect(out.moisture).toEqual([]);
    expect(out.noneRecorded).toBe(true);
  });

  it("W5 tier 2 answer: components/Tier2Questions.tsx saves T2_Q1 as free text", () => {
    const out = readSavedReadings({
      tier2: {
        T2_Q1_moistureReadings:
          "Master Bedroom carpet: 32% MC, Hallway yellow tongue: 22% MC.",
        T2_Q2_waterMigrationPattern: "Down through the subfloor.",
      },
    });
    expect(out.moistureNotes).toEqual([
      "Master Bedroom carpet: 32% MC, Hallway yellow tongue: 22% MC.",
    ]);
    expect(out.noneRecorded).toBe(false);
  });

  it("W5b tier 2 free text is kept when report rows also exist", () => {
    const out = readSavedReadings({
      moistureReadings: JSON.stringify([
        { location: "Hall", material: "Timber", moistureContent: "22" },
      ]),
      tier2: JSON.stringify({ T2_Q1_moistureReadings: "Ensuite 18% MC" }),
    });
    expect(out.moisture).toHaveLength(1);
    expect(out.moistureNotes).toEqual(["Ensuite 18% MC"]);
  });

  it("W6 aliases: value / wme / reading / surfaceType / room all read as the same reading", () => {
    const out = readSavedReadings({
      moistureReadings: [
        { room: "Bed 1", surfaceType: "Carpet", value: 12, unit: "%" },
        { location: "Bed 2", material: "Timber", wme: 17 },
        {
          location: "Bed 3",
          material: "Tile",
          reading: 9,
          dryStandard: "16 WME",
        },
      ],
    });
    expect(out.moisture.map((r) => [r.location, r.material, r.value])).toEqual([
      ["Bed 1", "Carpet", "12"],
      ["Bed 2", "Timber", "17"],
      ["Bed 3", "Tile", "9"],
    ]);
    expect(out.moisture[2].dryStandard).toBe("16 WME");
  });

  it("M1 a record with a location but no measured value is not a reading", () => {
    const out = readSavedReadings({
      moistureReadings: [
        { location: "Lounge", material: "Carpet", notes: "wet" },
      ],
    });
    expect(out.moisture).toEqual([]);
    expect(out.noneRecorded).toBe(true);
  });

  it("M2 nothing saved anywhere reads as none recorded", () => {
    const out = readSavedReadings({
      moistureReadings: "not json",
      psychrometricReadings: null,
      psychrometricAssessment: undefined,
      tier2: { T2_Q1_moistureReadings: "   " },
    });
    expect(out).toEqual({
      moisture: [],
      psychrometric: [],
      moistureNotes: [],
      noneRecorded: true,
    });
  });
});

describe("readSavedReadings — psychrometric writer shapes (RA-8548)", () => {
  it("P1 equipment assessment: EquipmentToolsSelection / InitialDataEntryForm save temperature + humidity with metadata", () => {
    // app/api/reports/[id]/equipment/route.ts + initial-entry/route.ts
    const out = readSavedReadings({
      psychrometricAssessment: JSON.stringify({
        waterClass: 2,
        temperature: 25,
        humidity: 60,
        systemType: "closed",
        dryingPotential: {
          dryingIndex: 54,
          status: "FAIR",
          recommendation: "Increase airflow",
          vaporPressureDifferential: 1.2,
        },
      }),
    });
    expect(out.psychrometric).toHaveLength(1);
    expect(out.psychrometric[0]).toMatchObject({
      source: "assessment",
      temperature: "25",
      humidity: "60",
      gpp: null,
      dewPoint: null,
    });
    expect(JSON.stringify(out.psychrometric)).not.toContain("54");
    expect(JSON.stringify(out.psychrometric)).not.toContain("FAIR");
  });

  it("P2 seed assessment: prisma/seed-demo-inspection.ts writes grainsPoundDry and dewPoint", () => {
    const out = readSavedReadings({
      psychrometricAssessment: {
        waterClass: "Class 2",
        temperature: 26.4,
        humidity: 72,
        dewPoint: 21.1,
        grainsPoundDry: 98.2,
        grainsTarget: 52,
        systemType: "LGR Dehumidification",
        dryingPotential: { status: "Fair", dryingIndex: 33.6 },
      },
    });
    expect(out.psychrometric).toHaveLength(1);
    expect(out.psychrometric[0]).toMatchObject({
      temperature: "26.4",
      humidity: "72",
      dewPoint: "21.1",
      gpp: "98.2",
    });
    // A target is not a reading.
    expect(JSON.stringify(out.psychrometric)).not.toContain("52");
  });

  it("P3 assessment metadata alone (waterClass, systemType) is not a reading", () => {
    const out = readSavedReadings({
      psychrometricAssessment: { waterClass: 3, systemType: "open" },
    });
    expect(out.psychrometric).toEqual([]);
    expect(out.noneRecorded).toBe(true);
  });

  it("P4 seed psychrometric names: prisma/seed-demo.ts (indoorTempC, indoorRH, dewPointC, grainsPP)", () => {
    const out = readSavedReadings({
      psychrometricReadings: JSON.stringify([
        {
          day: 1,
          date: "2026-04-01",
          indoorTempC: 22.5,
          indoorRH: 68.5,
          dewPointC: 15.8,
          outdoorRH: 71.0,
          grainsPP: 72.4,
          dryingTarget: "≤71% RH",
          status: "ABOVE_TARGET",
        },
      ]),
    });
    expect(out.psychrometric).toHaveLength(1);
    expect(out.psychrometric[0]).toMatchObject({
      temperature: "22.5",
      humidity: "68.5",
      dewPoint: "15.8",
      gpp: "72.4",
      outdoorHumidity: "71",
      recordedAt: "2026-04-01",
    });
  });

  it("P5 monitoring array: MonitoringVerificationProcedures psychrometric rows (strings)", () => {
    const out = readSavedReadings({
      psychrometricReadings: JSON.stringify([
        {
          id: 1,
          timestamp: "2026-11-01T09:00:00.000Z",
          location: "Lounge",
          temperature: "21",
          humidity: "55",
          notes: "",
        },
      ]),
    });
    expect(out.psychrometric[0]).toMatchObject({
      location: "Lounge",
      temperature: "21",
      humidity: "55",
    });
  });

  it("P6 relational EnvironmentalData rows (environmental route, draft-snapshot, evidence)", () => {
    const out = readSavedReadings({
      environmentalDataRows: [
        {
          ambientTemperature: 23,
          humidityLevel: 64,
          dewPoint: 15.9,
          airCirculation: true,
          weatherConditions: "Overcast",
          location: null,
          gpp: null,
          grainsPerPound: 70.1,
          recordedAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      ],
    });
    expect(out.psychrometric).toHaveLength(1);
    expect(out.psychrometric[0]).toMatchObject({
      source: "relational",
      temperature: "23",
      humidity: "64",
      dewPoint: "15.9",
      gpp: "70.1",
    });
  });

  it("P7 relational PsychrometricReading rows (psychrometric route)", () => {
    const out = readSavedReadings({
      psychrometricReadingRows: [
        {
          visitDate: new Date("2026-11-03T00:00:00.000Z"),
          visitNumber: 2,
          dryBulbTempC: 24,
          wetBulbTempC: 18,
          relativeHumidity: 58,
          dewPointC: 15.3,
          grainsPerPound: 67,
          gramsPerKilogram: 9.6,
          equipmentRunning: true,
        },
      ],
    });
    expect(out.psychrometric[0]).toMatchObject({
      temperature: "24",
      humidity: "58",
      dewPoint: "15.3",
      gpp: "67",
      recordedAt: "2026-11-03T00:00:00.000Z",
    });
  });
});
