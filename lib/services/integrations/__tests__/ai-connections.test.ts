import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  owned: vi.fn(),
  membership: vi.fn(),
  decrypt: vi.fn(() => { throw new Error("Metadata must never decrypt credentials"); }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerConnection: { findMany: mocks.findMany },
    workspace: { findFirst: mocks.owned },
    workspaceMember: { findFirst: mocks.membership },
  },
}));
vi.mock("@/lib/credential-vault", () => ({ decrypt: mocks.decrypt, encrypt: vi.fn() }));

import { listConfiguredAiConnections } from "../ai-connections";

const date = new Date("2026-01-01T00:00:00Z");
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, workspaceId: "workspace-a", provider: "ANTHROPIC", status: "DISABLED",
  encryptedCredentials: "", lastValidatedAt: null, lastError: null,
  createdAt: date, updatedAt: date, createdByMemberId: "provisioned-owner-member",
  ...overrides,
});

// Execute the small Prisma filter subset used by this read against synthetic
// rows, so a missing workspace or placeholder guard changes observable output.
type Fixture = ReturnType<typeof row>;
function matches(record: Fixture, condition: Record<string, unknown>): boolean {
  return Object.entries(condition).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((part) => matches(record, part));
    const actual = (record as Record<string, unknown>)[key];
    if (value && typeof value === "object" && "not" in value) return actual !== value.not;
    return actual === value;
  });
}
function fixtureRows(records: Fixture[]) {
  mocks.findMany.mockImplementation(async ({ where, select, take }) => records
    .filter((record) => matches(record, where))
    .slice(0, take)
    .map((record) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, (record as Record<string, unknown>)[key]]))));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owned.mockResolvedValue({ id: "workspace-a", name: "Synthetic workspace" });
  mocks.membership.mockResolvedValue(null);
  fixtureRows([]);
});

describe("configured AI connection metadata", () => {
  it("selects metadata only and never decrypts or returns credential fragments", async () => {
    fixtureRows([row("active", { status: "ACTIVE", encryptedCredentials: "synthetic-ciphertext", lastError: "private-error-metadata" })]);
    expect(await listConfiguredAiConnections("user-a")).toEqual({
      workspaceId: "workspace-a",
      connections: [{ id: "active", provider: "ANTHROPIC", status: "ACTIVE", lastValidatedAt: null, createdAt: date.toISOString(), updatedAt: date.toISOString() }],
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, provider: true, status: true, lastValidatedAt: true, createdAt: true, updatedAt: true },
      take: 6,
    }));
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("excludes provisioned placeholders even though they have a creating member", async () => {
    fixtureRows([row("placeholder")]);
    expect((await listConfiguredAiConnections("user-a")).connections).toEqual([]);
  });

  it("retains explicit disabled credentials, failed records and validation evidence", async () => {
    fixtureRows([
      row("disabled", { encryptedCredentials: "synthetic-encrypted-configured-key" }),
      row("failed", { status: "FAILED", provider: "OPENAI" }),
      row("validated", { lastValidatedAt: date, provider: "GOOGLE" }),
      row("error", { lastError: "synthetic error", provider: "OPENROUTER" }),
    ]);
    expect((await listConfiguredAiConnections("user-a")).connections.map(({ id }) => id)).toEqual(["disabled", "failed", "validated", "error"]);
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("cannot read a configured connection in another workspace", async () => {
    fixtureRows([
      row("mine", { status: "ACTIVE" }),
      row("foreign", { workspaceId: "workspace-b", status: "ACTIVE" }),
    ]);
    expect((await listConfiguredAiConnections("user-a")).connections.map(({ id }) => id)).toEqual(["mine"]);
    expect(mocks.owned).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "user-a", status: "READY" } }));
  });

  it("returns an empty result without querying connections when no authorised workspace exists", async () => {
    mocks.owned.mockResolvedValue(null);
    expect(await listConfiguredAiConnections("unrelated-user")).toEqual({ workspaceId: null, connections: [] });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("cannot select a foreign READY membership when the effective owner has no READY workspace", async () => {
    mocks.owned.mockResolvedValue(null);
    mocks.membership.mockResolvedValue({ workspace: { id: "workspace-a", name: "Foreign team", status: "READY" } });
    fixtureRows([row("foreign-key", { status: "ACTIVE" })]);
    expect(await listConfiguredAiConnections("org-owner")).toEqual({ workspaceId: null, connections: [] });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it("does not translate a read failure into an empty disconnected state", async () => {
    mocks.findMany.mockRejectedValue(new Error("synthetic database unavailable"));
    await expect(listConfiguredAiConnections("user-a")).rejects.toThrow("synthetic database unavailable");
  });
});
