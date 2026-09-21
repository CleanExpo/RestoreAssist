import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  REPORT_GEN_PLATFORM_NOT_READY_BODY,
  reportGenByokRequiredBody,
} from "@/lib/signup-pricing-honesty";

const getWorkspaceForUser = vi.fn();
const getProviderApiKey = vi.fn();
const tryPlatformTrialApiKey = vi.fn();
const describePlatformTrialCoverage = vi.fn();

vi.mock("../../workspace/provider-connections", () => ({
  getWorkspaceForUser: (...args: unknown[]) => getWorkspaceForUser(...args),
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
}));

vi.mock("../platform-trial-credential", () => ({
  tryPlatformTrialApiKey: (...args: unknown[]) => tryPlatformTrialApiKey(...args),
  describePlatformTrialCoverage: (...args: unknown[]) =>
    describePlatformTrialCoverage(...args),
}));

import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "../resolve-workspace-ai-key";

const PAID_COVERAGE = {
  fundedTrial: false,
  platformKeyPresent: true,
  canUsePlatformTrial: false,
};

const FUNDED_MISSING_PLATFORM = {
  fundedTrial: true,
  platformKeyPresent: false,
  canUsePlatformTrial: false,
};

beforeEach(() => {
  getWorkspaceForUser.mockReset();
  getProviderApiKey.mockReset();
  tryPlatformTrialApiKey.mockReset();
  describePlatformTrialCoverage.mockReset();
  tryPlatformTrialApiKey.mockResolvedValue(null);
  describePlatformTrialCoverage.mockResolvedValue(PAID_COVERAGE);
});

describe("resolveWorkspaceAiKey (RA-6921 P0)", () => {
  it("resolves the workspace's own BYOK key", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Acme" });
    getProviderApiKey.mockResolvedValue("sk-client-owned");

    const result = await resolveWorkspaceAiKey("user_1", "OPENAI");

    expect(result).toEqual({ workspaceId: "ws_1", apiKey: "sk-client-owned" });
    expect(getProviderApiKey).toHaveBeenCalledWith("ws_1", "OPENAI");
  });

  it("throws NoWorkspaceKeyError when the user has no workspace", async () => {
    getWorkspaceForUser.mockResolvedValue(null);

    await expect(resolveWorkspaceAiKey("user_1", "OPENAI")).rejects.toBeInstanceOf(
      NoWorkspaceKeyError,
    );
    expect(getProviderApiKey).not.toHaveBeenCalled();
  });

  it("throws NoWorkspaceKeyError when the workspace has no active key for the provider", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Acme" });
    getProviderApiKey.mockResolvedValue(null);

    await expect(resolveWorkspaceAiKey("user_1", "ANTHROPIC")).rejects.toBeInstanceOf(
      NoWorkspaceKeyError,
    );
  });

  it("never falls back to a platform env var key on failure", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Acme" });
    getProviderApiKey.mockResolvedValue(null);
    process.env.OPENAI_API_KEY = "sk-platform-should-never-be-used";

    await expect(resolveWorkspaceAiKey("user_1", "OPENAI")).rejects.toThrow(
      /No active OPENAI API key configured/,
    );

    delete process.env.OPENAI_API_KEY;
  });

  it("RA-6801: funded trial without BYOK receives the platform Anthropic key", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Trial Co" });
    getProviderApiKey.mockResolvedValue(null);
    tryPlatformTrialApiKey.mockResolvedValue("sk-ant-platform-trial");

    const result = await resolveWorkspaceAiKey("trial_user", "ANTHROPIC");

    expect(result).toEqual({
      workspaceId: "ws_1",
      apiKey: "sk-ant-platform-trial",
    });
    expect(tryPlatformTrialApiKey).toHaveBeenCalledWith("trial_user", "ANTHROPIC");
  });

  it("RA-6801: non-trial without BYOK still throws even if a platform env key exists", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Paid Co" });
    getProviderApiKey.mockResolvedValue(null);
    tryPlatformTrialApiKey.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = "sk-ant-must-not-leak";

    await expect(
      resolveWorkspaceAiKey("paid_user", "ANTHROPIC"),
    ).rejects.toBeInstanceOf(NoWorkspaceKeyError);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it("RA-7600: paid / expired / zero-credit 402 still tells the owner to add their key", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Paid Co" });
    getProviderApiKey.mockResolvedValue(null);

    await expect(resolveWorkspaceAiKey("paid_user", "ANTHROPIC")).rejects.toMatchObject({
      name: "NoWorkspaceKeyError",
      reason: "BYOK_REQUIRED",
      message: reportGenByokRequiredBody("ANTHROPIC"),
    });
  });

  it("RA-7600: funded trial with a missing platform key is platform-not-ready, not add-your-key", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Trial Co" });
    getProviderApiKey.mockResolvedValue(null);
    describePlatformTrialCoverage.mockResolvedValue(FUNDED_MISSING_PLATFORM);

    try {
      await resolveWorkspaceAiKey("trial_user", "ANTHROPIC");
      throw new Error("expected NoWorkspaceKeyError");
    } catch (err) {
      expect(err).toBeInstanceOf(NoWorkspaceKeyError);
      const miss = err as NoWorkspaceKeyError;
      expect(miss.reason).toBe("PLATFORM_NOT_READY");
      expect(miss.message).toBe(REPORT_GEN_PLATFORM_NOT_READY_BODY);
      expect(miss.message).not.toMatch(/add your/i);
    }
  });

  it("RA-7600: same platform-not-ready copy when the funded trial has no workspace yet", async () => {
    getWorkspaceForUser.mockResolvedValue(null);
    describePlatformTrialCoverage.mockResolvedValue(FUNDED_MISSING_PLATFORM);

    await expect(resolveWorkspaceAiKey("trial_user", "ANTHROPIC")).rejects.toMatchObject({
      reason: "PLATFORM_NOT_READY",
      message: REPORT_GEN_PLATFORM_NOT_READY_BODY,
    });
    expect(getProviderApiKey).not.toHaveBeenCalled();
  });
});
