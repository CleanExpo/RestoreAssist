import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
  // The route also requires a platform support operator (added on main after
  // these tests were written). These tests cover the probe, so let the admin
  // through; the operator gate has its own tests in lib/__tests__/admin-auth.test.ts.
  verifyPlatformSupportOperator: (auth: unknown) => auth,
}));

import { GET } from "../route";

const ORIGINAL_BASE = process.env.HERMES_BASE_URL;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  getServerSession.mockResolvedValue({ user: { email: "admin@example.com" } });
  verifyAdminFromDb.mockResolvedValue({ response: null });
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.HERMES_BASE_URL;
  else process.env.HERMES_BASE_URL = ORIGINAL_BASE;
});

describe("GET /api/margot/health", () => {
  it("refuses a non-admin caller", async () => {
    const denied = Response.json({ error: "forbidden" }, { status: 403 });
    verifyAdminFromDb.mockResolvedValue({ response: denied });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("fails closed when HERMES_BASE_URL is unconfigured", async () => {
    delete process.env.HERMES_BASE_URL;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = await (await GET()).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.stale).toBe(true);
    expect(body.data.online).toBe(false);
    expect(body.data.lastHeartbeat).toBeNull();
    expect(body.data.reason).toContain("HERMES_BASE_URL");
  });

  it("reports online on a successful probe", async () => {
    process.env.HERMES_BASE_URL = "https://hermes.example.com/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ uptime: 42, version: "1.2.3" }),
    );
    const body = await (await GET()).json();
    expect(body.stale).toBe(false);
    expect(body.data.online).toBe(true);
    expect(body.data.stale).toBe(false);
    expect(body.data.uptime).toBe(42);
    expect(body.data.version).toBe("1.2.3");
    expect(typeof body.data.lastHeartbeat).toBe("string");
  });

  it("strips a trailing slash and probes /healthz", async () => {
    process.env.HERMES_BASE_URL = "https://hermes.example.com/";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));
    await GET();
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://hermes.example.com/healthz",
    );
  });

  it("never claims reachable when the configured URL answers HTTP 503", async () => {
    process.env.HERMES_BASE_URL = "https://hermes.example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ uptime: 999, version: "spoofed" }, false, 503),
    );
    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    expect(body.data.stale).toBe(true);
    expect(body.data.online).toBe(false);
    expect(body.data.lastHeartbeat).toBeNull();
    expect(body.data.reason).toContain("503");
    expect(body.data.uptime).toBeUndefined();
    expect(body.data.version).toBeUndefined();
  });

  it("fails closed when the probe times out", async () => {
    process.env.HERMES_BASE_URL = "https://hermes.example.com";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("The operation timed out."), {
        name: "TimeoutError",
      }),
    );
    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    expect(body.data.online).toBe(false);
    expect(body.data.lastHeartbeat).toBeNull();
    expect(body.data.reason).toContain("unreachable");
  });

  it("bounds the probe with a timeout signal", async () => {
    process.env.HERMES_BASE_URL = "https://hermes.example.com";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}));
    await GET();
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
