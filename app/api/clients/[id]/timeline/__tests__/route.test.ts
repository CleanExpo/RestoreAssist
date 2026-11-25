import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const clientFindFirst = vi.fn();
const inspectionFindMany = vi.fn();
const commsFindMany = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
// RA-8535: reach comes from the tenancy helpers; the reach rules themselves
// are proven against a fake database in customer-record.ra8535.test.ts.
const CLIENT_REACH = { AND: [{ OR: [{ userId: "owner1" }] }] };
const JOB_REACH = { AND: [{ OR: [{ userId: "owner1" }] }] };
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveClientReach: vi.fn(async () => ({ ok: true, data: CLIENT_REACH })),
  resolveInspectionReach: vi.fn(async () => ({ ok: true, data: JOB_REACH })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: { findFirst: (...a: unknown[]) => clientFindFirst(...a) },
    inspection: { findMany: (...a: unknown[]) => inspectionFindMany(...a) },
    clientCommsLog: { findMany: (...a: unknown[]) => commsFindMany(...a) },
  },
}));

import { GET } from "../route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const req = () => new NextRequest("http://localhost/api/clients/c1/timeline");

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "owner1" } });
  clientFindFirst.mockResolvedValue({ id: "c1" });
  inspectionFindMany.mockResolvedValue([
    { id: "i1", inspectionNumber: "NIR-2026-11-0001", propertyAddress: "1 Harbour St", claimType: "WATER", createdAt: new Date("2026-11-01T00:00:00Z"), completedAt: new Date("2026-11-08T00:00:00Z") },
  ]);
  commsFindMany.mockResolvedValue([
    { inspectionId: "i1", createdAt: new Date("2026-11-03T00:00:00Z"), status: "SENT", eventType: "DRYING_GOAL_CHANGE" },
  ]);
});

describe("GET /api/clients/[id]/timeline (RA-8220)", () => {
  it("returns the client's jobs and sent emails, newest first", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const { events } = await res.json();
    expect(events.map((e: { kind: string }) => e.kind)).toEqual(["job_completed", "email_sent", "job_opened"]);
    expect(events[2].title).toContain("Water damage job NIR-2026-11-0001");
  });

  it("checks the client with the list's reach and reads nothing else for a client out of reach", async () => {
    clientFindFirst.mockResolvedValue(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(clientFindFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: "c1" }, CLIENT_REACH] });
    expect(inspectionFindMany).not.toHaveBeenCalled();
  });

  it("reads only jobs within the caller's job reach", async () => {
    await GET(req(), ctx);
    expect(inspectionFindMany.mock.calls[0][0].where).toEqual({ AND: [{ clientId: "c1" }, JOB_REACH] });
  });

  it("bounds every query", async () => {
    await GET(req(), ctx);
    expect(inspectionFindMany.mock.calls[0][0].take).toBeGreaterThan(0);
    expect(commsFindMany.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  it("is 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(401);
  });
});
