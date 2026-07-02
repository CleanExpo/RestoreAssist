/**
 * SP-A Task 6 — POST /api/inspections/[id]/close-summary tests.
 *
 * Verifies the route's auth, tenancy, subscription-gate, and happy-path
 * behaviour. Integration with buildCloseSummary is mocked — the AI hook
 * has its own deep coverage in lib/ai/lifecycle/__tests__.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const assertInspectionTenancy = vi.fn();
const buildCloseSummary = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/ai/lifecycle/on-close", () => ({
  buildCloseSummary: (...a: unknown[]) => buildCloseSummary(...a),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  assertInspectionTenancy.mockReset();
  buildCloseSummary.mockReset();
});

function makeReq(body: unknown = {}): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/ins_1/close-summary",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

const routeParams = { params: Promise.resolve({ id: "ins_1" }) };

describe("POST /api/inspections/[id]/close-summary", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns the tenancy reject status when assertInspectionTenancy fails", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 402 with friendly error when subscription required", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    buildCloseSummary.mockResolvedValueOnce({
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "blocked",
    });
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(402);
  });

  it("returns 200 with draft on happy path", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    buildCloseSummary.mockResolvedValueOnce({
      ok: true,
      source: "ai",
      draft: { text: "Summary text", inspectionNumber: "NIR-2026-05-0001" },
    });
    const res = await POST(makeReq({ invoiceId: "inv_1" }), routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.text).toBe("Summary text");
    expect(body.source).toBe("ai");
  });

  it("returns 500 with generic message when handler throws (no leak per rule 7)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: true,
      data: { id: "ins_1", userId: "u_1", workspaceId: "ws_1" },
    });
    buildCloseSummary.mockRejectedValueOnce(new Error("DB exploded"));
    const res = await POST(makeReq(), routeParams);
    expect(res.status).toBe(500);
    const body = await res.json();
    // RA-1548: error responses now use the { error: { code, message, eventId } } envelope.
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("DB exploded");
  });
});
