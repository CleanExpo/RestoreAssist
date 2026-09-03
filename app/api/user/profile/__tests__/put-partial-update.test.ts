/**
 * Tests for PUT /api/user/profile
 * Route: app/api/user/profile/route.ts
 *
 * RA-7432: the Settings page saves in two separate cards (contact details,
 * business details). Each card sends only its own fields, so a field that is
 * ABSENT from the body must be left alone. Before this fix `sanitizeString`
 * turned an absent field into "" and the handler wrote that "" to the row, so
 * saving Full Name silently wiped business name, address, ABN, phone, email
 * and logo — and the onboarding "business_profile" step could never stay green.
 *
 * Mocks session, CSRF and prisma so the test runs offline (no DB / network).
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/report-limits", () => ({ getUserReportLimits: vi.fn() }));
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn(),
  checkAndUpdateTrialStatus: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

// Import route AFTER mocks are registered.
const { PUT } = await import("../route");

const VALID_ABN = "53004085616";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/profile", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const updatedRow = {
  id: "u_1",
  name: "Phill",
  email: "phill@example.com",
  businessName: "Acme Restoration",
  businessAddress: "1 Main St, Brisbane QLD 4000",
  businessLogo: null,
  businessABN: VALID_ABN,
  businessPhone: null,
  businessEmail: null,
  role: "ADMIN",
  organizationId: null,
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userFindFirst.mockReset();
  userUpdate.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  userFindUnique.mockResolvedValue({ role: "ADMIN" });
  userFindFirst.mockResolvedValue(null);
  userUpdate.mockResolvedValue(updatedRow);
});

describe("PUT /api/user/profile — absent fields are left alone (RA-7432)", () => {
  it("saving business name and address does not touch name, email or the other business fields", async () => {
    const res = await PUT(
      makeReq({
        businessName: "Acme Restoration",
        businessAddress: "1 Main St, Brisbane QLD 4000",
      }),
    );
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data).toEqual({
      businessName: "Acme Restoration",
      businessAddress: "1 Main St, Brisbane QLD 4000",
    });
  });

  it("saving Full Name does not wipe business name, address, ABN, phone, email or logo", async () => {
    const res = await PUT(makeReq({ name: "Phill McGurk" }));
    expect(res.status).toBe(200);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ name: "Phill McGurk" });
  });

  it("an explicit empty string still clears a business field", async () => {
    const res = await PUT(makeReq({ businessAddress: "" }));
    expect(res.status).toBe(200);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ businessAddress: "" });
  });

  it("still rejects an ABN that fails the ATO checksum", async () => {
    const res = await PUT(makeReq({ businessABN: "53004085617" }));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("ignores business fields for a non-admin team member", async () => {
    userFindUnique.mockResolvedValue({ role: "USER" });
    const res = await PUT(
      makeReq({ name: "Tech One", businessName: "Not Mine Pty Ltd" }),
    );
    expect(res.status).toBe(200);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ name: "Tech One" });
  });
});
