import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ upsert: vi.fn(), updateMany: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../prisma", () => ({prisma: { providerConnection: {upsert: m.upsert, updateMany: m.updateMany}}}));
vi.mock("../../credential-vault", () => ({encrypt: m.encrypt, decrypt: m.decrypt}));
import { disableProviderConnection, upsertProviderConnection } from "../provider-connections";
beforeEach(() => { vi.resetAllMocks(); });
describe("explicit provider disable intent", () => {
  it("creates a credential-free authoritative tombstone even when no canonical row exists", async () => {
    await disableProviderConnection("synthetic_workspace", "ANTHROPIC");
    expect(m.upsert).toHaveBeenCalledWith({
      where: {workspaceId_provider: {workspaceId: "synthetic_workspace", provider: "ANTHROPIC"}},
      create: {workspaceId: "synthetic_workspace", provider: "ANTHROPIC", status: "DISABLED", encryptedCredentials: "", lastError: "Disabled by user."},
      update: {status: "DISABLED", lastError: "Disabled by user."},
      select: {id: true},
    });
    expect(m.encrypt).not.toHaveBeenCalled(); expect(m.decrypt).not.toHaveBeenCalled();
  });
  it("keeps a saved encrypted credential and scopes the disable to one workspace/provider", async () => {
    let row = {id: "existing", workspaceId: "synthetic_workspace", provider: "OPENAI", status: "ACTIVE", encryptedCredentials: "synthetic-ciphertext", lastError: null};
    m.upsert.mockImplementation(async input => { row = {...row, ...input.update}; return {id: row.id}; });
    await disableProviderConnection("synthetic_workspace", "OPENAI");
    expect(row).toMatchObject({status: "DISABLED", encryptedCredentials: "synthetic-ciphertext", lastError: "Disabled by user."});
    expect(m.upsert.mock.calls[0][0].where).toEqual({workspaceId_provider: {workspaceId: "synthetic_workspace", provider: "OPENAI"}});
  });
  it("an explicit replacement key clears disabled intent and validation history", async () => {
    m.encrypt.mockReturnValue("synthetic-encrypted-replacement");
    m.decrypt.mockReturnValue(JSON.stringify({apiKey: "sk-synthetic-key-only"}));
    m.upsert.mockResolvedValue({id: "canonical", workspaceId: "synthetic_workspace", provider: "OPENAI", status: "ACTIVE", encryptedCredentials: "synthetic-encrypted-replacement", lastValidatedAt: null, lastError: null, createdAt: new Date(0), updatedAt: new Date(0)});
    await upsertProviderConnection({workspaceId: "synthetic_workspace", provider: "OPENAI", plaintextApiKey: "sk-synthetic-key-only"});
    expect(m.upsert.mock.calls[0][0].update).toMatchObject({status: "ACTIVE", lastError: null, lastValidatedAt: null});
  });
});
