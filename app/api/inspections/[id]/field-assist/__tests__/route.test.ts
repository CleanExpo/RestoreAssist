/**
 * RA-8001 slice 1d-i — POST /api/inspections/[id]/field-assist.
 *
 * [AC2] field-assist keeps the funded-trial platform key ("platform-allowed",
 * until 1d-ii). [AC5] a key miss maps by reason: PLATFORM_NOT_READY is an
 * ops fault (503), BYOK_REQUIRED means add a key (402).
 *
 * The real callAI runs; the key resolver (real error classes), the SDK
 * constructor and the transport are stubbed and count provider requests.
 * The tenancy and claim-context reads are stubbed: this file proves key
 * policy and error mapping, not tenancy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());
const anthropicCtor = vi.hoisted(() => vi.fn());
const tryClaudeModels = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: async () => ({
    ok: true,
    data: { id: "insp_1", userId: "user_1", workspaceId: null },
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    waterDamageClassification: { findUnique: async () => null },
    inspectionPhoto: { count: async () => 0 },
    inspection: { findFirst: async () => ({ clientId: null, report: null }) },
  },
}));
vi.mock("@/lib/margot/claim-context", () => ({
  loadClaimContext: async () => ({
    inspectionId: "insp_1",
    stage: "DRAFT",
    claimType: null,
    missingFields: [],
    wetReadingCount: 0,
    baselineCaptured: false,
    monitoringPointCount: 0,
    completenessHint: null,
  }),
}));
vi.mock("@/lib/margot/audit-margot-action", () => ({
  auditMargotAction: async () => undefined,
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/resolve-workspace-ai-key")>();
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  },
}));
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: (...args: unknown[]) => tryClaudeModels(...args),
  getClaudeModels: () => [{ name: "claude-test", maxTokens: 1200 }],
}));
vi.mock("@/lib/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability")>();
  return {
    ...actual,
    reportError: (...args: Parameters<typeof actual.reportError>) => {
      reportError(...args);
    },
  };
});

import { NextRequest } from "next/server";
import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

const PLATFORM_KEY = "sk-ant-platform-fixture-not-a-real-key";

async function ask(message = "What should I capture next?") {
  const res = await POST(
    new NextRequest("http://localhost/api/inspections/insp_1/field-assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  getServerSession.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  resolveWorkspaceAiKey.mockReset();
  anthropicCtor.mockReset();
  tryClaudeModels.mockReset();
  reportError.mockReset();
  tryClaudeModels.mockResolvedValue({
    content: [{ type: "text", text: "Take a baseline moisture reading." }],
    usage: { input_tokens: 5, output_tokens: 3 },
    model: "claude-test",
  });
  vi.stubEnv("ANTHROPIC_API_KEY", PLATFORM_KEY);
});

describe("RA-8001 [AC2] field-assist keeps the platform key", () => {
  it("[AC2] a platform-source key under platform-allowed makes 1 request and returns 200 with the body unchanged", async () => {
    resolveWorkspaceAiKey.mockResolvedValue({
      workspaceId: "platform-trial",
      apiKey: PLATFORM_KEY,
      source: "platform",
    });
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(anthropicCtor).toHaveBeenCalledTimes(1);
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
    expect(Object.keys(body)).toEqual(["data"]);
    expect(Object.keys(body.data).sort()).toEqual(
      ["actionClass", "completeness", "context", "model", "provider", "reply"].sort(),
    );
    expect(body.data.reply).toBe("Take a baseline moisture reading.");
    expect(body.data.provider).toBe("anthropic");
    expect(body.data.model).toBe("claude-test");
  });
});

describe("RA-8001 [AC5] field-assist key-miss mapping", () => {
  it("[AC5] PLATFORM_NOT_READY is 503 GOVERNOR_UNAVAILABLE, reported with reason, userId and inspectionId", async () => {
    resolveWorkspaceAiKey.mockRejectedValue(
      new NoWorkspaceKeyError("ANTHROPIC", "PLATFORM_NOT_READY"),
    );
    const { status, body } = await ask();
    expect(status).toBe(503);
    expect(body.error.code).toBe("GOVERNOR_UNAVAILABLE");
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({
      userId: "user_1",
      reason: "PLATFORM_NOT_READY",
      inspectionId: "insp_1",
    });
    expect(tryClaudeModels).not.toHaveBeenCalled();
  });

  it("[AC5] BYOK_REQUIRED is 402 PAYMENT_REQUIRED (was 412)", async () => {
    resolveWorkspaceAiKey.mockRejectedValue(
      new NoWorkspaceKeyError("ANTHROPIC", "BYOK_REQUIRED"),
    );
    const { status, body } = await ask();
    expect(status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    expect(body.error.message).toMatch(/Anthropic API key/);
    expect(tryClaudeModels).not.toHaveBeenCalled();
  });
});
