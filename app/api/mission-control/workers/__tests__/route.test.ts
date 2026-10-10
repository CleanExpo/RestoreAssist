import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const verifyPlatformSupportOperator = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
  verifyPlatformSupportOperator: (...args: unknown[]) =>
    verifyPlatformSupportOperator(...args),
}));

import { GET } from "../route";

const ORIGINAL = process.env.MISSION_CONTROL_WORKERS;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  verifyPlatformSupportOperator.mockReset();
  getServerSession.mockResolvedValue({ user: { email: "admin@example.com" } });
  verifyAdminFromDb.mockResolvedValue({ response: null });
  vi.restoreAllMocks();
  // Default: the admin is also a platform support operator. Set after
  // restoreAllMocks so the implementation is not wiped.
  verifyPlatformSupportOperator.mockImplementation((auth: unknown) => auth);
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MISSION_CONTROL_WORKERS;
  else process.env.MISSION_CONTROL_WORKERS = ORIGINAL;
});

describe("GET /api/mission-control/workers", () => {
  it("refuses a non-admin caller", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("refuses a tenant admin who is not a platform support operator, probing nothing", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=https://mini.example";
    verifyPlatformSupportOperator.mockReturnValue({
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(verifyPlatformSupportOperator).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed and probes nothing when unconfigured", async () => {
    delete process.env.MISSION_CONTROL_WORKERS;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = await (await GET()).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.stale).toBe(true);
    expect(body.data.workers).toEqual([]);
    expect(body.reason).toContain("MISSION_CONTROL_WORKERS");
  });

  it("reports a healthy worker as online and fresh", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=https://mini.example.com/";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ uptime: 12, version: "9.9.9" }));
    const body = await (await GET()).json();
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://mini.example.com/healthz",
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body.stale).toBe(false);
    expect(body.data.workers).toHaveLength(1);
    expect(body.data.workers[0]).toMatchObject({
      name: "mini",
      online: true,
      stale: false,
      uptime: 12,
      version: "9.9.9",
    });
    expect(typeof body.data.workers[0].lastHeartbeat).toBe("string");
  });

  it("never claims reachable when a configured worker answers HTTP 500", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=https://mini.example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ uptime: 777, version: "spoofed" }, false, 500),
    );
    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    const worker = body.data.workers[0];
    expect(worker.online).toBe(false);
    expect(worker.stale).toBe(true);
    expect(worker.lastHeartbeat).toBeNull();
    expect(worker.reason).toContain("500");
    expect(worker.uptime).toBeUndefined();
    expect(worker.version).toBeUndefined();
  });

  it("fails closed when a worker probe times out", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=https://mini.example.com";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("The operation timed out."), {
        name: "TimeoutError",
      }),
    );
    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    expect(body.data.workers[0].online).toBe(false);
    expect(body.data.workers[0].lastHeartbeat).toBeNull();
    expect(body.data.workers[0].reason).toContain("unreachable");
  });

  it("does not let one dead worker hide a healthy one", async () => {
    process.env.MISSION_CONTROL_WORKERS =
      "mini=https://mini.example.com, hermes=https://hermes.example.com";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("mini")) throw new Error("down");
      return jsonResponse({ uptime: 1 });
    });
    const body = await (await GET()).json();
    expect(body.data.workers.map((w: { name: string }) => w.name)).toEqual([
      "mini",
      "hermes",
    ]);
    expect(body.data.workers[0].online).toBe(false);
    expect(body.data.workers[1].online).toBe(true);
    expect(body.stale).toBe(true);
  });

  it("marks a malformed entry offline instead of throwing", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=not-a-url";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = await (await GET()).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.stale).toBe(true);
    expect(body.data.workers[0]).toMatchObject({ name: "mini", online: false });
    expect(body.data.workers[0].reason).toContain("URL");
  });

  it("rejects a non-http scheme", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=file:///etc/passwd";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = await (await GET()).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.data.workers[0].online).toBe(false);
    expect(body.data.workers[0].reason).toContain("URL");
  });

  it("fails closed when every configured entry is unparsable", async () => {
    process.env.MISSION_CONTROL_WORKERS = "   ,  ";
    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    expect(body.data.workers).toEqual([]);
    expect(body.reason).toContain("MISSION_CONTROL_WORKERS");
  });

  it("never echoes an upstream error message", async () => {
    process.env.MISSION_CONTROL_WORKERS = "mini=https://mini.example.com";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.4:8080"),
    );
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("10.0.0.4");
  });
});
