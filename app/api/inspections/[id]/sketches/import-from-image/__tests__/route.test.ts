import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const getWorkspaceForUser = vi.fn();
const checkWorkspaceBudget = vi.fn();
const importSketchFromImage = vi.fn();
const logAiUsage = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => getWorkspaceForUser(...a),
}));

vi.mock("@/lib/ai/budget-guard", () => ({
  checkWorkspaceBudget: (...a: unknown[]) => checkWorkspaceBudget(...a),
}));

vi.mock("@/lib/usage/log-usage", () => ({
  estimateCostUsd: () => 0.01,
  logAiUsage: (...a: unknown[]) => logAiUsage(...a),
}));

vi.mock("@/lib/services/ai/import-sketch-from-image", () => ({
  importSketchFromImage: (...a: unknown[]) => importSketchFromImage(...a),
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));

function makeRequest(bytes: Uint8Array, type = "image/jpeg"): NextRequest {
  const form = new FormData();
  form.append("file", new File([bytes], "sketch.jpg", { type }));

  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/sketches/import-from-image",
    {
      method: "POST",
      body: form,
    },
  );
}

function ctx() {
  return { params: Promise.resolve({ id: "inspection_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset().mockResolvedValue({
    user: { id: "user_1" },
  });
  userFindUnique.mockReset().mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  inspectionFindFirst.mockReset().mockResolvedValue({ id: "inspection_1" });
  getWorkspaceForUser.mockReset().mockResolvedValue(null);
  checkWorkspaceBudget.mockReset().mockResolvedValue({ ok: true });
  importSketchFromImage.mockReset();
  logAiUsage.mockReset();
  applyRateLimit.mockReset().mockResolvedValue(null);
});

describe("POST /api/inspections/[id]/sketches/import-from-image", () => {
  it("uses the shared per-user rate limiter before parsing the upload", async () => {
    applyRateLimit.mockResolvedValueOnce(
      Response.json({ error: "Too many requests" }, { status: 429 }),
    );
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

    const res = await POST(makeRequest(bytes, "image/jpeg"), ctx());

    expect(res.status).toBe(429);
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
        prefix: "sketch-import",
        key: "user_1",
      }),
    );
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });

  it("rejects spoofed JPEG content before calling Vision", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x00]);

    const res = await POST(makeRequest(bytes, "image/jpeg"), ctx());
    const body = await res.json();

    expect(res.status).toBe(400);
    // RA-1548: unified error envelope — { error: { code, message, eventId } }.
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe("Unsupported file type — use JPEG or PNG");
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });

  // Rule 5 — subscription gate before rate-limit spend and the Vision call.
  it.each(["CANCELED", "PAST_DUE"])(
    "returns 402 with no Vision call for %s subscriptions",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

      const res = await POST(makeRequest(bytes, "image/jpeg"), ctx());
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      expect(applyRateLimit).not.toHaveBeenCalled();
      expect(importSketchFromImage).not.toHaveBeenCalled();
    },
  );
});
