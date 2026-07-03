import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const userCreate = vi.fn();
const userUpdate = vi.fn();
const orgCreate = vi.fn();
const inviteCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    organization: { create: (...a: unknown[]) => orgCreate(...a) },
    userInvite: { create: (...a: unknown[]) => inviteCreate(...a) },
  },
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/seed-org-with-manager", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userCreate.mockReset();
  userUpdate.mockReset();
  orgCreate.mockReset();
  inviteCreate.mockReset();
  userCreate.mockResolvedValue({ id: "mgr_1" });
  orgCreate.mockResolvedValue({ id: "org_1" });
  userUpdate.mockResolvedValue({ id: "mgr_1" });
  inviteCreate.mockResolvedValue({ id: "inv_1" });
});

describe("POST /api/test/seed-org-with-manager", () => {
  it("returns 404 when ALLOW_TEST_HELPERS is not 'true'", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");
    vi.resetModules();
    const { POST } = await import("../seed-org-with-manager/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("RA-6940: returns 404 in production even when ALLOW_TEST_HELPERS=true", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { POST } = await import("../seed-org-with-manager/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(404);
    expect(userCreate).not.toHaveBeenCalled();
    expect(orgCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 200 happy path when ALLOW_TEST_HELPERS=true", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.resetModules();
    const { POST } = await import("../seed-org-with-manager/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; inviteeEmail: string };
    expect(json.token).toMatch(/^[0-9a-f]{48}$/);
    expect(json.inviteeEmail).toMatch(/^tech-.+@test\.local$/);

    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(orgCreate).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(inviteCreate).toHaveBeenCalledTimes(1);

    const inviteArgs = inviteCreate.mock.calls[0][0] as {
      data: { usedAt: Date | null; expiresAt: Date };
    };
    expect(inviteArgs.data.usedAt).toBeNull();
    expect(inviteArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    vi.unstubAllEnvs();
  });

  it("honours markUsed=true (sets usedAt)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.resetModules();
    const { POST } = await import("../seed-org-with-manager/route");
    await POST(makeReq({ markUsed: true }));
    const inviteArgs = inviteCreate.mock.calls[0][0] as {
      data: { usedAt: Date | null };
    };
    expect(inviteArgs.data.usedAt).toBeInstanceOf(Date);
    vi.unstubAllEnvs();
  });

  it("honours negative expiresInDays (expired invite)", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.resetModules();
    const { POST } = await import("../seed-org-with-manager/route");
    await POST(makeReq({ expiresInDays: -1 }));
    const inviteArgs = inviteCreate.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    expect(inviteArgs.data.expiresAt.getTime()).toBeLessThan(Date.now());
    vi.unstubAllEnvs();
  });
});
