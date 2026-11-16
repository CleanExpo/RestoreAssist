/**
 * RA-8388: the three tenancy refusals in the evidence route (GET, POST and
 * DELETE) answer in a plain `{ error }` shape, so they call `logRefusal`
 * directly. Each must leave one `[api-refusal]` line and keep its answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  readable: vi.fn(),
  capturable: vi.fn(),
  assignedWrite: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
  assertInspectionCaptureWrite: vi.fn(),
  assertInspectionReadable: mocks.readable,
  assertInspectionCapturable: mocks.capturable,
  assertInspectionAssignedWrite: mocks.assignedWrite,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DELETE, GET, POST } from "../route";

const ctx = { params: Promise.resolve({ id: "insp_1" }) };
const URL_BASE = "http://localhost/api/inspections/insp_1/evidence";

describe("evidence route tenancy refusals leave an [api-refusal] line", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getServerSession.mockResolvedValue({ user: { id: "u1" } });
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function refusalLines(): Record<string, unknown>[] {
    return warn.mock.calls
      .filter((call) => call[0] === "[api-refusal]")
      .map((call) => JSON.parse(String(call[1])));
  }

  it("GET refuses with 404 and logs TENANCY_REFUSED", async () => {
    mocks.readable.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const response = await GET(new NextRequest(`${URL_BASE}?token=never`), ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Inspection not found" });
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "TENANCY_REFUSED",
      status: 404,
      stage: "tenancy",
      route: "/api/inspections/insp_1/evidence",
    });
    expect(JSON.stringify(lines[0])).not.toContain("never");
  });

  it("POST refuses with 403 and logs TENANCY_REFUSED", async () => {
    mocks.capturable.mockResolvedValue({
      ok: false,
      status: 403,
      reason: "Forbidden",
    });

    const response = await POST(
      new NextRequest(URL_BASE, { method: "POST", body: "{}" }),
      ctx,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "TENANCY_REFUSED",
      status: 403,
      stage: "tenancy",
      route: "/api/inspections/insp_1/evidence",
    });
  });

  it("DELETE refuses with 404 and logs TENANCY_REFUSED", async () => {
    mocks.assignedWrite.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });

    const response = await DELETE(
      new NextRequest(URL_BASE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId: "ev_1" }),
      }),
      ctx,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Inspection not found" });
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "TENANCY_REFUSED",
      status: 404,
      stage: "tenancy",
      route: "/api/inspections/insp_1/evidence",
    });
  });
});
