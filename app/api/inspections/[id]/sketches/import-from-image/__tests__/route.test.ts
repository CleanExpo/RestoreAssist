import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import {
  genuineImage,
  makeJpeg,
  makeJpegWithoutScan,
  makeTruncatedScanJpeg,
  makePng,
  makePngWithGarbageIdat,
  makePngWithoutIdat,
  makeWebp,
  makeWebpCanvasOnly,
} from "@/lib/media/__tests__/image-fixtures";

const truncatedScanJpeg = new Uint8Array(await makeTruncatedScanJpeg());

const genuine = {
  png: new Uint8Array(await genuineImage("png", 40, 30)),
  jpeg: new Uint8Array(await genuineImage("jpeg", 40, 30)),
  webp: new Uint8Array(await genuineImage("webp", 40, 30)),
};

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const getWorkspaceForUser = vi.fn();
const checkWorkspaceBudget = vi.fn();
const importSketchFromImage = vi.fn();
const logAiUsage = vi.fn();
const applyRateLimit = vi.fn();
const claimSketchFindFirst = vi.fn();
const claimSketchUpdate = vi.fn();
const claimSketchCreate = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    claimSketch: {
      findFirst: (...a: unknown[]) => claimSketchFindFirst(...a),
      update: (...a: unknown[]) => claimSketchUpdate(...a),
      create: (...a: unknown[]) => claimSketchCreate(...a),
    },
  },
}));

vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
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
  userFindUnique
    .mockReset()
    .mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  inspectionFindFirst.mockReset().mockResolvedValue({ id: "inspection_1" });
  getWorkspaceForUser.mockReset().mockResolvedValue(null);
  checkWorkspaceBudget.mockReset().mockResolvedValue({ ok: true });
  importSketchFromImage.mockReset();
  logAiUsage.mockReset();
  applyRateLimit.mockReset().mockResolvedValue(null);
  claimSketchFindFirst.mockReset().mockResolvedValue(null);
  claimSketchUpdate.mockReset();
  claimSketchCreate.mockReset().mockResolvedValue({ id: "s_new" });
  resolveWorkspaceAiKey.mockReset().mockResolvedValue({ apiKey: "sk-test" });
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
      userFindUnique.mockResolvedValue({ subscriptionStatus: status });
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

      const res = await POST(makeRequest(bytes, "image/jpeg"), ctx());
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      expect(applyRateLimit).not.toHaveBeenCalled();
      expect(importSketchFromImage).not.toHaveBeenCalled();
    },
  );

  it("RA-7617: returns server-issued room ids and remembers them on the floor sketch", async () => {
    importSketchFromImage.mockResolvedValueOnce({
      ok: true,
      data: {
        rooms: [
          {
            label: "Lounge",
            vertices: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
              { x: 0, y: 1 },
            ],
          },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
        reader: { vendor: "anthropic", model: "claude-sonnet-4-6" },
      },
    });
    claimSketchFindFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { objects: [] },
    });
    claimSketchUpdate.mockResolvedValueOnce({ id: "s_1" });

    const bytes = genuine.jpeg;
    const form = new FormData();
    form.append(
      "file",
      new File([bytes], "sketch.jpg", { type: "image/jpeg" }),
    );
    form.append("floorNumber", "2");
    const req = new NextRequest(
      "http://localhost/api/inspections/inspection_1/sketches/import-from-image",
      { method: "POST", body: form },
    );

    const res = await POST(req, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].id).toMatch(/^ai-suggested-/);
    expect(body.rooms[0].label).toBe("Lounge");
    expect(claimSketchUpdate).toHaveBeenCalledTimes(1);
    const saved = claimSketchUpdate.mock.calls[0][0].data.sketchData;
    expect(saved.raSketchMeta.aiSuggestedRoomIds).toEqual([body.rooms[0].id]);
    expect(claimSketchFindFirst.mock.calls[0][0].where.floorNumber).toBe(2);
  });

  // RA-8232 — abliteration.ai backup reader, flag-gated and off by default.
  describe("backup reader (RA-8232)", () => {
    const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("passes no backup to the reader when the flag is off", async () => {
      vi.stubEnv("SKETCH_IMPORT_ABLITERATION_FALLBACK", "");
      vi.stubEnv("ABLITERATION_API_KEY", "ak-platform");
      importSketchFromImage.mockResolvedValueOnce({ ok: false, reason: "API_ERROR" });

      const res = await POST(makeRequest(jpeg()), ctx());

      expect(res.status).toBe(500);
      expect(importSketchFromImage.mock.calls[0][0].fallback).toBeNull();
    });

    it("passes the platform backup key when the flag and key are set", async () => {
      vi.stubEnv("SKETCH_IMPORT_ABLITERATION_FALLBACK", "1");
      vi.stubEnv("ABLITERATION_API_KEY", "ak-platform");
      importSketchFromImage.mockResolvedValueOnce({ ok: false, reason: "API_ERROR" });

      await POST(makeRequest(jpeg()), ctx());

      expect(importSketchFromImage.mock.calls[0][0].fallback).toEqual({
        apiKey: "ak-platform",
      });
      expect(importSketchFromImage.mock.calls[0][0].apiKey).toBe("sk-test");
    });

    it("never reaches the backup when the workspace has no Anthropic key (402)", async () => {
      vi.stubEnv("SKETCH_IMPORT_ABLITERATION_FALLBACK", "1");
      vi.stubEnv("ABLITERATION_API_KEY", "ak-platform");
      const { NoWorkspaceKeyError } = await import(
        "@/lib/ai/resolve-workspace-ai-key"
      );
      resolveWorkspaceAiKey.mockRejectedValueOnce(new NoWorkspaceKeyError());

      const res = await POST(makeRequest(jpeg()), ctx());

      expect(res.status).toBe(402);
      expect(importSketchFromImage).not.toHaveBeenCalled();
    });

    it("a backup read returns ai-suggested rooms and logs only the primary failure under ANTHROPIC", async () => {
      getWorkspaceForUser.mockResolvedValue({ id: "ws_1" });
      importSketchFromImage.mockResolvedValueOnce({
        ok: true,
        data: {
          rooms: [{ label: "Kitchen", vertices: square }],
          usage: { inputTokens: 2000, outputTokens: 500 },
          reader: { vendor: "abliteration", model: "abliterated-model-large-flash" },
          primaryFailure: { reason: "MODEL_OVERLOADED", detail: "529" },
        },
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const res = await POST(makeRequest(jpeg()), ctx());
      await new Promise((r) => setImmediate(r));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rooms).toHaveLength(1);
      expect(body.rooms[0].id).toMatch(/^ai-suggested-/);
      expect(body.rooms[0].label).toBe("Kitchen");
      // The new floor sketch remembers the ids, so a first save cannot claim
      // operator_measured — same zero-quantity path as a primary read.
      const created = claimSketchCreate.mock.calls[0][0].data;
      expect(created.sketchData.raSketchMeta.aiSuggestedRoomIds).toEqual([
        body.rooms[0].id,
      ]);

      // Primary failure is logged honestly; the backup spend is NOT written
      // under the ANTHROPIC provider (there is no ABLITERATION enum value yet).
      expect(logAiUsage).toHaveBeenCalledTimes(1);
      expect(logAiUsage.mock.calls[0][0]).toMatchObject({
        provider: "ANTHROPIC",
        success: false,
        errorType: "MODEL_OVERLOADED",
      });
      // The backup spend is visible in the server log instead.
      const line = warn.mock.calls.find((c) =>
        String(c[0]).includes("[InspectionsSketchImport]"),
      );
      expect(line?.[1]).toMatchObject({
        reader: "abliteration",
        model: "abliterated-model-large-flash",
        primaryReason: "MODEL_OVERLOADED",
        inputTokens: 2000,
        outputTokens: 500,
      });
      expect(line?.[1].estimatedCostUsd).toBeCloseTo(0.003, 6);
      warn.mockRestore();
    });
  });

  describe("RA-8234 strict upload policy", () => {
    const rejected: [string, () => Uint8Array, string][] = [
      [
        "HTML renamed .jpg",
        () => new TextEncoder().encode("<html><body>x</body></html>"),
        "image/jpeg",
      ],
      [
        "bare JPEG magic spoof",
        () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "image/jpeg",
      ],
      [
        "truncated PNG",
        () => new Uint8Array(makePng(10, 10).subarray(0, 40)),
        "image/png",
      ],
      [
        "pixel bomb PNG",
        () => new Uint8Array(makePng(100_000, 100_000)),
        "image/png",
      ],
      [
        "PNG with no IDAT (terminated, undecodable)",
        () => new Uint8Array(makePngWithoutIdat()),
        "image/png",
      ],
      [
        "PNG with garbage IDAT",
        () => new Uint8Array(makePngWithGarbageIdat()),
        "image/png",
      ],
      [
        "JPEG with one-byte truncated scan",
        () => truncatedScanJpeg,
        "image/jpeg",
      ],
      [
        "JPEG with no scan",
        () => new Uint8Array(makeJpegWithoutScan()),
        "image/jpeg",
      ],
      [
        "WebP canvas only (no image chunk)",
        () => new Uint8Array(makeWebpCanvasOnly()),
        "image/webp",
      ],
      [
        "declared PNG but JPEG bytes",
        () => new Uint8Array(makeJpeg()),
        "image/png",
      ],
      [
        "WebP (not accepted by the extractor)",
        () => new Uint8Array(makeWebp()),
        "image/webp",
      ],
    ];
    it.each(rejected)(
      "rejects %s: no key lookup, no extractor call, no write",
      async (_n, bytes, type) => {
        const res = await POST(makeRequest(bytes(), type), ctx());
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("VALIDATION");
        expect(importSketchFromImage).not.toHaveBeenCalled();
        expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
        expect(claimSketchCreate).not.toHaveBeenCalled();
        expect(claimSketchUpdate).not.toHaveBeenCalled();
      },
    );

    it("rejects more than 10 MB of actual bytes", async () => {
      const big = new Uint8Array(10 * 1024 * 1024 + 1);
      big.set(makePng());
      const res = await POST(makeRequest(big, "image/png"), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/10 MB/);
      expect(importSketchFromImage).not.toHaveBeenCalled();
      expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    });

    it.each([
      ["image/png", () => genuine.png],
      ["image/jpeg", () => genuine.jpeg],
    ])(
      "still passes a genuine %s to the extractor with the canonical type",
      async (type, make) => {
        importSketchFromImage.mockResolvedValueOnce({
          ok: true,
          data: { rooms: [], usage: { inputTokens: 1, outputTokens: 1 } },
        });
        const res = await POST(makeRequest(make(), type), ctx());
        expect(res.status).toBe(200);
        expect(importSketchFromImage).toHaveBeenCalledWith(
          expect.objectContaining({ mediaType: type }),
        );
      },
    );

    it("tenant B: a foreign inspection is 404 even for a valid file, with no extractor, key or write", async () => {
      inspectionFindFirst.mockResolvedValue(null);
      const res = await POST(makeRequest(genuine.png, "image/png"), ctx());
      expect(res.status).toBe(404);
      expect(inspectionFindFirst.mock.calls[0][0].where).toEqual({
        id: "inspection_1",
        userId: "user_1",
      });
      expect(importSketchFromImage).not.toHaveBeenCalled();
      expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
      expect(claimSketchCreate).not.toHaveBeenCalled();
    });
  });
});
