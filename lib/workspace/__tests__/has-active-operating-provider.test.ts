import { describe, it, expect, vi, beforeEach } from "vitest";

// RA-6801: presence check that bridges onboarding/status to the new BYOK store.
// Mock prisma so we exercise the workspace resolution + the ACTIVE/operating
// filter without a real database or any network probe.

const workspaceFindFirst = vi.fn();
const workspaceMemberFindFirst = vi.fn();
const providerConnectionCount = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    workspace: {
      findFirst: (...args: unknown[]) => workspaceFindFirst(...args),
    },
    workspaceMember: {
      findFirst: (...args: unknown[]) => workspaceMemberFindFirst(...args),
    },
    providerConnection: {
      count: (...args: unknown[]) => providerConnectionCount(...args),
    },
  },
}));
vi.mock("../../credential-vault", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { hasActiveOperatingProviderConnection } from "../provider-connections";

beforeEach(() => {
  workspaceFindFirst.mockReset();
  workspaceMemberFindFirst.mockReset();
  providerConnectionCount.mockReset();
});

describe("hasActiveOperatingProviderConnection", () => {
  it("returns false when the user has no workspace", async () => {
    workspaceFindFirst.mockResolvedValue(null);
    workspaceMemberFindFirst.mockResolvedValue(null);

    expect(await hasActiveOperatingProviderConnection("user_1")).toBe(false);
    expect(providerConnectionCount).not.toHaveBeenCalled();
  });

  it("returns true when an ACTIVE operating key exists", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_1", name: "Acme" });
    providerConnectionCount.mockResolvedValue(1);

    expect(await hasActiveOperatingProviderConnection("user_1")).toBe(true);
  });

  it("returns false when the workspace has zero ACTIVE operating keys", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_1", name: "Acme" });
    providerConnectionCount.mockResolvedValue(0);

    expect(await hasActiveOperatingProviderConnection("user_1")).toBe(false);
  });

  it("only counts ACTIVE Anthropic/OpenAI connections in the user's workspace", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_99", name: "Acme" });
    providerConnectionCount.mockResolvedValue(2);

    await hasActiveOperatingProviderConnection("user_1");

    expect(providerConnectionCount).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws_99",
        status: "ACTIVE",
        provider: { in: ["ANTHROPIC", "OPENAI"] },
      },
    });
  });

  it("resolves a workspace the user is an ACTIVE member of (team member path)", async () => {
    workspaceFindFirst.mockResolvedValue(null); // not an owner
    workspaceMemberFindFirst.mockResolvedValue({
      workspace: { id: "ws_team", name: "Owner Co", status: "READY" },
    });
    providerConnectionCount.mockResolvedValue(1);

    expect(await hasActiveOperatingProviderConnection("tech_1")).toBe(true);
    expect(providerConnectionCount).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws_team",
        status: "ACTIVE",
        provider: { in: ["ANTHROPIC", "OPENAI"] },
      },
    });
  });
});
