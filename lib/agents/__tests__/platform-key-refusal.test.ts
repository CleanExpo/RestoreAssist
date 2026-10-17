/**
 * RA-8001 slice 1d-i — [AC1] an agent never spends the platform key, and
 * [AC9] a refusal leaves the workflow terminal (1a §2.3) until a BYOK key
 * appears and it is resumed.
 *
 * Real Postgres (test:db), the real executor, the real report-analysis
 * handler, the real callAI and the real classifyError. Mocked: the key
 * resolver (its error classes stay real), the SDK constructor and the
 * transport (tryClaudeModels), which count provider requests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());
const anthropicCtor = vi.hoisted(() => vi.fn());
const tryClaudeModels = vi.hoisted(() => vi.fn());

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
  getClaudeModels: () => [{ name: "claude-test", maxTokens: 4000 }],
}));

import { executeTask, resumeWorkflow, advanceWorkflow } from "@/lib/agents";
import { callAI, PlatformKeyRefusedError, type AIBridgeParams } from "@/lib/agents/ai-bridge";
import { classifyError } from "@/lib/agents/error-handler";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";
import {
  USER_ID,
  cleanup,
  context,
  ensureDefinition,
  makeWorkflow,
  registerTestAgent,
  task,
  workflow,
} from "./durable/fixtures";

const HAS_DB = !!process.env.DATABASE_URL;
const PLATFORM_KEY = "sk-ant-platform-fixture-not-a-real-key";
const NOTES = { technicianNotes: "Burst pipe under the kitchen sink", propertyAddress: "1 Test St" };

const platform = () => ({ workspaceId: "platform-trial", apiKey: PLATFORM_KEY, source: "platform" });
const byok = (apiKey = "sk-ant-workspace-fixture") => ({ workspaceId: "ws_1", apiKey, source: "byok" });

function providerReply() {
  return {
    content: [{ type: "text", text: '{"affectedAreas":["Kitchen"],"waterSource":"Burst pipe"}' }],
    usage: { input_tokens: 5, output_tokens: 3 },
    model: "claude-test",
  };
}

async function runReportAnalysis() {
  const { workflowId, ids } = await makeWorkflow([
    { key: "a", agentSlug: "report-analysis", maxRetries: 3, input: NOTES },
  ]);
  const result = await executeTask(await task(ids.a), context(workflowId));
  return { workflowId, taskId: ids.a, result };
}

async function expectRefused(taskId: string) {
  const row = await task(taskId);
  expect(row.errorCode).toBe("AI_PLATFORM_KEY_REFUSED");
  expect(row.status).toBe("FAILED");
  expect(anthropicCtor).not.toHaveBeenCalled();
  expect(tryClaudeModels).not.toHaveBeenCalled();
  return row;
}

let omitSlug = "";

describe.skipIf(!HAS_DB)("RA-8001 [AC1] the agent path refuses the platform key", () => {
  beforeAll(async () => {
    await import("@/lib/agents");
    await ensureDefinition("report-analysis");
    await ensureDefinition("classification");
    await ensureDefinition("scope-generation");
    // keyPolicy omitted at runtime: a caller that bypasses the type.
    omitSlug = await registerTestAgent("omit-policy", async (input) => {
      const result = await callAI({
        userId: input.userId,
        agentSlug: "report-analysis",
        systemPrompt: "system",
        userPrompt: "prompt",
      } as unknown as AIBridgeParams);
      return {
        success: true,
        data: { text: result.text },
        metadata: { provider: result.provider, model: result.model, tokensUsed: 0, durationMs: 0 },
      };
    });
  });
  beforeEach(() => {
    resolveWorkspaceAiKey.mockReset();
    anthropicCtor.mockReset();
    tryClaudeModels.mockReset();
    tryClaudeModels.mockResolvedValue(providerReply());
    vi.stubEnv("ANTHROPIC_API_KEY", PLATFORM_KEY);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });

  it("[AC1] refuses source platform with AI_PLATFORM_KEY_REFUSED and makes 0 requests", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(platform());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { taskId, workflowId, result } = await runReportAnalysis();
    expect(result.status).toBe("FAILED");
    expect(result.error?.code).toBe("AI_PLATFORM_KEY_REFUSED");
    await expectRefused(taskId);
    // The durable refusal line: ids and source, never key material.
    const line = warn.mock.calls.find((c) => c[0] === "[agent-refusal]");
    expect(line?.[1]).toEqual({
      code: "AI_PLATFORM_KEY_REFUSED",
      taskId,
      workflowId,
      agentSlug: "report-analysis",
      userId: USER_ID,
      workspaceId: "platform-trial",
      source: "platform",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PLATFORM_KEY);
    warn.mockRestore();
  });

  it("[AC1] refuses a resolver result with no source (old mock or future path)", async () => {
    resolveWorkspaceAiKey.mockResolvedValue({ workspaceId: "ws_1", apiKey: "sk-ant-workspace-fixture" });
    const { taskId } = await runReportAnalysis();
    await expectRefused(taskId);
  });

  it("[AC1] refuses when keyPolicy is omitted at runtime and the source is platform", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(platform());
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: omitSlug, maxRetries: 3 },
    ]);
    await executeTask(await task(ids.a), context(workflowId));
    await expectRefused(ids.a);
  });

  it("[AC1] refuses a byok-labelled key that is the platform key", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(byok(PLATFORM_KEY));
    const { taskId } = await runReportAnalysis();
    await expectRefused(taskId);
  });

  it("[AC1] a missing platform key gives the same code and message as BYOK_REQUIRED", async () => {
    resolveWorkspaceAiKey.mockRejectedValue(new NoWorkspaceKeyError("ANTHROPIC", "PLATFORM_NOT_READY"));
    const notReady = await expectRefused((await runReportAnalysis()).taskId);
    resolveWorkspaceAiKey.mockRejectedValue(new NoWorkspaceKeyError("ANTHROPIC", "BYOK_REQUIRED"));
    const byokRequired = await expectRefused((await runReportAnalysis()).taskId);
    expect(notReady.errorMessage).toBe(byokRequired.errorMessage);
    expect(notReady.errorMessage).toBe(new PlatformKeyRefusedError().message);
  });

  it("[AC1] refuse, resume, execute on the platform key again: 0 requests, refused again", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(platform());
    const { taskId, workflowId } = await runReportAnalysis();
    await expectRefused(taskId);
    await resumeWorkflow(workflowId);
    const { nextExecutable } = await advanceWorkflow(workflowId);
    expect(nextExecutable.map((t) => t.id)).toEqual([taskId]);
    await executeTask(nextExecutable[0], context(workflowId));
    await expectRefused(taskId);
  });

  it("[AC1] positive twin: source byok makes exactly 1 request and completes", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(byok());
    const { taskId, result } = await runReportAnalysis();
    expect(result.status).toBe("COMPLETED");
    expect(anthropicCtor).toHaveBeenCalledTimes(1);
    expect(anthropicCtor.mock.calls[0][0]).toMatchObject({ apiKey: "sk-ant-workspace-fixture" });
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
    expect((await task(taskId)).status).toBe("COMPLETED");
  });

  it("[AC1] positive twin: resume after a BYOK key appears makes 1 request", async () => {
    resolveWorkspaceAiKey.mockResolvedValue(platform());
    const { taskId, workflowId } = await runReportAnalysis();
    await expectRefused(taskId);
    resolveWorkspaceAiKey.mockResolvedValue(byok());
    await resumeWorkflow(workflowId);
    const { nextExecutable } = await advanceWorkflow(workflowId);
    await executeTask(nextExecutable[0], context(workflowId));
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
    expect((await task(taskId)).status).toBe("COMPLETED");
  });

  it("[AC1] the refusal classifies as a non-retryable AI_PLATFORM_KEY_REFUSED", () => {
    expect(classifyError(new PlatformKeyRefusedError())).toMatchObject({
      code: "AI_PLATFORM_KEY_REFUSED",
      retryable: false,
    });
    // A plain NoWorkspaceKeyError is classified explicitly, never by message.
    expect(classifyError(new NoWorkspaceKeyError("ANTHROPIC", "PLATFORM_NOT_READY"))).toMatchObject({
      code: "AUTH_ERROR",
      retryable: false,
    });
  });
});

describe.skipIf(!HAS_DB)("RA-8001 [AC9] a refusal leaves the workflow terminal until resume with a key", () => {
  beforeEach(() => {
    resolveWorkspaceAiKey.mockReset();
    anthropicCtor.mockReset();
    tryClaudeModels.mockReset();
    tryClaudeModels.mockResolvedValue(providerReply());
    vi.stubEnv("ANTHROPIC_API_KEY", PLATFORM_KEY);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });

  it("[AC9] preflight bypassed: the callAI refusal cascades, the workflow is terminal, resume with BYOK runs classification", async () => {
    await import("@/lib/agents");
    await ensureDefinition("report-analysis");
    await ensureDefinition("classification");
    await ensureDefinition("scope-generation");
    // The quick-assessment DAG, wired with real task ids.
    const { workflowId, ids } = await makeWorkflow([
      { key: "a", agentSlug: "report-analysis", maxRetries: 3, input: NOTES },
      { key: "b", agentSlug: "classification", status: "PENDING", dependsOn: ["a"], input: { waterSource: "Burst pipe", affectedSquareFootage: 100 } },
      { key: "c", agentSlug: "scope-generation", status: "PENDING", dependsOn: ["b"], input: { affectedAreas: ["Kitchen"] } },
    ]);

    resolveWorkspaceAiKey.mockResolvedValue(platform());
    await executeTask(await task(ids.a), context(workflowId));
    await expectRefused(ids.a);
    for (const key of ["b", "c"]) {
      const dep = await task(ids[key]);
      expect(dep.status).toBe("SKIPPED");
      expect(dep.errorCode).toBe("UPSTREAM_FAILED");
    }
    expect((await workflow(workflowId)).status).toBe("FAILED");

    resolveWorkspaceAiKey.mockResolvedValue(byok());
    await resumeWorkflow(workflowId);
    for (let i = 0; i < 4; i++) {
      const { nextExecutable, status } = await advanceWorkflow(workflowId);
      if (nextExecutable.length === 0 || status !== "RUNNING") break;
      for (const t of nextExecutable) await executeTask(t, context(workflowId));
    }
    expect((await task(ids.a)).status).toBe("COMPLETED");
    expect((await task(ids.b)).status).toBe("COMPLETED");
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
  });
});
