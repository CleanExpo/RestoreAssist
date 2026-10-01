import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacy: vi.fn(),
  connections: vi.fn(),
  credential: vi.fn(),
  ownedWorkspace: vi.fn(),
  membership: vi.fn(),
  owner: vi.fn(),
}));

vi.mock("../prisma", () => ({
  prisma: {
    integration: { findMany: mocks.legacy },
    providerConnection: { findMany: mocks.connections, findUnique: mocks.credential },
    workspace: { findFirst: mocks.ownedWorkspace },
    workspaceMember: { findFirst: mocks.membership },
  },
}));
vi.mock("../organization-credits", () => ({ getOrganizationOwner: mocks.owner }));

import { getAnthropicApiKey, getLatestAIIntegration } from "../ai-provider";
import { encrypt } from "../credential-vault";

const canonical = (provider = "ANTHROPIC", status = "ACTIVE") => ({
  id: `canonical-${provider}`,
  provider,
  status,
  lastValidatedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "synthetic-canonical-test-key-only");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-synthetic-platform");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in credential resolution tests"); }));
  mocks.owner.mockResolvedValue("owner-a");
  mocks.ownedWorkspace.mockResolvedValue({ id: "workspace-a", name: "Synthetic workspace" });
  mocks.membership.mockResolvedValue(null);
  mocks.connections.mockResolvedValue([]);
  mocks.credential.mockResolvedValue(null);
  mocks.legacy.mockResolvedValue([{ id: "legacy-a", name: "Anthropic Claude", apiKey: "sk-ant-synthetic-legacy" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function storedKey(apiKey: string, extra: Record<string, string> = {}) {
  mocks.credential.mockResolvedValue({
    status: "ACTIVE",
    encryptedCredentials: encrypt(JSON.stringify({ apiKey, ...extra })),
  });
}

describe("canonical AI credentials precede legacy integrations", () => {
  it("reads the organisation owner's canonical workspace and never consults a stale legacy key", async () => {
    mocks.connections.mockResolvedValue([canonical()]);
    storedKey("sk-ant-synthetic-canonical");
    expect(await getLatestAIIntegration("technician-a")).toEqual({
      id: "canonical-ANTHROPIC", name: "Anthropic Claude", provider: "anthropic", apiKey: "sk-ant-synthetic-canonical",
    });
    expect(mocks.owner).toHaveBeenCalledWith("technician-a");
    expect(mocks.ownedWorkspace).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "owner-a", status: "READY" } }));
    expect(mocks.connections).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "workspace-a" }) }));
    expect(mocks.credential).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId_provider: { workspaceId: "workspace-a", provider: "ANTHROPIC" } } }));
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["ANTHROPIC", "sk-ant-synthetic-key", "anthropic"],
    ["OPENAI", "sk-proj-synthetic-key", "openai"],
    ["GOOGLE", "AIzaSyntheticKey", "gemini"],
    ["OPENROUTER", "sk-or-synthetic-key", "openrouter"],
  ])("resolves configured %s with its typed provider", async (provider, key, expected) => {
    mocks.connections.mockResolvedValue([canonical(provider)]);
    storedKey(key, { model: "synthetic/model" });
    expect(await getLatestAIIntegration("owner-a")).toMatchObject({ id: `canonical-${provider}`, apiKey: key, provider: expected });
    if (provider === "OPENROUTER") expect((await getLatestAIIntegration("owner-a"))?.model).toBe("synthetic/model");
  });

  it.each(["DISABLED", "FAILED"])("%s canonical credentials cannot reactivate a legacy key or platform fallback", async (status) => {
    mocks.connections.mockResolvedValue([canonical("ANTHROPIC", status)]);
    expect(await getLatestAIIntegration("owner-a")).toBeNull();
    await expect(getAnthropicApiKey("owner-a")).rejects.toThrow(/configured Anthropic connection/i);
    expect(mocks.credential).not.toHaveBeenCalled();
  });

  it.each(["broken-ciphertext", "cross-provider", "empty-key"])("fails closed for %s without using stale legacy or platform credentials", async (failure) => {
    mocks.connections.mockResolvedValue([canonical()]);
    if (failure === "broken-ciphertext") {
      mocks.credential.mockResolvedValue({ status: "ACTIVE", encryptedCredentials: "synthetic-invalid-ciphertext" });
    } else storedKey(failure === "cross-provider" ? "sk-proj-synthetic-wrong-vendor" : "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getLatestAIIntegration("owner-a")).toBeNull();
    await expect(getAnthropicApiKey("owner-a")).rejects.toThrow(/configured Anthropic connection/i);
  });

  it("a concurrent disable before credential read cannot resurrect the legacy key", async () => {
    mocks.connections.mockResolvedValue([canonical()]);
    mocks.credential.mockResolvedValue({ status: "DISABLED", encryptedCredentials: encrypt(JSON.stringify({ apiKey: "sk-ant-synthetic-disabled" })) });
    await expect(getAnthropicApiKey("owner-a")).rejects.toThrow(/configured Anthropic connection/i);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("suppresses only the configured provider, leaving another provider's legacy key usable", async () => {
    mocks.connections.mockResolvedValue([canonical("ANTHROPIC", "DISABLED")]);
    mocks.legacy.mockResolvedValue([
      { id: "legacy-a", name: "Anthropic Claude", apiKey: "sk-ant-synthetic-legacy" },
      { id: "legacy-b", name: "OpenAI GPT", apiKey: "sk-proj-synthetic-openai" },
    ]);
    expect(await getLatestAIIntegration("owner-a")).toMatchObject({ id: "legacy-b", provider: "openai" });
  });

  it("uses canonical Anthropic before the legacy and platform keys", async () => {
    mocks.connections.mockResolvedValue([canonical()]);
    storedKey("sk-ant-synthetic-canonical");
    expect(await getAnthropicApiKey("owner-a")).toBe("sk-ant-synthetic-canonical");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("retains legacy and platform fallback only when no configured canonical record exists", async () => {
    expect(await getAnthropicApiKey("owner-a")).toBe("sk-ant-synthetic-legacy");
    mocks.legacy.mockResolvedValue([]);
    expect(await getAnthropicApiKey("owner-a")).toBe("sk-ant-synthetic-platform");
  });

  it("does not hide canonical lookup failures behind stale credentials", async () => {
    mocks.connections.mockRejectedValue(new Error("synthetic database unavailable"));
    await expect(getLatestAIIntegration("owner-a")).rejects.toThrow("synthetic database unavailable");
    await expect(getAnthropicApiKey("owner-a")).rejects.toThrow("synthetic database unavailable");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
