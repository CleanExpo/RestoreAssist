import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock botid/server before importing the module under test. vi.hoisted keeps
// the mock fn reference accessible to the test body while still allowing the
// vi.mock() factory to be hoisted to the top of the file.
const { checkBotIdMock } = vi.hoisted(() => ({ checkBotIdMock: vi.fn() }));
vi.mock("botid/server", () => ({
  checkBotId: checkBotIdMock,
}));

import { verifyBotId } from "../botid";

describe("verifyBotId", () => {
  beforeEach(() => {
    checkBotIdMock.mockReset();
  });

  it("soft-allows when BotID reports bypassed=true (dev / preview)", async () => {
    checkBotIdMock.mockResolvedValue({
      isHuman: true,
      isBot: false,
      isVerifiedBot: false,
      bypassed: true,
    });
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true, disabled: true });
  });

  it("rejects when BotID reports isBot=true", async () => {
    checkBotIdMock.mockResolvedValue({
      isHuman: false,
      isBot: true,
      isVerifiedBot: false,
      bypassed: false,
    });
    const result = await verifyBotId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Bot detected");
  });

  it("accepts when BotID reports isBot=false", async () => {
    checkBotIdMock.mockResolvedValue({
      isHuman: true,
      isBot: false,
      isVerifiedBot: false,
      bypassed: false,
    });
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true });
  });

  it("fails-closed when checkBotId throws", async () => {
    checkBotIdMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await verifyBotId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ECONNREFUSED");
  });
});
