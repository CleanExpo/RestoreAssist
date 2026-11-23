/**
 * RA-8508: the daily monitoring report judges each reading against the same
 * drying goal as everything else (lib/iicrc-dry-standards.ts): the job's
 * reference reading from unaffected like material, otherwise the guide value.
 * It never labels the goal as an IICRC S500 threshold, and reference and
 * invalidated readings are not counted as drying progress.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  readable: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: m.readable,
  assertInspectionAssignedWrite: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: m.findUnique } },
}));

import { GET } from "../route";

const day = (d: string) => new Date(`2026-11-0${d}T09:00:00Z`);

const reading = (over: Record<string, unknown>) => ({
  id: "r",
  location: "Lounge",
  surfaceType: "timber",
  moistureLevel: 15,
  depth: "Surface",
  notes: null,
  isBaseline: false,
  unit: null,
  invalidatedAt: null,
  recordedAt: day("2"),
  createdAt: day("2"),
  ...over,
});

async function report(readings: unknown[]) {
  m.findUnique.mockResolvedValue({
    id: "insp_1",
    inspectionNumber: "INS-1",
    propertyAddress: "1 Test St",
    technicianName: null,
    inspectionDate: null,
    moistureReadings: readings,
    affectedAreas: [],
  });
  const res = await GET(new NextRequest("http://localhost/api/inspections/insp_1/monitoring-report"), {
    params: Promise.resolve({ id: "insp_1" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()).report;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user: { id: "u1" } });
  m.readable.mockResolvedValue({ ok: true, data: {} });
});

describe("monitoring report drying goal (RA-8508)", () => {
  it("a reading above the job's reference reading is not achieved, though it meets the guide", async () => {
    const r = await report([
      reading({ id: "b", location: "Hallway", moistureLevel: 12.5, isBaseline: true, recordedAt: day("1"), createdAt: day("1") }),
      reading({ id: "m", moistureLevel: 15 }),
    ]);
    const last = r.dailyLogs[r.dailyLogs.length - 1];
    expect(last.readings.map((x: { id: string }) => x.id)).toEqual(["m"]);
    expect(last.readings[0].target).toBe(12.5);
    expect(last.dryingStatus).not.toBe("ACHIEVED");
  });

  it("an invalidated reading does not count", async () => {
    const r = await report([
      reading({ id: "m1", moistureLevel: 22, recordedAt: day("2") }),
      reading({ id: "m2", moistureLevel: 5, recordedAt: day("3"), createdAt: day("3"), invalidatedAt: day("3") }),
    ]);
    const ids = r.dailyLogs.flatMap((l: { readings: { id: string }[] }) => l.readings.map((x) => x.id));
    expect(ids).toEqual(["m1"]);
  });

  it("names no standard for the goal", async () => {
    const r = await report([reading({ id: "m", moistureLevel: 10 })]);
    const text = JSON.stringify(r);
    expect(r.dailyLogs[0].dryingStatus).toBe("ACHIEVED");
    expect(text).not.toMatch(/IICRC|S500|§/);
  });
});

describe("monitoring report feeds the drying charts (RA-8590)", () => {
  it("returns the job's reference readings and each reading's unit", async () => {
    const r = await report([
      reading({ id: "b", location: "Hallway", moistureLevel: 12.5, isBaseline: true, unit: "%MC", recordedAt: day("1"), createdAt: day("1") }),
      reading({ id: "m", moistureLevel: 15, unit: "%MC" }),
    ]);
    expect(r.references).toEqual({ timber: 12.5 });
    expect(r.dailyLogs[r.dailyLogs.length - 1].readings[0].unit).toBe("%MC");
  });
});
