import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const ascoraIntegrationUpsert = vi.fn();
const encrypt = vi.fn((v: string) => `encrypted:${v}`);

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/credential-vault", () => ({
  encrypt: (...args: unknown[]) => encrypt(...(args as [string])),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ascoraIntegration: {
      upsert: (...args: unknown[]) => ascoraIntegrationUpsert(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ascora/connect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  ascoraIntegrationUpsert.mockReset();
  encrypt.mockClear();
  vi.unstubAllGlobals();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  ascoraIntegrationUpsert.mockResolvedValue({ id: "integration_1" });
});

describe("POST /api/ascora/connect — SSRF guard on baseUrl", () => {
  it("rejects a private-IP baseUrl without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({ apiKey: "k", baseUrl: "https://10.0.0.5" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/ascora\.com\.au/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ascoraIntegrationUpsert).not.toHaveBeenCalled();
  });

  it("rejects a cloud metadata baseUrl (169.254.169.254) without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({
        apiKey: "k",
        baseUrl: "https://169.254.169.254/latest/meta-data/",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an off-allowlist host even when https", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({ apiKey: "k", baseUrl: "https://evil.example.com" }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-https scheme against the allowlisted host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({ apiKey: "k", baseUrl: "http://api.ascora.com.au" }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an upstream redirect response as an invalid key (does not follow it)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      type: "default",
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(postRequest({ apiKey: "k" }));
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.ascora.com.au"),
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION");
    expect(ascoraIntegrationUpsert).not.toHaveBeenCalled();
  });

  it("accepts a valid allowlisted https baseUrl and saves the encrypted key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({ apiKey: "real-key", baseUrl: "https://api.ascora.com.au" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ascoraIntegrationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          apiKey: "encrypted:real-key",
          baseUrl: "https://api.ascora.com.au",
        }),
      }),
    );
  });
});
