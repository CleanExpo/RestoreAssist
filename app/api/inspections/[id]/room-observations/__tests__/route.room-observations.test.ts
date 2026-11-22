/**
 * RA-7694: /api/inspections/[id]/room-observations. Create, list, and the
 * failure paths: sign-in, another tenant's job, another job's room, bad input.
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
  assertInspectionReadable: vi.fn(async () => ({
    ok: true,
    data: { id: "i1", userId: "u_1", workspaceId: null },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sketchRoom: { findFirst: vi.fn() },
    roomObservation: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  assertInspectionReadable,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { GET, POST } from "../route";

const fn = (x: unknown) => x as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  sketchRoom: { findFirst: ReturnType<typeof vi.fn> };
  roomObservation: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
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
  p.sketchRoom.findFirst.mockResolvedValue({ name: "Bedroom 2" });
  p.roomObservation.create.mockImplementation(async ({ data }: any) => ({
    id: "ro_1",
    ...data,
  }));
  p.roomObservation.findMany.mockResolvedValue([]);
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
  });

  it("copies the room name from a linked sketch room", async () => {
    const res = await POST(
      post({ kind: "STAINING", sketchRoomId: "room1", surface: "ceiling" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(p.roomObservation.create.mock.calls[0][0].data.roomLabel).toBe("Bedroom 2");
    const where = p.sketchRoom.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: "room1",
      detachedAt: null,
      sketch: { inspectionId: "i1" },
    });
  });

  it("writes through the caller's job scope", async () => {
    await POST(post({ kind: "STAINING", roomLabel: "Hall" }), params);
    expect(fn(writeWithinInspectionScope).mock.calls[0][0]).toEqual({ id: "i1" });
  });

  it("422 for a room that is not on this job", async () => {
    p.sketchRoom.findFirst.mockResolvedValueOnce(null);
    const res = await POST(
      post({ kind: "STAINING", sketchRoomId: "foreign" }),
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
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall" }), params);
    expect(res.status).toBe(401);
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("404 for another tenant's job, and nothing is written", async () => {
    fn(assertInspectionAssignedWrite).mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall" }), params);
    expect(res.status).toBe(404);
    expect(p.roomObservation.create).not.toHaveBeenCalled();
  });

  it("404 when the job leaves the caller's reach during the write", async () => {
    fn(writeWithinInspectionScope).mockResolvedValueOnce(null);
    const res = await POST(post({ kind: "STAINING", roomLabel: "Hall" }), params);
    expect(res.status).toBe(404);
  });
});

describe("GET room-observations", () => {
  it("lists the job's observations, bounded", async () => {
    p.roomObservation.findMany.mockResolvedValueOnce([{ id: "ro_1" }]);
    const res = await GET(get(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ observations: [{ id: "ro_1" }] });
    const arg = p.roomObservation.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ inspectionId: "i1" });
    expect(arg.take).toBe(500);
  });

  it("an empty job lists an empty array, not an error", async () => {
    const res = await GET(get(), params);
    expect(await res.json()).toEqual({ observations: [] });
  });

  it("404 for another tenant's job, and nothing is read", async () => {
    fn(assertInspectionReadable).mockResolvedValueOnce({
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
