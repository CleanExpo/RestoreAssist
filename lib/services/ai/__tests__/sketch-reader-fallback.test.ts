/**
 * RA-8232 — abliteration.ai as a flag-gated BACKUP floor plan image reader.
 *
 * The backup runs only when the flag is on, a platform key is set, and the
 * primary (workspace Anthropic) read failed for an availability or output
 * reason. It never runs for key problems: KEY_MISSING would make the backup a
 * free primary for every workspace without its own key (RA-6921), and
 * KEY_INVALID would hide a broken workspace key from its owner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { importSketchFromImage } from "../import-sketch-from-image";
import {
  ABLITERATION_BASE_URL,
  ABLITERATION_VISION_MODEL,
  estimateAbliterationCostUsd,
  resolveSketchReaderFallback,
} from "../sketch-reader-fallback";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const ROOMS_JSON = JSON.stringify({
  rooms: [
    {
      label: "Bedroom 1",
      vertices: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 0, y: 0.5 },
      ],
    },
  ],
});

function okMessage(text: string, input = 900, output = 120) {
  return {
    ok: true as const,
    data: {
      id: "msg_x",
      usage: { input_tokens: input, output_tokens: output },
      content: [{ type: "text", text }],
    } as never,
  };
}

function failed(reason: string, retryAfterMs?: number) {
  return {
    ok: false as const,
    reason: reason as never,
    detail: `${reason} detail`,
    ...(retryAfterMs != null ? { retryAfterMs } : {}),
  };
}

const baseArgs = {
  apiKey: "sk-workspace",
  base64Image: "iVBORw0KGgo",
  mediaType: "image/png" as const,
};
const withBackup = { ...baseArgs, fallback: { apiKey: "ak-platform" } };

describe("resolveSketchReaderFallback (flag + key)", () => {
  it("is off when nothing is set", () => {
    expect(resolveSketchReaderFallback({})).toBeNull();
  });

  it("is off when the flag is on but the key is missing or blank", () => {
    expect(
      resolveSketchReaderFallback({ SKETCH_IMPORT_ABLITERATION_FALLBACK: "1" }),
    ).toBeNull();
    expect(
      resolveSketchReaderFallback({
        SKETCH_IMPORT_ABLITERATION_FALLBACK: "1",
        ABLITERATION_API_KEY: "   ",
      }),
    ).toBeNull();
  });

  it("is off when the key is set but the flag is not truthy", () => {
    for (const flag of [undefined, "", "0", "false", "off", "yes"]) {
      expect(
        resolveSketchReaderFallback({
          SKETCH_IMPORT_ABLITERATION_FALLBACK: flag,
          ABLITERATION_API_KEY: "ak-platform",
        }),
      ).toBeNull();
    }
  });

  it.each(["1", "true", "on", " TRUE "])(
    "is on for flag %j with a key, and trims the key",
    (flag) => {
      expect(
        resolveSketchReaderFallback({
          SKETCH_IMPORT_ABLITERATION_FALLBACK: flag,
          ABLITERATION_API_KEY: " ak-platform ",
        }),
      ).toEqual({ apiKey: "ak-platform" });
    },
  );
});

describe("importSketchFromImage backup reader", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("primary success: one call, no backup, reader is anthropic", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(okMessage(ROOMS_JSON));
    const r = await importSketchFromImage(withBackup);
    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callAnthropic).mock.calls[0][0].baseURL).toBeUndefined();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.reader).toEqual({
        vendor: "anthropic",
        model: "claude-sonnet-4-6",
      });
      expect(r.data.primaryFailure).toBeUndefined();
    }
  });

  it("flag off (no fallback passed): primary failure is returned, no backup call", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(
      failed("MODEL_OVERLOADED", 10000),
    );
    const r = await importSketchFromImage(baseArgs);
    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MODEL_OVERLOADED");
  });

  it.each(["RATE_LIMITED", "MODEL_OVERLOADED", "API_ERROR"])(
    "primary %s: backup reads the same image via abliteration.ai",
    async (reason) => {
      vi.mocked(callAnthropic)
        .mockResolvedValueOnce(failed(reason))
        .mockResolvedValueOnce(okMessage(ROOMS_JSON, 800, 100));

      const r = await importSketchFromImage(withBackup);

      expect(callAnthropic).toHaveBeenCalledTimes(2);
      const primary = vi.mocked(callAnthropic).mock.calls[0][0];
      const backup = vi.mocked(callAnthropic).mock.calls[1][0];
      expect(backup.apiKey).toBe("ak-platform");
      expect(backup.baseURL).toBe(ABLITERATION_BASE_URL);
      expect(backup.request.model).toBe(ABLITERATION_VISION_MODEL);
      // Same image and prompt as the primary read.
      expect(backup.request.messages).toEqual(primary.request.messages);

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.rooms).toHaveLength(1);
        expect(r.data.rooms[0].label).toBe("Bedroom 1");
        expect(r.data.usage).toEqual({ inputTokens: 800, outputTokens: 100 });
        expect(r.data.reader).toEqual({
          vendor: "abliteration",
          model: ABLITERATION_VISION_MODEL,
        });
        expect(r.data.primaryFailure).toEqual({
          reason,
          detail: `${reason} detail`,
        });
      }
    },
  );

  it("primary PARSE_FAILED (unreadable output): backup is used", async () => {
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce(okMessage("I cannot read this sketch, sorry."))
      .mockResolvedValueOnce(okMessage(ROOMS_JSON));
    const r = await importSketchFromImage(withBackup);
    expect(callAnthropic).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.reader.vendor).toBe("abliteration");
      expect(r.data.primaryFailure?.reason).toBe("PARSE_FAILED");
    }
  });

  it.each(["KEY_INVALID", "KEY_MISSING"])(
    "primary %s: no backup call, the key problem is returned",
    async (reason) => {
      vi.mocked(callAnthropic).mockResolvedValueOnce(failed(reason));
      const r = await importSketchFromImage(withBackup);
      expect(callAnthropic).toHaveBeenCalledTimes(1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(reason);
    },
  );

  it("both fail: primary reason and retry hint are returned, backup reason is in the detail", async () => {
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce(failed("RATE_LIMITED", 30000))
      .mockResolvedValueOnce(failed("API_ERROR"));
    const r = await importSketchFromImage(withBackup);
    expect(callAnthropic).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
      expect(r.detail).toContain(
        "backup reader (abliteration) failed: API_ERROR",
      );
    }
  });

  it("backup returns unreadable output: primary reason is returned", async () => {
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce(failed("MODEL_OVERLOADED", 10000))
      .mockResolvedValueOnce(okMessage("not json"));
    const r = await importSketchFromImage(withBackup);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.detail).toContain("PARSE_FAILED");
    }
  });
});

describe("estimateAbliterationCostUsd", () => {
  it("prices abliterated-model-large-flash at USD 1.00 in / 2.00 out per million", () => {
    expect(estimateAbliterationCostUsd(1_000_000, 0)).toBeCloseTo(1.0, 6);
    expect(estimateAbliterationCostUsd(0, 1_000_000)).toBeCloseTo(2.0, 6);
    expect(estimateAbliterationCostUsd(2000, 500)).toBeCloseTo(0.003, 6);
  });
});
