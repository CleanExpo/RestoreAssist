import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), canonical: vi.fn(), legacy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { integration: { findMany: mocks.legacy } } }));
vi.mock("@/lib/organization-credits", () => ({ getOrganizationOwner: mocks.owner }));
vi.mock("../ai-connections", () => ({ listConfiguredAiConnections: mocks.canonical }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  OPERATING_PROVIDERS: ["ANTHROPIC", "OPENAI", "GOOGLE", "OPENROUTER"],
}));

import { hasConfiguredAi } from "../ai-readiness";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue("organisation-owner");
  mocks.canonical.mockResolvedValue({ workspaceId: "owner-workspace", connections: [] });
  mocks.legacy.mockResolvedValue([]);
});

const legacy = (name: string, icon: string | null = "[ra:ai]") => ({
  id: "legacy-ai", provider: "XERO", name, icon,
});
function canonical(provider: string, status = "ACTIVE") {
  mocks.canonical.mockResolvedValue({
    workspaceId: "owner-workspace", connections: [{ id: "canonical-ai", provider, status }],
  });
}

describe("AI configuration presence", () => {
  it.each(["ANTHROPIC", "OPENAI", "GOOGLE", "OPENROUTER"])("recognises configured canonical %s without inspecting any credential", async (provider) => {
    canonical(provider);
    expect(await hasConfiguredAi("member-id")).toBe(true);
    expect(mocks.owner).toHaveBeenCalledWith("member-id");
    expect(mocks.canonical).toHaveBeenCalledWith("organisation-owner");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it.each(["DISABLED", "FAILED"])("canonical %s suppresses the same provider's legacy record", async (status) => {
    canonical("ANTHROPIC", status);
    mocks.legacy.mockResolvedValue([legacy("Anthropic Claude")]);
    expect(await hasConfiguredAi("member-id")).toBe(false);
  });

  it("suppresses legacy Gemini when the typed GOOGLE connection is disabled", async () => {
    canonical("GOOGLE", "DISABLED");
    mocks.legacy.mockResolvedValue([legacy("Google Gemini")]);
    expect(await hasConfiguredAi("member-id")).toBe(false);
  });

  it("allows a different provider's legacy configuration", async () => {
    canonical("ANTHROPIC", "FAILED");
    mocks.legacy.mockResolvedValue([legacy("OpenAI GPT")]);
    expect(await hasConfiguredAi("member-id")).toBe(true);
  });

  it("retains legacy fallback when the canonical reader reports no configured rows", async () => {
    // listConfiguredAiConnections excludes untouched provisioned placeholders.
    mocks.legacy.mockResolvedValue([legacy("OpenRouter")]);
    expect(await hasConfiguredAi("member-id")).toBe(true);
    expect(mocks.legacy).toHaveBeenCalledWith({
      where: { userId: "organisation-owner", status: "CONNECTED", apiKey: { not: null }, NOT: { apiKey: "" } },
      select: { id: true, provider: true, name: true, icon: true },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  });

  it.each([
    legacy("Xero", "/integrations/xero.svg"),
    legacy("Unknown provider"),
    legacy("Arbitrary service", null),
  ])("does not count accounting, ambiguous or unknown identity as AI configuration", async (row) => {
    mocks.legacy.mockResolvedValue([row]);
    expect(await hasConfiguredAi("member-id")).toBe(false);
  });

  it.each(["GEMMA", "ELEVENLABS"])("does not count %s as an operating provider key", async (provider) => {
    canonical(provider);
    expect(await hasConfiguredAi("member-id")).toBe(false);
  });

  it("uses the authenticated user's own scope when no organisation owner exists", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await hasConfiguredAi("standalone-user")).toBe(false);
    expect(mocks.canonical).toHaveBeenCalledWith("standalone-user");
    expect(mocks.legacy.mock.calls[0][0].where.userId).toBe("standalone-user");
  });

  it("does not hide a canonical read failure behind legacy readiness", async () => {
    mocks.canonical.mockRejectedValue(new Error("synthetic read failure"));
    await expect(hasConfiguredAi("member-id")).rejects.toThrow("synthetic read failure");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
