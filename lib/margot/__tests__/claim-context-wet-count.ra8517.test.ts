import { describe, expect, it } from "vitest";
import { loadClaimContext } from "@/lib/margot/claim-context";

// RA-8517 item 6: Margot's claim context counted "wet" readings with a fixed
// 15%, which names no source and ignores the job's reference readings. It now
// asks the drying-goal owner (reference reading first, else the guide value).

type Row = {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  unit: string | null;
  isBaseline: boolean;
  isMonitoringPoint: boolean;
  invalidatedAt: null;
  recordedAt: Date;
  createdAt: Date;
};

const at = (d: string) => new Date(`2026-11-${d}T09:00:00Z`);

function row(p: Partial<Row> & Pick<Row, "id" | "location" | "surfaceType" | "moistureLevel">): Row {
  return {
    unit: null,
    isBaseline: false,
    isMonitoringPoint: true,
    invalidatedAt: null,
    recordedAt: at("20"),
    createdAt: at("20"),
    ...p,
  };
}

function prismaWith(readings: Row[]) {
  return {
    inspection: {
      findFirst: async () => ({
        id: "insp-1",
        status: "IN_PROGRESS",
        claimType: "WATER",
        claimNumber: "C-1",
        clientId: "client-1",
        report: { incidentDate: at("15"), waterCategory: "1" },
      }),
    },
    moistureReading: { findMany: async () => readings },
    waterDamageClassification: {
      findUnique: async () => ({ waterCategory: "1", damageClass: "2" }),
    },
    report: {},
  } as never;
}

describe("loadClaimContext wetReadingCount (RA-8517 item 6)", () => {
  it("counts a reading above the job's reference reading even when it is under 15%", async () => {
    const ctx = await loadClaimContext(
      prismaWith([
        row({ id: "b1", location: "Spare room", surfaceType: "timber", moistureLevel: 11, isBaseline: true, isMonitoringPoint: false, recordedAt: at("18"), createdAt: at("18") }),
        row({ id: "m1", location: "Hall", surfaceType: "timber", moistureLevel: 14 }),
      ]),
      { inspectionId: "insp-1" },
    );
    expect(ctx?.wetReadingCount).toBe(1);
  });

  it("does not count a plasterboard reading at or below its guide value", async () => {
    // Guide for plasterboard: 1.5%. Under the old fixed 15% this was also dry;
    // the clean twin shows the owner and the old number agree here.
    const ctx = await loadClaimContext(
      prismaWith([row({ id: "m1", location: "Wall", surfaceType: "plasterboard", moistureLevel: 1.2 })]),
      { inspectionId: "insp-1" },
    );
    expect(ctx?.wetReadingCount).toBe(0);
  });

  it("counts a plasterboard reading above its guide value even when it is under 15%", async () => {
    const ctx = await loadClaimContext(
      prismaWith([row({ id: "m1", location: "Wall", surfaceType: "plasterboard", moistureLevel: 8 })]),
      { inspectionId: "insp-1" },
    );
    expect(ctx?.wetReadingCount).toBe(1);
  });

  it("does not count a timber reading at or below its reference, even above 15%", async () => {
    const ctx = await loadClaimContext(
      prismaWith([
        row({ id: "b1", location: "Spare room", surfaceType: "timber", moistureLevel: 17, isBaseline: true, isMonitoringPoint: false, recordedAt: at("18"), createdAt: at("18") }),
        row({ id: "m1", location: "Hall", surfaceType: "timber", moistureLevel: 16 }),
      ]),
      { inspectionId: "insp-1" },
    );
    expect(ctx?.wetReadingCount).toBe(0);
  });
});
