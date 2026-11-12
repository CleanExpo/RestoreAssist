/**
 * RA-8327 — the make-safe route names and accepts the list for this job.
 *
 * GET tells the checklist which list to draw (fire or standard), and POST and
 * PATCH refuse an action that is not on this job's list, so a fire job cannot
 * be given "mould containment" and a water job cannot be given a fire line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { findMany, findUnique, upsert } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (req: NextRequest, _u: string, fn: (b: string) => unknown) =>
    req.text().then((b) => fn(b)),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(async () => ({ ok: true })),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: { inspectionManyWhere: { id: "insp-1" } },
  })),
  writeWithinInspectionScope: (_s: unknown, _d: unknown, fn: (tx: unknown) => unknown) =>
    fn({ makeSafeAction: { upsert } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    makeSafeAction: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: vi.fn(async () => null),
    },
    inspection: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

import { GET, PATCH, POST } from "../route";

const ctx = { params: Promise.resolve({ id: "insp-1" }) };
const url = "http://localhost/api/inspections/insp-1/make-safe";

function patch(actions: Array<{ action: string; completed?: boolean }>) {
  return PATCH(
    new NextRequest(url, { method: "PATCH", body: JSON.stringify({ actions }) }),
    ctx,
  );
}

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
  upsert.mockReset();
  findMany.mockResolvedValue([]);
  upsert.mockImplementation(async ({ create }: { create: { action: string } }) => create);
});

describe("GET names the list", () => {
  it("returns the fire list for a fire job", async () => {
    findUnique.mockResolvedValue({ claimType: "FIRE" });
    const res = (await GET(new NextRequest(url), ctx)) as NextResponse;
    const body = await res.json();
    expect(body.actions).toEqual([
      "power_isolated",
      "gas_isolated",
      "structure_safe",
      "openings_secured",
      "occupant_briefing",
      "asbestos_presumed",
    ]);
  });

  it("returns the standard list for a water job", async () => {
    findUnique.mockResolvedValue({ claimType: "WATER" });
    const res = (await GET(new NextRequest(url), ctx)) as NextResponse;
    const body = await res.json();
    expect(body.actions).toContain("mould_containment");
    expect(body.actions).not.toContain("structure_safe");
  });
});

describe("PATCH and POST accept only this job's list", () => {
  it("accepts a fire action on a fire job", async () => {
    findUnique.mockResolvedValue({ claimType: "FIRE" });
    const res = await patch([{ action: "structure_safe", completed: true }]);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses mould containment on a fire job", async () => {
    findUnique.mockResolvedValue({ claimType: "FIRE" });
    const res = await patch([{ action: "mould_containment", completed: true }]);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a fire action on a water job", async () => {
    findUnique.mockResolvedValue({ claimType: "WATER" });
    const res = await patch([{ action: "structure_safe", completed: true }]);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("POST refuses a fire action on a water job", async () => {
    findUnique.mockResolvedValue({ claimType: "WATER" });
    const res = await POST(
      new NextRequest(url, {
        method: "POST",
        body: JSON.stringify({ action: "asbestos_presumed", completed: true }),
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
