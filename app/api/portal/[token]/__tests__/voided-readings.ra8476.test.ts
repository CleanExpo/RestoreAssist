/**
 * RA-8476 — the client portal never shows a voided moisture reading.
 *
 * A technician voids a reading by setting `invalidatedAt`; the row stays on
 * the job for audit. The fake database below honours the `where` each route
 * sends, so these tests fail if a portal route reads readings without the
 * `invalidatedAt: null` filter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Reading = {
  inspectionId: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  recordedAt: Date;
  invalidatedAt: Date | null;
};

const db = vi.hoisted(() => ({ readings: [] as unknown[] }));

function matches(r: Reading, where: Record<string, unknown> | undefined) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    const value = (r as unknown as Record<string, unknown>)[k];
    return v === null ? value === null || value === undefined : value === v;
  });
}
const rows = () => db.readings as Reading[];

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(async () => ({ clientId: "c_1" })),
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(() => ({ inspectionId: "insp_1" })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: vi.fn(
        async (args: {
          select: { moistureReadings: { where?: Record<string, unknown> } };
        }) => ({
          id: "insp_1",
          status: "DRYING",
          report: null,
          affectedAreas: [{ id: "area_1", roomZoneId: "Kitchen" }],
          moistureReadings: rows()
            .filter((r) => r.inspectionId === "insp_1")
            .filter((r) => matches(r, args.select.moistureReadings.where)),
        }),
      ),
      findUnique: vi.fn(async () => ({
        inspectionNumber: "INS-1",
        propertyAddress: "1 Test St",
        technicianName: "Tech",
        inspectionDate: new Date("2026-11-01T00:00:00Z"),
        status: "DRYING",
        affectedAreas: [],
        scopeItems: [],
        report: null,
      })),
    },
    inspectionWorkflow: { findUnique: vi.fn(async () => null) },
    reportApproval: { findMany: vi.fn(async () => []) },
    dryingGoalRecord: { findUnique: vi.fn(async () => null) },
    affectedArea: { count: vi.fn(async () => 0) },
    scopeItem: { count: vi.fn(async () => 0) },
    moistureReading: {
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows().filter((r) => matches(r, where)).length,
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const hit = rows()
            .filter((r) => matches(r, where))
            .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
          return hit ? { recordedAt: hit.recordedAt } : null;
        },
      ),
    },
  },
}));

import { GET as portalGet } from "../route";
import { GET as updatesGet } from "../updates/route";

const KEPT = new Date("2026-11-02T00:00:00Z");
const VOIDED_AT = new Date("2026-11-03T00:00:00Z");

beforeEach(() => {
  db.readings = [
    {
      inspectionId: "insp_1",
      location: "Kitchen",
      surfaceType: "plasterboard",
      moistureLevel: 0.5,
      recordedAt: KEPT,
      invalidatedAt: null,
    },
    {
      // Voided: a mistyped 99% the technician corrected.
      inspectionId: "insp_1",
      location: "Kitchen",
      surfaceType: "plasterboard",
      moistureLevel: 99,
      recordedAt: VOIDED_AT,
      invalidatedAt: new Date("2026-11-03T01:00:00Z"),
    },
  ] satisfies Reading[];
});

const params = { params: Promise.resolve({ token: "tok" }) };

describe("RA-8476 portal hides voided readings", () => {
  it("the updates feed never carries the voided reading", async () => {
    const res = await updatesGet(
      new NextRequest("http://localhost/api/portal/tok/updates"),
      params,
    );
    expect(res.status).toBe(200);
    const withVoided = (await res.json()).data.dryingTimeline;

    // The same job with the voided row never recorded: the client must see
    // exactly this. (The feed never shows raw values; the latest reading
    // drives each area's state, so a voided 99% would flip it.)
    db.readings = rows().filter((r) => r.invalidatedAt === null);
    const live = await updatesGet(
      new NextRequest("http://localhost/api/portal/tok/updates"),
      params,
    );
    const liveOnly = (await live.json()).data.dryingTimeline;
    expect(liveOnly.length).toBeGreaterThan(0);
    expect(withVoided).toEqual(liveOnly);
  });

  it("the portal summary counts and dates only live readings", async () => {
    const res = await portalGet(
      new NextRequest("http://localhost/api/portal/tok"),
      params,
    );
    expect(res.status).toBe(200);
    const { progressChecks } = await res.json();
    expect(progressChecks.completedCheckCount).toBe(1);
    expect(progressChecks.latestCheckDate).toBe(KEPT.toISOString());
  });
});
