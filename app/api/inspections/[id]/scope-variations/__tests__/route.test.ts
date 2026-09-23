import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const scopeVariationFindFirst = vi.hoisted(() => vi.fn());
const scopeVariationUpdate = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionTenancy }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    fn: (rawBody: string) => Promise<Response>,
  ) => fn(await request.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    scopeVariation: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: scopeVariationFindFirst,
      update: scopeVariationUpdate,
    },
  },
}));

import { PATCH } from "../route";

function patchRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/insp-B/scope-variations",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variationId: "var-1",
        status: "APPROVED",
        notes: "approved",
      }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin-A" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin-A", role: "ADMIN", organizationId: "org-A" },
  });
  applyRateLimit.mockResolvedValue(null);
  // The variation exists and is actionable on purpose. If it were null the
  // handler's own "Variation not found" branch would also return 404 — the
  // same status as the tenancy refusal — and the control below would pass
  // against the unfixed route. This mock is what lets the mutant reach the
  // approval write and go red.
  scopeVariationFindFirst.mockResolvedValue({ id: "var-1", status: "PENDING" });
  scopeVariationUpdate.mockResolvedValue({ id: "var-1", status: "APPROVED" });
  assertInspectionTenancy.mockResolvedValue({
    ok: true,
    data: { userId: "admin-A", inspectionId: "insp-B" },
  });
});

describe("PATCH /api/inspections/[id]/scope-variations", () => {
  it("refuses an admin outside the inspection's tenancy", async () => {
    assertInspectionTenancy.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const response = await PATCH(patchRequest(), {
      params: Promise.resolve({ id: "insp-B" }),
    });

    expect(response.status).toBe(404);
    // A gate that returned the right status while still touching the other
    // tenant's rows would pass a status-only assertion.
    expect(scopeVariationFindFirst).not.toHaveBeenCalled();
    expect(scopeVariationUpdate).not.toHaveBeenCalled();
  });

  it("approves a pending variation inside the caller's tenancy", async () => {
    const response = await PATCH(patchRequest(), {
      params: Promise.resolve({ id: "insp-B" }),
    });

    expect(response.status).toBe(200);
    expect(scopeVariationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "var-1" },
        data: expect.objectContaining({
          status: "APPROVED",
          approvedByUserId: "admin-A",
        }),
      }),
    );
  });
});
