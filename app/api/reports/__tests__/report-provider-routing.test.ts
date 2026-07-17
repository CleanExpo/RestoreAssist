/**
 * Tests for resolveReportProvider — the new-store (ProviderConnection) resolver
 * that routes AI report generation by whichever provider the client installed.
 *
 * Mocks @/lib/workspace/provider-connections entirely so no DB is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  getProviderCredentials: vi.fn(),
}));

import {
  getWorkspaceForUser,
  listProviderConnections,
  getProviderCredentials,
} from "@/lib/workspace/provider-connections";
import { resolveReportProvider } from "../generate-inspection-report/provider";

const mockGetWorkspace = getWorkspaceForUser as ReturnType<typeof vi.fn>;
const mockListConnections = listProviderConnections as ReturnType<typeof vi.fn>;
const mockGetProviderCredentials = getProviderCredentials as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveReportProvider", () => {
  it("returns anthropic when both ANTHROPIC and OPENAI connections are active (prefers Anthropic)", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "ANTHROPIC", status: "ACTIVE" },
      { provider: "OPENAI", status: "ACTIVE" },
    ]);
    mockGetProviderCredentials.mockImplementation(
      (_wsId: string, provider: string) =>
        Promise.resolve({ apiKey: `key-${provider}` }),
    );

    const result = await resolveReportProvider("user-1");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.apiKey).toBe("key-ANTHROPIC");
    expect(result!.id).toBe("byok-anthropic");
    expect(result!.name).toContain("ANTHROPIC");
    // Non-OpenRouter providers never carry a model slug.
    expect(result!.model).toBeUndefined();
  });

  it("returns openai when only OPENAI connection is active", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "OPENAI", status: "ACTIVE" },
    ]);
    mockGetProviderCredentials.mockImplementation(
      (_wsId: string, provider: string) =>
        Promise.resolve({ apiKey: `key-${provider}` }),
    );

    const result = await resolveReportProvider("user-1");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.apiKey).toBe("key-OPENAI");
    expect(result!.id).toBe("byok-openai");
  });

  it("returns openrouter (with stored model) when it is the only active operating key", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "GOOGLE", status: "ACTIVE" },
      { provider: "OPENROUTER", status: "ACTIVE" },
    ]);
    mockGetProviderCredentials.mockImplementation(
      (_wsId: string, provider: string) =>
        Promise.resolve({
          apiKey: `key-${provider}`,
          model: provider === "OPENROUTER" ? "qwen/qwen-2.5-72b-instruct" : undefined,
        }),
    );

    const result = await resolveReportProvider("user-1");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openrouter");
    expect(result!.apiKey).toBe("key-OPENROUTER");
    expect(result!.id).toBe("byok-openrouter");
    // The workspace's stored model slug is threaded through for callAIProvider.
    expect(result!.model).toBe("qwen/qwen-2.5-72b-instruct");
  });

  it("prefers anthropic over openrouter when both are active", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "OPENROUTER", status: "ACTIVE" },
      { provider: "ANTHROPIC", status: "ACTIVE" },
    ]);
    mockGetProviderCredentials.mockImplementation(
      (_wsId: string, provider: string) =>
        Promise.resolve({ apiKey: `key-${provider}` }),
    );

    const result = await resolveReportProvider("user-1");

    expect(result!.provider).toBe("anthropic");
  });

  it("returns null when no workspace exists", async () => {
    mockGetWorkspace.mockResolvedValue(null);

    const result = await resolveReportProvider("user-no-workspace");

    expect(result).toBeNull();
  });

  it("returns null when no active operating connections exist", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    // No ACTIVE connection for any operating provider (ANTHROPIC/OPENAI/
    // OPENROUTER/GOOGLE). GOOGLE became an operating provider in Wave 4, so a
    // genuine "no operating connection" scenario must use only non-ACTIVE rows.
    mockListConnections.mockResolvedValue([
      { provider: "ANTHROPIC", status: "DISABLED" },
      { provider: "GOOGLE", status: "DISABLED" },
    ]);

    const result = await resolveReportProvider("user-1");

    expect(result).toBeNull();
  });

  it("returns null when getProviderCredentials returns null (key removed after listing)", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "ANTHROPIC", status: "ACTIVE" },
    ]);
    mockGetProviderCredentials.mockResolvedValue(null);

    const result = await resolveReportProvider("user-1");

    expect(result).toBeNull();
  });

  it("returns null when connection list is empty", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([]);

    const result = await resolveReportProvider("user-1");

    expect(result).toBeNull();
  });
});
