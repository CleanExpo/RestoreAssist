import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));

import { getServerSession } from "next-auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const tenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const context = { params: Promise.resolve({ id: "inspection-1" }) };

function request(): NextRequest {
  const form = new FormData();
  form.set("floorNumber", "0");
  form.set(
    "file",
    new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
      "floor.png",
      { type: "image/png" },
    ),
  );
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/sketches/render",
    { method: "POST", body: form },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "user-1" } });
  tenancy.mockResolvedValue({ ok: true });
});

describe("server sketch render upload", () => {
  it("rejects foreign-inspection writes before storage", async () => {
    tenancy.mockResolvedValueOnce({ ok: false, status: 404, reason: "Not found" });
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
  });

  it("retires arbitrary client PNG bytes even for an authorised inspection", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.objectContaining({ code: "FEATURE_UNAVAILABLE" }),
    });
  });
});
