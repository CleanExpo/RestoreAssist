/**
 * RA-6968 — carpet-restoration route now wraps every handler in try/catch.
 *
 * Before: a malformed JSON body threw out of req.json() and Next.js returned a
 * bare framework 500; a Prisma error leaked its message. After: malformed input
 * is a clean 400 and unexpected errors return a generic 500 with no leak.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@/lib/prisma-helpers", () => ({
  softDelete: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn(), update: vi.fn() },
    carpetRestorationAssessment: { upsert: vi.fn(), delete: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockResolveWrite = resolveInspectionWrite as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.carpetRestorationAssessment.upsert as ReturnType<
  typeof vi.fn
>;
const mockInspectionUpdate = prisma.inspection.update as ReturnType<
  typeof vi.fn
>;

function makeRequest(rawBody: string) {
  return new NextRequest(
    "http://localhost/api/inspections/insp-1/carpet-restoration",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    },
  );
}

const params = { params: Promise.resolve({ id: "insp-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user-1" } });
  mockResolveWrite.mockResolvedValue({
    ok: true,
    data: { inspectionWhere: { id: "insp-1" }, childInspectionFilter: null },
  });
  mockUpsert.mockResolvedValue({ id: "carpet-1", inspectionId: "insp-1" });
  mockInspectionUpdate.mockResolvedValue({ id: "insp-1" });
});

describe("POST /api/inspections/[id]/carpet-restoration", () => {
  it("malformed JSON body → 400 VALIDATION, not a framework 500", async () => {
    const res = await POST(makeRequest("{ this is not json"), params);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.message).toBe("Invalid JSON body");
    // No DB write should have been attempted for an unparseable body.
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("valid body → 200 and upserts the assessment", async () => {
    const res = await POST(
      makeRequest(JSON.stringify({ fiberType: "WOOL" })),
      params,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("carpet-1");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("unexpected Prisma error → generic 500 with no error.message leak", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("secret db connection detail"));

    const res = await POST(
      makeRequest(JSON.stringify({ fiberType: "NYLON" })),
      params,
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.message).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("secret db connection detail");
  });
});
