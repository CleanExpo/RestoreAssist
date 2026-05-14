import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionUpsert = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { upsert: (...a: unknown[]) => inspectionUpsert(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/seed-inspection", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionUpsert.mockReset();
});

describe("POST /api/test/seed-inspection", () => {
  it("returns 404 when ALLOW_TEST_HELPERS is not 'true'", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../seed-inspection/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("returns 200 happy path with default id + status COMPLETED", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValueOnce({ id: "test-inspection" });

    vi.resetModules();
    const { POST } = await import("../seed-inspection/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inspectionId: "test-inspection" });

    expect(inspectionUpsert).toHaveBeenCalledWith({
      where: { id: "test-inspection" },
      create: expect.objectContaining({
        id: "test-inspection",
        inspectionNumber: "TEST-test-inspection",
        status: "COMPLETED",
        userId: "u_test",
        propertyAddress: expect.any(String),
        propertyPostcode: expect.any(String),
      }),
      update: { status: "COMPLETED" },
      select: { id: true },
    });
    vi.unstubAllEnvs();
  });

  it("uses custom inspectionId when provided", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValueOnce({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValueOnce({ id: "custom-id" });
    vi.resetModules();
    const { POST } = await import("../seed-inspection/route");
    const res = await POST(makeReq({ inspectionId: "custom-id" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inspectionId: "custom-id" });
    expect(inspectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "custom-id" },
        create: expect.objectContaining({
          id: "custom-id",
          inspectionNumber: "TEST-custom-id",
        }),
      }),
    );
    vi.unstubAllEnvs();
  });

  it("is idempotent — second call upserts the same id (update branch)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    getServerSession.mockResolvedValue({ user: { id: "u_test" } });
    inspectionUpsert.mockResolvedValue({ id: "test-inspection" });

    vi.resetModules();
    const { POST } = await import("../seed-inspection/route");
    const first = await POST(makeReq({}));
    const second = await POST(makeReq({}));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(inspectionUpsert).toHaveBeenCalledTimes(2);
    // Both calls hit the same upsert key — guarantees the spec can re-run.
    expect(inspectionUpsert.mock.calls[0][0]).toEqual(
      inspectionUpsert.mock.calls[1][0],
    );
    vi.unstubAllEnvs();
  });
});
