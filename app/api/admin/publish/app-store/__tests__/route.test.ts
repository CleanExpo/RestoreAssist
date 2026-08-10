import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const verifyStorePublishingOperator = vi.hoisted(() => vi.fn());
const importPKCS8 = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
  verifyStorePublishingOperator: (...args: unknown[]) =>
    verifyStorePublishingOperator(...args),
}));
vi.mock("jose", () => ({
  SignJWT: class MockSignJWT {
    setProtectedHeader() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setAudience() {
      return this;
    }
    async sign() {
      return "asc-token";
    }
  },
  importPKCS8: (...args: unknown[]) => importPKCS8(...args),
}));

import { POST } from "../route";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/publish/app-store", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  verifyStorePublishingOperator.mockReset();
  importPKCS8.mockReset();
  fetchMock.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "operator_1" } });
  verifyAdminFromDb.mockResolvedValue({
    user: { id: "operator_1", role: "ADMIN", organizationId: "org_1" },
  });
  verifyStorePublishingOperator.mockImplementation((auth) => auth);
  importPKCS8.mockResolvedValue({});
  vi.stubEnv(
    "ASC_PRIVATE_KEY_BASE64",
    Buffer.from("private-key").toString("base64"),
  );
  vi.stubEnv("ASC_API_KEY_ID", "key_1");
  vi.stubEnv("ASC_ISSUER_ID", "issuer_1");
  vi.stubGlobal("fetch", fetchMock);
});

describe("App Store publishing authorization", () => {
  it("returns the operator guard response before signing or fetching", async () => {
    verifyStorePublishingOperator.mockReturnValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(post({ action: "status" }));

    expect(response.status).toBe(403);
    expect(verifyAdminFromDb).toHaveBeenCalledTimes(1);
    expect(importPKCS8).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an app ID outside the fixed RestoreAssist bundle", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "app_restoreassist",
            attributes: { bundleId: "com.restoreassist.app" },
          },
        ],
      }),
    );

    const response = await POST(
      post({ action: "submit_review", appId: "app_foreign" }),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "filter%5BbundleId%5D=com.restoreassist.app",
    );
  });

  it("submits only an app returned for the fixed RestoreAssist bundle", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "app_restoreassist",
              attributes: { bundleId: "com.restoreassist.app" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "version_1" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "submission_1" } }));

    const response = await POST(
      post({ action: "submit_review", appId: "app_restoreassist" }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/apps/app_restoreassist/appStoreVersions",
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "/appStoreVersionSubmissions",
    );
  });
});
