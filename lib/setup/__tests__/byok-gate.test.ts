/**
 * byok-gate.test.ts
 *
 * Unit tests for the byokKeysCheck function verifying that:
 *   - zero connections → RED (not yellow)
 *   - one ACTIVE ANTHROPIC that validates → GREEN
 *   - one ACTIVE OPENAI that validates → GREEN
 *   - only ACTIVE GOOGLE + GEMMA → RED (not operating providers)
 *
 * These tests run without a database — all external calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all heavy top-level imports that checks.ts pulls in ─────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/account-tokens", () => ({
  decryptAccountTokens: vi.fn(),
}));

vi.mock("@/lib/ai/model-router", () => ({
  routeBasic: vi.fn(),
}));

vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(),
}));

vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn(),
}));

// ── The module under test ────────────────────────────────────────────────────
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  validateProviderKey: vi.fn(),
  // checks.ts consumes the shared operating-provider list — the mock must
  // export it or the gate's filter throws on a non-empty connection list.
  OPERATING_PROVIDERS: ["ANTHROPIC", "OPENAI", "OPENROUTER"],
}));

import {
  getWorkspaceForUser,
  listProviderConnections,
  validateProviderKey,
} from "@/lib/workspace/provider-connections";
import { prisma } from "@/lib/prisma";

// Import AFTER mocks are set up
import { byokKeysCheck } from "../checks";

const mockGetWorkspaceForUser = getWorkspaceForUser as ReturnType<typeof vi.fn>;
const mockListProviderConnections = listProviderConnections as ReturnType<typeof vi.fn>;
const mockValidateProviderKey = validateProviderKey as ReturnType<typeof vi.fn>;
const mockOrgFindUnique = (prisma.organization.findUnique as ReturnType<typeof vi.fn>);

const FAKE_ORG_ID = "org-test-123";
const FAKE_WORKSPACE = { id: "ws-test-456", name: "Test Workspace" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: org exists with an owner
  mockOrgFindUnique.mockResolvedValue({ ownerId: "user-test-789" });
  // Default: workspace exists
  mockGetWorkspaceForUser.mockResolvedValue(FAKE_WORKSPACE);
});

describe("byokKeysCheck — operating key gate", () => {
  it("returns RED when there are zero connections (no BYOK key added)", async () => {
    mockListProviderConnections.mockResolvedValue([]);

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("red");
    expect(result.capability).toBe("byok_keys");
    expect(result.note).toMatch(/Anthropic, OpenAI, or OpenRouter/i);
  });

  it("returns GREEN when one ACTIVE ANTHROPIC connection validates successfully", async () => {
    mockListProviderConnections.mockResolvedValue([
      {
        id: "conn-1",
        workspaceId: FAKE_WORKSPACE.id,
        provider: "ANTHROPIC",
        status: "ACTIVE",
        maskedKey: "sk-ant-...1234",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockValidateProviderKey.mockResolvedValue({
      provider: "ANTHROPIC",
      valid: true,
      latencyMs: 120,
    });

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("green");
    expect(result.capability).toBe("byok_keys");
  });

  it("returns GREEN when one ACTIVE OPENAI connection validates successfully", async () => {
    mockListProviderConnections.mockResolvedValue([
      {
        id: "conn-2",
        workspaceId: FAKE_WORKSPACE.id,
        provider: "OPENAI",
        status: "ACTIVE",
        maskedKey: "sk-openai...5678",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockValidateProviderKey.mockResolvedValue({
      provider: "OPENAI",
      valid: true,
      latencyMs: 95,
    });

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("green");
    expect(result.capability).toBe("byok_keys");
  });

  it("returns GREEN when one ACTIVE OPENROUTER connection validates successfully", async () => {
    mockListProviderConnections.mockResolvedValue([
      {
        id: "conn-or",
        workspaceId: FAKE_WORKSPACE.id,
        provider: "OPENROUTER",
        status: "ACTIVE",
        maskedKey: "sk-or-v1...9999",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockValidateProviderKey.mockResolvedValue({
      provider: "OPENROUTER",
      valid: true,
      latencyMs: 110,
    });

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("green");
    expect(result.capability).toBe("byok_keys");
  });

  it("returns RED when only ACTIVE GOOGLE + GEMMA connections exist (not operating providers)", async () => {
    mockListProviderConnections.mockResolvedValue([
      {
        id: "conn-3",
        workspaceId: FAKE_WORKSPACE.id,
        provider: "GOOGLE",
        status: "ACTIVE",
        maskedKey: "AIza...abcd",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "conn-4",
        workspaceId: FAKE_WORKSPACE.id,
        provider: "GEMMA",
        status: "ACTIVE",
        maskedKey: "••••••••••••",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    // validateProviderKey should NOT be called for non-operating providers
    // but even if it were, the result should still be RED

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("red");
    expect(result.capability).toBe("byok_keys");
    expect(result.note).toMatch(/Anthropic, OpenAI, or OpenRouter/i);
    // Should not have called validateProviderKey for GOOGLE/GEMMA
    expect(mockValidateProviderKey).not.toHaveBeenCalled();
  });

  it("returns RED when no workspace exists for the org owner", async () => {
    mockGetWorkspaceForUser.mockResolvedValue(null);

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("red");
    expect(result.note).toMatch(/Anthropic, OpenAI, or OpenRouter/i);
  });

  it("returns RED when org is not found", async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    const result = await byokKeysCheck(FAKE_ORG_ID);

    expect(result.status).toBe("red");
    expect(result.note).toMatch(/Anthropic, OpenAI, or OpenRouter/i);
  });
});
