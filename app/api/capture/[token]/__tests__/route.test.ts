import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T8 — homeowner self-capture read (Tom, /capture/[token]).
// Locks: an invalid/expired token is denied 404 WITHOUT touching tenant data,
// and a valid token reads only its own inspection's address + floors.

const verifyCaptureToken = vi.fn();
vi.mock("@/lib/capture-token", () => ({
  verifyCaptureToken: (...a: unknown[]) => verifyCaptureToken(...a),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api-errors", () => ({
  fromException: () =>
    new Response(JSON.stringify({ error: "server" }), { status: 500 }),
}));

const inspectionFindUnique = vi.fn();
const claimSketchFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) },
    claimSketch: { findMany: (...a: unknown[]) => claimSketchFindMany(...a) },
  },
}));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/capture/tok_x");
const ctx = (token = "tok_x") => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  verifyCaptureToken.mockReset();
  inspectionFindUnique.mockReset();
  claimSketchFindMany.mockReset();
});

describe("GET /api/capture/[token]", () => {
  it("denies an invalid/expired token with 404 and reads no tenant data", async () => {
    verifyCaptureToken.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("invalid_or_expired_token");
    // Security: never query inspection/sketch data on a rejected token.
    expect(inspectionFindUnique).not.toHaveBeenCalled();
    expect(claimSketchFindMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the bound inspection is gone", async () => {
    verifyCaptureToken.mockResolvedValueOnce({ inspectionId: "i_1" });
    inspectionFindUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(claimSketchFindMany).not.toHaveBeenCalled();
  });

  it("returns the address + floors scoped to the token's own inspection", async () => {
    verifyCaptureToken.mockResolvedValueOnce({ inspectionId: "i_1" });
    inspectionFindUnique.mockResolvedValueOnce({ propertyAddress: "12 Test St" });
    claimSketchFindMany.mockResolvedValueOnce([
      { floorNumber: 0, floorLabel: "Ground", sketchData: {}, pendingHomeownerCapture: true },
    ]);

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.propertyAddress).toBe("12 Test St");
    expect(json.floors).toHaveLength(1);
    // Tenant scoping: floors are pinned to the resolved inspection only.
    expect(claimSketchFindMany.mock.calls[0][0].where).toMatchObject({
      inspectionId: "i_1",
    });
  });

  it("caps the floors query at 50 rows on this unauthenticated surface", async () => {
    verifyCaptureToken.mockResolvedValueOnce({ inspectionId: "i_1" });
    inspectionFindUnique.mockResolvedValueOnce({ propertyAddress: "12 Test St" });
    claimSketchFindMany.mockResolvedValueOnce([]);

    await GET(req(), ctx());
    // Bound the payload so a buggy/abusive client can't grow it without limit,
    // matching the authenticated sibling route's take: 50 cap.
    expect(claimSketchFindMany.mock.calls[0][0].take).toBe(50);
  });
});
