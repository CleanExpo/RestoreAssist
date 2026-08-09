import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { POST } from "../route";

function request(host = "localhost") {
  return new NextRequest(`http://${host}/api/test/owner-acceptance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "inspect-draft",
      inspectionId: "synthetic-inspection",
    }),
  });
}

describe("POST /api/test/owner-acceptance guard", () => {
  beforeEach(() => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "true");
    vi.stubEnv("ALLOW_LOCAL_ACCEPTANCE_FIXTURES", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ALLOW_TEST_HELPERS_IN_PROD_ENV", "");
    getServerSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 when the general test-helper opt-in is disabled", async () => {
    vi.stubEnv("ALLOW_TEST_HELPERS", "");

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("returns 404 in Vercel production without the second opt-in", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-local host even when both feature flags allow it", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_TEST_HELPERS_IN_PROD_ENV", "true");

    const response = await POST(request("preview.example.test"));

    expect(response.status).toBe(404);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("still requires an authenticated owner on an explicitly enabled local host", async () => {
    getServerSession.mockResolvedValue(null);

    const response = await POST(request("127.0.0.1"));

    expect(response.status).toBe(401);
    expect(getServerSession).toHaveBeenCalledOnce();
  });
});
