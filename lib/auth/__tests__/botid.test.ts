import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock botid/server before importing the module under test. vi.hoisted keeps
// the mock fn reference accessible to the test body while still allowing the
// vi.mock() factory to be hoisted to the top of the file.
const { checkBotIdMock, headersGetMock } = vi.hoisted(() => ({
  checkBotIdMock: vi.fn(),
  headersGetMock: vi.fn(),
}));
vi.mock("botid/server", () => ({
  checkBotId: checkBotIdMock,
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headersGetMock }),
}));

import { verifyBotId } from "../botid";

describe("verifyBotId", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    checkBotIdMock.mockReset();
    headersGetMock.mockReset();
    // Default: no host header — every test sets the host it cares about.
    headersGetMock.mockReturnValue(null);
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  it("RA-4986 — soft-allows on VERCEL_ENV=preview without calling checkBotId (sandbox)", async () => {
    process.env.VERCEL_ENV = "preview";
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true, disabled: true });
    expect(checkBotIdMock).not.toHaveBeenCalled();
  });

  it("RA-4986 — does NOT soft-allow on VERCEL_ENV=production (real bot signal still checked)", async () => {
    process.env.VERCEL_ENV = "production";
    headersGetMock.mockReturnValue("restoreassist.app");
    checkBotIdMock.mockResolvedValue({
      isHuman: false,
      isBot: true,
      isVerifiedBot: false,
      bypassed: false,
    });
    const result = await verifyBotId();
    expect(result.ok).toBe(false);
    expect(checkBotIdMock).toHaveBeenCalledOnce();
  });

  it("RA-4986 — soft-allows when host is restoreassist-sandbox.vercel.app (sandbox project)", async () => {
    process.env.VERCEL_ENV = "production";
    headersGetMock.mockReturnValue("restoreassist-sandbox.vercel.app");
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true, disabled: true });
    expect(checkBotIdMock).not.toHaveBeenCalled();
  });

  it("RA-4986 — host bypass is case-insensitive", async () => {
    process.env.VERCEL_ENV = "production";
    headersGetMock.mockReturnValue("RESTOREASSIST-SANDBOX.VERCEL.APP");
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true, disabled: true });
  });

  it("RA-4986 — falls through to BotID when host is restoreassist.app (production)", async () => {
    process.env.VERCEL_ENV = "production";
    headersGetMock.mockReturnValue("restoreassist.app");
    checkBotIdMock.mockResolvedValue({
      isHuman: true,
      isBot: false,
      isVerifiedBot: false,
      bypassed: false,
    });
    const result = await verifyBotId();
    expect(result).toEqual({ ok: true });
    expect(checkBotIdMock).toHaveBeenCalledOnce();
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
