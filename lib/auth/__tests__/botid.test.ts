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
  const originalSmokeSecret = process.env.SMOKE_TEST_BOT_BYPASS_SECRET;

  beforeEach(() => {
    checkBotIdMock.mockReset();
    headersGetMock.mockReset();
    // Default: no host header — every test sets the host it cares about.
    headersGetMock.mockReturnValue(null);
    delete process.env.VERCEL_ENV;
    // Default: no smoke bypass secret configured, so the RA-4987 bypass is
    // inert and cannot affect the existing BotID assertions below.
    delete process.env.SMOKE_TEST_BOT_BYPASS_SECRET;
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
    if (originalSmokeSecret === undefined) {
      delete process.env.SMOKE_TEST_BOT_BYPASS_SECRET;
    } else {
      process.env.SMOKE_TEST_BOT_BYPASS_SECRET = originalSmokeSecret;
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

  describe("RA-4987 — prod smoke-token bypass", () => {
    const SECRET = "s".repeat(32);

    // Route header lookups by key: the smoke-token header returns `token`,
    // everything else (e.g. host) returns "restoreassist.app" (production).
    const withHeaders = (token: string | null) => {
      headersGetMock.mockImplementation((key: string) =>
        key === "x-smoke-test-token" ? token : "restoreassist.app",
      );
    };

    it("bypasses on prod when x-smoke-test-token matches the secret", async () => {
      process.env.VERCEL_ENV = "production";
      process.env.SMOKE_TEST_BOT_BYPASS_SECRET = SECRET;
      withHeaders(SECRET);
      const result = await verifyBotId();
      expect(result).toEqual({ ok: true, disabled: true });
      expect(checkBotIdMock).not.toHaveBeenCalled();
    });

    it("falls through to BotID when the token is wrong", async () => {
      process.env.VERCEL_ENV = "production";
      process.env.SMOKE_TEST_BOT_BYPASS_SECRET = SECRET;
      withHeaders("wrong-token");
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

    it("falls through to BotID when no token header is present", async () => {
      process.env.VERCEL_ENV = "production";
      process.env.SMOKE_TEST_BOT_BYPASS_SECRET = SECRET;
      withHeaders(null);
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

    it("fail-closed: no bypass is possible when the secret env var is unset", async () => {
      process.env.VERCEL_ENV = "production";
      delete process.env.SMOKE_TEST_BOT_BYPASS_SECRET;
      // Even a caller sending a header cannot bypass — there is no secret to
      // match against, so the real BotID signal is checked.
      withHeaders("any-token");
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
  });
});
