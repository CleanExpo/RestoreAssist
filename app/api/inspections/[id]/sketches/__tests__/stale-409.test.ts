/**
 * RA-1762 — staleness guard on POST /api/inspections/[id]/sketches.
 *
 * Drains from the offline queue can carry payloads whose logical
 * timestamp predates the latest server write (user briefly came
 * online and saved fresh state, then a slow queued POST finally
 * lands carrying the older state). The route now reads
 * `x-client-updated-at` and rejects with 409 + `{ stale: true }`
 * when the existing row's `updatedAt` is newer.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

function makePost(opts: {
  body: object;
  clientUpdatedAt?: string;
}): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.clientUpdatedAt) {
    headers["x-client-updated-at"] = opts.clientUpdatedAt;
  }
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body),
  });
}

const NOW_MS = 1_700_000_000_000;
const OLDER_MS = NOW_MS - 60_000;
const NEWER_MS = NOW_MS + 60_000;

describe("RA-1762 — sketch POST staleness guard", () => {
  it("returns 409 + { stale: true } when client timestamp is older than server", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      inspectionId: "i1",
      floorNumber: 0,
      updatedAt: new Date(NOW_MS),
    });

    const res = await POST(
      makePost({
        body: { floorNumber: 0, sketchData: { ver: "old" } },
        clientUpdatedAt: String(OLDER_MS),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.stale).toBe(true);
    expect(json.reason).toMatch(/newer/i);
    expect(p.claimSketch.update).not.toHaveBeenCalled();
    expect(p.claimSketch.create).not.toHaveBeenCalled();
  });

  it("proceeds with update when client timestamp is newer than server", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      inspectionId: "i1",
      floorNumber: 0,
      updatedAt: new Date(NOW_MS),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(
      makePost({
        body: { floorNumber: 0, sketchData: { ver: "new" } },
        clientUpdatedAt: String(NEWER_MS),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(p.claimSketch.update).toHaveBeenCalledTimes(1);
  });

  it("proceeds with create when no existing row and header is present", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_2" });

    const res = await POST(
      makePost({
        body: { floorNumber: 1, floorLabel: "First", sketchData: {} },
        clientUpdatedAt: String(NOW_MS),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(p.claimSketch.create).toHaveBeenCalledTimes(1);
  });

  it("ignores absence of header (legacy/online-first save paths)", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      inspectionId: "i1",
      floorNumber: 0,
      updatedAt: new Date(NEWER_MS), // server is newer than the inferred client time
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(
      makePost({
        body: { floorNumber: 0, sketchData: { ver: "x" } },
        // No clientUpdatedAt — pre-RA-1762 callers shouldn't be punished
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(p.claimSketch.update).toHaveBeenCalledTimes(1);
  });

  it("accepts ISO-formatted clientUpdatedAt header", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      inspectionId: "i1",
      floorNumber: 0,
      updatedAt: new Date(NOW_MS),
    });

    const res = await POST(
      makePost({
        body: { floorNumber: 0, sketchData: {} },
        clientUpdatedAt: new Date(OLDER_MS).toISOString(),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(409);
  });

  it("ignores garbage timestamps (treat as no-header)", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      updatedAt: new Date(NOW_MS),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(
      makePost({
        body: { floorNumber: 0, sketchData: {} },
        clientUpdatedAt: "not-a-date",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    // Garbage parses to NaN → not finite → falls through to update.
    expect(res.status).toBe(201);
  });
});
