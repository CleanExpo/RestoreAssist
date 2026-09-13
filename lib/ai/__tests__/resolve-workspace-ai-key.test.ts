import { describe, it, expect, vi, beforeEach } from "vitest";

const getWorkspaceForUser = vi.fn();
const getProviderApiKey = vi.fn();
const tryPlatformTrialApiKey = vi.fn();

vi.mock("../../workspace/provider-connections", () => ({
  getWorkspaceForUser: (...args: unknown[]) => getWorkspaceForUser(...args),
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
}));

vi.mock("../platform-trial-credential", () => ({
  tryPlatformTrialApiKey: (...args: unknown[]) => tryPlatformTrialApiKey(...args),
}));

import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "../resolve-workspace-ai-key";

beforeEach(() => {
  getWorkspaceForUser.mockReset();
  getProviderApiKey.mockReset();
  tryPlatformTrialApiKey.mockReset();
  tryPlatformTrialApiKey.mockResolvedValue(null);
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
});
