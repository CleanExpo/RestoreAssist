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
  getProviderApiKey: vi.fn(),
}));

import {
  getWorkspaceForUser,
  listProviderConnections,
  getProviderApiKey,
} from "@/lib/workspace/provider-connections";
import { resolveReportProvider } from "../generate-inspection-report/provider";

const mockGetWorkspace = getWorkspaceForUser as ReturnType<typeof vi.fn>;
const mockListConnections = listProviderConnections as ReturnType<typeof vi.fn>;
const mockGetProviderApiKey = getProviderApiKey as ReturnType<typeof vi.fn>;

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
    mockGetProviderApiKey.mockImplementation(
      (_wsId: string, provider: string) => Promise.resolve(`key-${provider}`),
    );

    const result = await resolveReportProvider("user-1");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.apiKey).toBe("key-ANTHROPIC");
    expect(result!.id).toBe("byok-anthropic");
    expect(result!.name).toContain("ANTHROPIC");
  });

  it("returns openai when only OPENAI connection is active", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "OPENAI", status: "ACTIVE" },
    ]);
    mockGetProviderApiKey.mockImplementation(
      (_wsId: string, provider: string) => Promise.resolve(`key-${provider}`),
    );

    const result = await resolveReportProvider("user-1");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.apiKey).toBe("key-OPENAI");
    expect(result!.id).toBe("byok-openai");
  });

  it("returns null when no workspace exists", async () => {
    mockGetWorkspace.mockResolvedValue(null);

    const result = await resolveReportProvider("user-no-workspace");

    expect(result).toBeNull();
  });

  it("returns null when no active ANTHROPIC or OPENAI connections exist", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "GOOGLE", status: "ACTIVE" },
      { provider: "ANTHROPIC", status: "DISABLED" },
    ]);

    const result = await resolveReportProvider("user-1");

    expect(result).toBeNull();
  });

  it("returns null when getProviderApiKey returns null (key removed after listing)", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "Test Workspace" });
    mockListConnections.mockResolvedValue([
      { provider: "ANTHROPIC", status: "ACTIVE" },
    ]);
    mockGetProviderApiKey.mockResolvedValue(null);

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
