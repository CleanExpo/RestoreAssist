import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { groupReadings } from "../group-readings";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleReadings = [
  {
    id: "r1",
    location: "Master Bed wall",
    surfaceType: "drywall",
    moistureLevel: 22,
    depth: "surface",
  },
  {
    id: "r2",
    location: "Master Bedroom floor",
    surfaceType: "carpet",
    moistureLevel: 18,
    depth: "surface",
  },
  {
    id: "r3",
    location: "Kitchen",
    surfaceType: "tile",
    moistureLevel: 12,
    depth: "surface",
  },
];

const samplePayload = { readings: sampleReadings };

describe("groupReadings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with parsed groups on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              groups: [
                { name: "Master Bedroom", readingIds: ["r1", "r2"] },
                { name: "Kitchen", readingIds: ["r3"] },
              ],
              unsortedReadingIds: [],
            }),
          },
        ],
      } as never,
    });

    const r = await groupReadings({
      userId: "user-1",
      apiKey: "sk-ant-test",
      payload: samplePayload,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.groups).toHaveLength(2);
      expect(r.data.groups[0].name).toBe("Master Bedroom");
      expect(r.data.groups[0].readingIds).toEqual(["r1", "r2"]);
      expect(r.data.groups[0].averageMoisture).toBeCloseTo(20, 2);
      expect(r.data.groups[0].elevatedCount).toBe(2);
      expect(r.data.unsortedReadingIds).toEqual([]);
    }
    // RA-6960 (BYOK) — the caller-supplied key is threaded to the gateway as the
    // override, so this customer workload never spends the platform key.
    expect(vi.mocked(callAnthropic)).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-ant-test" }),
    );
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await groupReadings({
      userId: "user-1",
      apiKey: "sk-ant-test",
      payload: samplePayload,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("tolerates model output wrapped in ```json fences", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [
          {
            type: "text",
            text:
              "```json\n" +
              JSON.stringify({
                groups: [{ name: "Kitchen", readingIds: ["r3"] }],
                unsortedReadingIds: ["r1", "r2"],
              }) +
              "\n```",
          },
        ],
      } as never,
    });
    const r = await groupReadings({
      userId: "user-1",
      apiKey: "sk-ant-test",
      payload: samplePayload,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.groups).toHaveLength(1);
      expect(r.data.groups[0].name).toBe("Kitchen");
      expect(r.data.unsortedReadingIds.sort()).toEqual(["r1", "r2"]);
    }
  });

  it("returns PARSE_FAILED when text block isn't valid JSON", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "I cannot group these readings." }],
      } as never,
    });
    const r = await groupReadings({
      userId: "user-1",
      apiKey: "sk-ant-test",
      payload: samplePayload,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});
