import { describe, it, expect, vi, beforeEach } from "vitest";

const getWorkspaceForUser = vi.fn();
const getProviderApiKey = vi.fn();

vi.mock("../../workspace/provider-connections", () => ({
  getWorkspaceForUser: (...args: unknown[]) => getWorkspaceForUser(...args),
  getProviderApiKey: (...args: unknown[]) => getProviderApiKey(...args),
}));

import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "../resolve-workspace-ai-key";

beforeEach(() => {
  getWorkspaceForUser.mockReset();
  getProviderApiKey.mockReset();
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
});
