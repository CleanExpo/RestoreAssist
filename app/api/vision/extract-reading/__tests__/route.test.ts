import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const extractMeterReading = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));
vi.mock("@/lib/services/ai/extract-reading", () => ({
  extractMeterReading: (...args: unknown[]) => extractMeterReading(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  extractMeterReading.mockReset();
  resolveWorkspaceAiKey.mockReset();

  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: "user_1",
    subscriptionStatus: "ACTIVE",
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/vision/extract-reading", {
    method: "POST",
    body: JSON.stringify({
      image: "aGVsbG8=",
      mediaType: "image/jpeg",
    }),
  });
}

// ── Fixture: a real photo-substitute of a moisture meter display ─────────────
// lib/vision/__tests__/fixtures/moisture-meter-18-5.png is a 320x200 PNG of a
// meter LCD reading "18.5%" on the WME scale. It is a genuine image file, not
// an inline string, so this exercises the same base64 length / charset / size
// guards a phone photo hits on the way into the route.
const FIXTURE_PATH = join(
  process.cwd(),
  "lib/vision/__tests__/fixtures/moisture-meter-18-5.png",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);
const FIXTURE_BASE64 = FIXTURE_BYTES.toString("base64");

function fixturePostRequest() {
  return new NextRequest("http://localhost/api/vision/extract-reading", {
    method: "POST",
    body: JSON.stringify({
      image: FIXTURE_BASE64,
      mediaType: "image/png",
    }),
  });
}

describe("POST /api/vision/extract-reading — meter photo fixture", () => {
  it("the fixture on disk is a real PNG", () => {
    // Guards the guard: if the fixture were ever replaced by a text placeholder
    // the happy-path test below would still pass while proving nothing.
    expect(FIXTURE_BYTES.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(FIXTURE_BYTES.length).toBeGreaterThan(200);
  });

  it("passes the photo through the BYOK key to the extractor and returns the reading", async () => {
    extractMeterReading.mockResolvedValueOnce({
      ok: true,
      data: {
        brand: "protimeter",
        readingValue: 18.5,
        readingUnit: "WME",
        displayText: "18.5% WME",
        confidence: "high",
      },
    });

    const response = await POST(fixturePostRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reading).toEqual({
      brand: "protimeter",
      readingValue: 18.5,
      readingUnit: "WME",
      displayText: "18.5% WME",
      confidence: "high",
    });

    // The bytes that reached the extractor must be the fixture's own bytes,
    // and they must be spent on the WORKSPACE key, never a platform env key.
    expect(extractMeterReading).toHaveBeenCalledWith({
      apiKey: "anthropic-key",
      image: FIXTURE_BASE64,
      mediaType: "image/png",
    });
    expect(resolveWorkspaceAiKey).toHaveBeenCalledWith("user_1", "ANTHROPIC");
    expect(
      Buffer.from(extractMeterReading.mock.calls[0][0].image, "base64"),
    ).toEqual(FIXTURE_BYTES);
  });

  it("returns 422 when the model cannot read the display", async () => {
    extractMeterReading.mockResolvedValueOnce({
      ok: false,
      reason: "NO_READING_DETECTED",
      detail: "display glare",
    });

    const response = await POST(fixturePostRequest());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "NO_READING_DETECTED" });
  });
});

describe("POST /api/vision/extract-reading", () => {
  it("does not expose configured key details when no workspace key is configured", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ error: "KEY_MISSING" });
  });

  it("does not expose provider failure details", async () => {
    extractMeterReading.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });
});
