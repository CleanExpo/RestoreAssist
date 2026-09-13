import { describe, it, expect, vi, beforeEach } from "vitest";

const workspaceFindFirst = vi.fn();
const workspaceMemberFindFirst = vi.fn();
const providerConnectionFindFirst = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    workspace: {
      findFirst: (...args: unknown[]) => workspaceFindFirst(...args),
    },
    workspaceMember: {
      findFirst: (...args: unknown[]) => workspaceMemberFindFirst(...args),
    },
    providerConnection: {
      findFirst: (...args: unknown[]) => providerConnectionFindFirst(...args),
    },
  },
}));
vi.mock("../../credential-vault", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { getFailedOperatingProviderConnection } from "../provider-connections";

beforeEach(() => {
  workspaceFindFirst.mockReset();
  workspaceMemberFindFirst.mockReset();
  providerConnectionFindFirst.mockReset();
});

describe("getFailedOperatingProviderConnection (RA-7428)", () => {
  it("returns null when the user has no workspace", async () => {
    workspaceFindFirst.mockResolvedValue(null);
    workspaceMemberFindFirst.mockResolvedValue(null);

    expect(await getFailedOperatingProviderConnection("user_1")).toBeNull();
    expect(providerConnectionFindFirst).not.toHaveBeenCalled();
  });

  it("returns the most recently rejected operating key", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_1", name: "Acme" });
    const rejectedAt = new Date("2026-08-25T04:00:00.000Z");
    providerConnectionFindFirst.mockResolvedValue({
      provider: "ANTHROPIC",
      lastValidatedAt: rejectedAt,
      lastError: "Invalid Anthropic API key",
      updatedAt: rejectedAt,
    });

    expect(await getFailedOperatingProviderConnection("user_1")).toEqual({
      provider: "ANTHROPIC",
      rejectedAt,
      lastError: "Invalid Anthropic API key",
    });
    expect(providerConnectionFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws_1",
        status: "FAILED",
        provider: { in: ["ANTHROPIC", "OPENAI", "GOOGLE", "OPENROUTER"] },
      },
      select: {
        provider: true,
        lastValidatedAt: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: [{ lastValidatedAt: "desc" }, { updatedAt: "desc" }],
    });
  });

  it("falls back to updatedAt when lastValidatedAt is missing", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_1", name: "Acme" });
    const updatedAt = new Date("2026-08-25T04:00:00.000Z");
    providerConnectionFindFirst.mockResolvedValue({
      provider: "OPENAI",
      lastValidatedAt: null,
      lastError: null,
      updatedAt,
    });

    expect(await getFailedOperatingProviderConnection("user_1")).toEqual({
      provider: "OPENAI",
      rejectedAt: updatedAt,
      lastError: null,
    });
  });

  it("returns null when no FAILED operating key exists", async () => {
    workspaceFindFirst.mockResolvedValue({ id: "ws_1", name: "Acme" });
    providerConnectionFindFirst.mockResolvedValue(null);

    expect(await getFailedOperatingProviderConnection("user_1")).toBeNull();
  });
});
