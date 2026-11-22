/**
 * RA-7694: /api/inspections/[id]/room-observations. Create, list, and the
 * failure paths: sign-in, another tenant's job, another job's room, bad input,
 * and the scope being re-asserted inside the read and the write.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  writeWithinInspectionScope: vi.fn(
    async (_scope: unknown, _data: unknown, work: (tx: unknown) => unknown) =>
      work(scopePrisma),
  ),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "i1" },
      inspectionManyWhere: { id: "i1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  })),
  resolveInspectionReach: vi.fn(async () => ({
    ok: true,
    data: { OR: [{ userId: "u_1" }] },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    inspection: { findFirst: vi.fn() },
    roomObservation: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  resolveInspectionReach,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { GET, POST } from "../route";

const fn = (x: unknown) => x as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  inspection: { findFirst: ReturnType<typeof vi.fn> };
  roomObservation: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const params = { params: Promise.resolve({ id: "i1" }) };

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/room-observations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function get(): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/room-observations");
}

beforeEach(() => {
  vi.clearAllMocks();
  fn(getServerSession).mockResolvedValue({ user: { id: "u_1" } });
  p.$queryRaw.mockResolvedValue([{ name: "Bedroom 2" }]);
  p.roomObservation.create.mockImplementation(async ({ data }: any) => ({
    id: "ro_1",
    ...data,
  }));
  p.roomObservation.findMany.mockResolvedValue([]);
  p.roomObservation.count.mockResolvedValue(0);
  p.inspection.findFirst.mockResolvedValue({ id: "i1" });
});

describe("POST room-observations", () => {
  it("records an intermittent musty odour in one room", async () => {
    const res = await POST(
      post({
        kind: "ODOUR",
        roomLabel: "Bedroom 2",
        odourDescriptor: "musty",
        odourPattern: "INTERMITTENT",
        odourIntensity: 2,
      }),
      params,
    );
    expect(res.status).toBe(201);
    const data = p.roomObservation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      inspectionId: "i1",
      roomLabel: "Bedroom 2",
      kind: "ODOUR",
      basis: "OBSERVED",
      odourDescriptor: "musty",
      odourPattern: "INTERMITTENT",
      odourIntensity: 2,
      source: "manual",
      capturedByUserId: "u_1",
    });
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });

  it("a linked room is looked up and locked inside the write, on this job, not detached", async () => {
    const res = await POST(
      post({ kind: "STAINING", sketchRoomId: "room1", surface: "ceiling" }),
      params,
    );
    expect(res.status).toBe(201);
    const query = p.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toMatch(/FOR SHARE OF sr/);
    expect(query.sql).toMatch(/"detachedAt" IS NULL/);
    expect(query.sql).toMatch(/cs\."inspectionId"/);
    expect(query.values).toEqual(["room1", "i1"]);
  });

  it("the room's own name is the label; a different label sent with a room id is ignored", async () => {
    await POST(
      post({
        kind: "STAINING",
        sketchRoomId: "room1",
        roomLabel: "Kitchen",
        surface: "wall",
      }),
      params,
    );
    const data = p.roomObservation.create.mock.calls[0][0].data;
    expect(data.roomLabel).toBe("Bedroom 2");
    expect(data.sketchRoomId).toBe("room1");
  });

  it("writes through the caller's job scope", async () => {
    await POST(post({ kind: "STAINING", roomLabel: "Hall", surface: "wall" }), params);
    expect(fn(writeWithinInspectionScope).mock.calls[0][0]).toEqual({ id: "i1" });
  });

  it("422 for a room that is not on this job, detached or gone, and nothing is written", async () => {
    p.$queryRaw.mockResolvedValueOnce([]);
    const res = await POST(
      post({ kind: "STAINING", sketchRoomId: "foreign", surface: "wall" }),
      params,
    );
    expect(res.status).toBe(422);
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("422 for bad input and writes nothing", async () => {
    for (const body of [
      { kind: "DIAGNOSIS", roomLabel: "x" },
      { kind: "ODOUR", roomLabel: "x", odourIntensity: 9 },
      { kind: "VISIBLE_GROWTH", roomLabel: "x", areaM2: -1 },
      { kind: "STAINING", roomLabel: "x", odourPattern: "CONSTANT" },
      { kind: "STAINING" },
      { kind: "STAINING", roomLabel: "Hall" },
      { kind: "VISIBLE_GROWTH", roomLabel: "Hall" },
      { kind: "STAINING", roomLabel: "Hall", surface: "wall", observedAt: "2020" },
    ]) {
      const res = await POST(post(body), params);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("400 for a body that is not JSON", async () => {
    const res = await POST(post("{nope"), params);
    expect(res.status).toBe(400);
  });

  it("401 when not signed in", async () => {
    fn(getServerSession).mockResolvedValueOnce(null);
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall", surface: "wall" }), params);
    expect(res.status).toBe(401);
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("404 for another tenant's job, and nothing is written", async () => {
    fn(assertInspectionAssignedWrite).mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall", surface: "wall" }), params);
    expect(res.status).toBe(404);
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("404 when the job leaves the caller's reach during the write", async () => {
    fn(writeWithinInspectionScope).mockResolvedValueOnce(null);
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall", surface: "wall" }), params);
    expect(res.status).toBe(404);
  });
});

describe("GET room-observations", () => {
  it("lists the job's observations with the caller's reach inside the query", async () => {
    p.roomObservation.findMany.mockResolvedValueOnce([{ id: "ro_1" }]);
    p.roomObservation.count.mockResolvedValueOnce(1);
    const res = await GET(get(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ observations: [{ id: "ro_1" }], omitted: 0 });
    const arg = p.roomObservation.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      inspectionId: "i1",
      inspection: { OR: [{ userId: "u_1" }] },
    });
    expect(arg.take).toBe(500);
  });

  it("says how many were left out of a bounded read", async () => {
    p.roomObservation.findMany.mockResolvedValueOnce(new Array(500).fill({ id: "x" }));
    p.roomObservation.count.mockResolvedValueOnce(503);
    const res = await GET(get(), params);
    expect((await res.json()).omitted).toBe(3);
  });

  it("an empty job the caller can reach is an empty list, not an error", async () => {
    const res = await GET(get(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ observations: [], omitted: 0 });
  });

  it("an empty result for a job outside the caller's reach is a 404, not an empty list", async () => {
    p.inspection.findFirst.mockResolvedValueOnce(null);
    const res = await GET(get(), params);
    expect(res.status).toBe(404);
  });

  it("404 when the caller's reach cannot be resolved", async () => {
    fn(resolveInspectionReach).mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await GET(get(), params);
    expect(res.status).toBe(404);
    expect(p.roomObservation.findMany).not.toHaveBeenCalled();
  });

  it("401 when not signed in", async () => {
    fn(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(get(), params);
    expect(res.status).toBe(401);
  });
});
