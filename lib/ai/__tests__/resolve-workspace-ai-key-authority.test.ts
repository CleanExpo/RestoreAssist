import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(), workspace: vi.fn(), member: vi.fn(), metadata: vi.fn(), credential: vi.fn(),
  trial: vi.fn(), coverage: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workspace: { findFirst: mocks.workspace }, workspaceMember: { findFirst: mocks.member },
  providerConnection: { findMany: mocks.metadata, findUnique: mocks.credential },
} }));
vi.mock("@/lib/organization-credits", () => ({ getOrganizationOwner: mocks.owner }));
vi.mock("../platform-trial-credential", () => ({ tryPlatformTrialApiKey: mocks.trial, describePlatformTrialCoverage: mocks.coverage }));

import { NoWorkspaceKeyError, resolveWorkspaceAiKey } from "../resolve-workspace-ai-key";
import { encrypt } from "@/lib/credential-vault";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "synthetic-workspace-authority-test");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Provider calls forbidden"); }));
  mocks.owner.mockResolvedValue("organisation-owner");
  mocks.workspace.mockResolvedValue({ id: "owner-workspace", name: "Synthetic" });
  mocks.member.mockResolvedValue(null);
  mocks.metadata.mockResolvedValue([]);
  mocks.credential.mockResolvedValue(null);
  mocks.trial.mockResolvedValue("sk-ant-synthetic-trial");
  mocks.coverage.mockResolvedValue({ fundedTrial: true, platformKeyPresent: true, canUsePlatformTrial: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function row(status: string, key: string | null, lastError: string | null = null, provider = "ANTHROPIC") {
  const record = {
    id: "connection-a", provider, status, encryptedCredentials: key === null ? "" : encrypt(JSON.stringify({ apiKey: key })),
    lastError, lastValidatedAt: null, createdAt: new Date("2026-01-01Z"), updatedAt: new Date("2026-01-01Z"),
  };
  mocks.metadata.mockImplementation(async ({ where }) => {
    const configured = where.OR.some((clause: Record<string, { not: unknown }>) =>
      Object.entries(clause).every(([field, filter]) => (record as Record<string, unknown>)[field] !== filter.not),
    );
    return configured ? [record] : [];
  });
  mocks.credential.mockImplementation(async ({ where }) => where.workspaceId_provider.provider === provider ? record : null);
  return record;
}

describe("workspace provider authority over platform fallback", () => {
  it.each(["DISABLED", "FAILED"])("does not use platform credentials after configured %s", async (status) => {
    row(status, "sk-ant-synthetic-byok");
    await expect(resolveWorkspaceAiKey("team-member", "ANTHROPIC")).rejects.toBeInstanceOf(NoWorkspaceKeyError);
    expect(mocks.trial).not.toHaveBeenCalled();
    expect(mocks.credential).not.toHaveBeenCalled();
  });

  it("honours the deliberate disconnect tombstone even with empty ciphertext", async () => {
    row("DISABLED", null, "Disabled by user.");
    await expect(resolveWorkspaceAiKey("team-member", "ANTHROPIC")).rejects.toBeInstanceOf(NoWorkspaceKeyError);
    expect(mocks.trial).not.toHaveBeenCalled();
  });

  it.each(["unreadable", "empty", "wrong-vendor"])("blocks platform fallback for an ACTIVE %s key", async (kind) => {
    const record = row("ACTIVE", kind === "empty" ? "" : kind === "wrong-vendor" ? "sk-proj-synthetic-wrong" : "sk-ant-synthetic-byok");
    if (kind === "unreadable") record.encryptedCredentials = "synthetic-invalid-ciphertext";
    await expect(resolveWorkspaceAiKey("team-member", "ANTHROPIC")).rejects.toBeInstanceOf(NoWorkspaceKeyError);
    expect(mocks.trial).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when a connection is disabled after metadata was read", async () => {
    const record = row("ACTIVE", "sk-ant-synthetic-byok");
    mocks.credential.mockImplementation(async () => ({ ...record, status: "DISABLED" }));
    await expect(resolveWorkspaceAiKey("team-member", "ANTHROPIC")).rejects.toBeInstanceOf(NoWorkspaceKeyError);
    expect(mocks.trial).not.toHaveBeenCalled();
  });

  it("uses the organisation owner's authorised workspace and BYOK key", async () => {
    row("ACTIVE", "sk-ant-synthetic-byok");
    expect(await resolveWorkspaceAiKey("team-member", "ANTHROPIC")).toEqual({ workspaceId: "owner-workspace", apiKey: "sk-ant-synthetic-byok" });
    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "organisation-owner", status: "READY" } }));
    expect(mocks.credential).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId_provider: { workspaceId: "owner-workspace", provider: "ANTHROPIC" } } }));
    expect(mocks.trial).not.toHaveBeenCalled();
  });

  it("retains intended trial fallback for an untouched empty DISABLED placeholder", async () => {
    row("DISABLED", null);
    expect(await resolveWorkspaceAiKey("team-member", "ANTHROPIC")).toEqual({ workspaceId: "owner-workspace", apiKey: "sk-ant-synthetic-trial" });
    expect(mocks.trial).toHaveBeenCalledWith("organisation-owner", "ANTHROPIC");
  });

  it("a disabled different provider does not suppress an absent provider's trial fallback", async () => {
    row("DISABLED", null, "Disabled by user.", "OPENAI");
    expect(await resolveWorkspaceAiKey("team-member", "ANTHROPIC")).toMatchObject({ apiKey: "sk-ant-synthetic-trial" });
  });

  it("does not turn a metadata failure into platform fallback", async () => {
    mocks.metadata.mockRejectedValue(new Error("synthetic metadata failure"));
    await expect(resolveWorkspaceAiKey("team-member", "ANTHROPIC")).rejects.toThrow("synthetic metadata failure");
    expect(mocks.trial).not.toHaveBeenCalled();
  });
});
