import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/capture-token", () => ({ verifyCaptureToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    captureToken: { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => ops),
  },
}));

import { verifyCaptureToken } from "@/lib/capture-token";
import { applyRateLimit } from "@/lib/rate-limiter";
import { verifyBotId } from "@/lib/auth/botid";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mVerify = verifyCaptureToken as unknown as ReturnType<typeof vi.fn>;
const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const mBot = verifyBotId as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  captureToken: { update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null); // not limited
  mBot.mockResolvedValue({ ok: true });
  mVerify.mockResolvedValue({ inspectionId: "insp_1", captureTokenId: "ct_1" });
  p.claimSketch.findFirst.mockResolvedValue(null);
  p.claimSketch.create.mockResolvedValue({ id: "cs_1" });
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/capture/tok/sketch", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ token: "tok" }) };

describe("POST /api/capture/[token]/sketch", () => {
  it("404 on an invalid/expired/revoked token", async () => {
    mVerify.mockResolvedValueOnce(null);
    const res = await POST(post({ sketchData: {} }), params);
    expect(res.status).toBe(404);
    expect(p.claimSketch.create).not.toHaveBeenCalled();
  });

  it("writes to the quarantine sidecar (pendingHomeownerCapture), NOT sketchData", async () => {
    const res = await POST(post({ sketchData: { objects: [] } }), params);
    expect(res.status).toBe(200);
    const data = p.claimSketch.create.mock.calls[0][0].data;
    expect(data.pendingHomeownerCapture).toBeTruthy();
    expect(data.sketchData).toBeUndefined(); // never the authoritative field
    expect(data.inspectionId).toBe("insp_1"); // from token, not body
    expect(p.captureToken.update).toHaveBeenCalledWith({
      where: { id: "ct_1" },
      data: { submittedAt: expect.any(Date) },
    });
  });

  it("ignores a client-supplied inspectionId (no IDOR)", async () => {
    await POST(post({ inspectionId: "evil", sketchData: {} }), params);
    const data = p.claimSketch.create.mock.calls[0][0].data;
    expect(data.inspectionId).toBe("insp_1");
  });

  it("413 when sketchData exceeds the size cap", async () => {
    const huge = { blob: "x".repeat(520 * 1024) };
    const res = await POST(post({ sketchData: huge }), params);
    expect(res.status).toBe(413);
  });

  it("413 when too many moisture points", async () => {
    const res = await POST(
      post({ sketchData: {}, moisturePoints: new Array(201).fill({}) }),
      params,
    );
    expect(res.status).toBe(413);
  });

  it("413 when moisture points are within count but too heavy (sec M1)", async () => {
    // 50 points (< 200) each carrying a big blob → over the byte cap.
    const heavy = new Array(50).fill({ note: "x".repeat(6 * 1024) });
    const res = await POST(
      post({ sketchData: {}, moisturePoints: heavy }),
      params,
    );
    expect(res.status).toBe(413);
    expect(p.claimSketch.create).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    mRate.mockResolvedValueOnce(
      new Response(null, { status: 429 }) as unknown as Response,
    );
    const res = await POST(post({ sketchData: {} }), params);
    expect(res.status).toBe(429);
    expect(mVerify).not.toHaveBeenCalled(); // short-circuits before token work
  });

  it("403 when BotID flags the request", async () => {
    mBot.mockResolvedValueOnce({ ok: false, reason: "Bot detected" });
    const res = await POST(post({ sketchData: {} }), params);
    expect(res.status).toBe(403);
  });

  it("422 on malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/capture/tok/sketch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req, params);
    expect(res.status).toBe(422);
  });
});
