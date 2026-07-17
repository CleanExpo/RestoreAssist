import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  getProviderCredentials: vi.fn(),
}));

import { resolveReportProvider } from "@/app/api/reports/generate-inspection-report/provider";
import {
  getWorkspaceForUser,
  listProviderConnections,
  getProviderCredentials,
} from "@/lib/workspace/provider-connections";

describe("resolveReportProvider — GOOGLE/Gemini (Wave 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the user has no workspace", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue(null);
    await expect(resolveReportProvider("u1")).resolves.toBeNull();
  });

  it("maps GOOGLE BYOK to gemini for callAIProvider", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws1",
      name: "Test",
    } as never);
    vi.mocked(listProviderConnections).mockResolvedValue([
      {
        id: "c1",
        workspaceId: "ws1",
        provider: "GOOGLE",
        status: "ACTIVE",
        maskedKey: "AIza…1234",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    vi.mocked(getProviderCredentials).mockResolvedValue({
      apiKey: "AIza-test-key",
    });

    const result = await resolveReportProvider("u1");
    expect(result).toEqual(
      expect.objectContaining({
        provider: "gemini",
        apiKey: "AIza-test-key",
        name: "GOOGLE (BYOK)",
      }),
    );
  });

  it("prefers ANTHROPIC over OPENAI and GOOGLE", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws1",
      name: "Test",
    } as never);
    vi.mocked(listProviderConnections).mockResolvedValue([
      {
        id: "c-g",
        workspaceId: "ws1",
        provider: "GOOGLE",
        status: "ACTIVE",
        maskedKey: "x",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "c-a",
        workspaceId: "ws1",
        provider: "ANTHROPIC",
        status: "ACTIVE",
        maskedKey: "y",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    vi.mocked(getProviderCredentials).mockResolvedValue({
      apiKey: "sk-ant-test",
    });

    const result = await resolveReportProvider("u1");
    expect(result?.provider).toBe("anthropic");
    expect(getProviderCredentials).toHaveBeenCalledWith("ws1", "ANTHROPIC");
  });
});
