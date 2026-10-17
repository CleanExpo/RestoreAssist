/**
 * RA-7999 slice 1a — [AC2b] exactly one retry layer, with real cancellation.
 *
 * The real Anthropic SDK runs with only its transport replaced: the client
 * that callAI constructs gets a fake `fetch`, so the SDK's own retry loop is
 * live and a restored SDK retry shows up as extra transport calls. The
 * workspace key resolver is mocked (no key material is involved).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type FetchArgs = [input: unknown, init?: { signal?: AbortSignal }];
const transport = vi.fn<(...args: FetchArgs) => Promise<Response>>();

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class TransportOnlyFake extends real.default {
    constructor(opts: ConstructorParameters<typeof real.default>[0]) {
      super({
        ...opts,
        fetch: ((...args: FetchArgs) => transport(...args)) as never,
      });
    }
  }
  return { ...real, default: TransportOnlyFake };
});
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: async () => ({
    workspaceId: "ws-test",
    apiKey: "test-workspace-key-placeholder",
    // RA-8001: agents run byok-only; a result without a source is refused.
    source: "byok",
  }),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));

import { executeTask } from "@/lib/agents";
import { callAI } from "@/lib/agents/ai-bridge";
import { reportAnalysisHandler } from "@/lib/agents/definitions/report-analysis";
import {
  USER_ID,
  cleanup,
  context,
  deferred,
  ensureDefinition,
  makeWorkflow,
  registerTestAgent,
  task,
} from "./fixtures";

function overloaded(): Response {
  return new Response(
    JSON.stringify({
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    }),
    {
      status: 529,
      headers: { "content-type": "application/json", "retry-after-ms": "1" },
    },
  );
}

/** A transport call that only settles when its request signal aborts. */
function hangUntilAborted(seen: Array<AbortSignal | undefined>) {
  return (...[, init]: FetchArgs) => {
    seen.push(init?.signal);
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
  };
}

describe.skipIf(!process.env.DATABASE_URL)("RA-7999 [AC2b] one retry layer", () => {
  let slowSlug = "";

  beforeAll(async () => {
    await ensureDefinition("report-analysis");
    // Executor timeout 200 ms; the handler asks the SDK for a long timeout so
    // only the executor's abort can cancel the request.
    slowSlug = await registerTestAgent(
      "slow-ai",
      async (input, options) => {
        await callAI({
          userId: input.userId,
          agentSlug: "report-analysis",
          systemPrompt: "system",
          userPrompt: "prompt",
          keyPolicy: "byok-only",
          timeoutMs: 600_000,
          signal: options?.signal,
        });
        throw new Error("unreachable: the transport never answers");
      },
      200,
    );
  });
  beforeEach(() => {
    transport.mockReset();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("[AC2b] on a 529, one executor attempt makes exactly 1 provider request and parks the task for retry", async () => {
    transport.mockImplementation(async () => overloaded());
    const { workflowId, ids } = await makeWorkflow([
      {
        key: "a",
        agentSlug: "report-analysis",
        maxRetries: 3,
        input: { technicianNotes: "Water under the kitchen sink." },
      },
    ]);

    const result = await executeTask(await task(ids.a), context(workflowId));

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("RETRY");
    const a = await task(ids.a);
    expect(a.status).toBe("RUNNING");
    expect(a.attempts).toBe(1);
    expect(a.errorCode).toBe("AI_PROVIDER_ERROR");
    expect(a.leaseOwner).not.toBeNull();
  });

  it("[AC2b] an executor timeout aborts the in-flight request on the transport", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    transport.mockImplementation(hangUntilAborted(seen));
    const { workflowId, ids } = await makeWorkflow([{ key: "a", agentSlug: slowSlug }]);

    const result = await executeTask(await task(ids.a), context(workflowId));

    expect(result.status).toBe("RETRY");
    expect(result.error?.code).toBe("TIMEOUT");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(seen[0]?.aborted).toBe(true);
  });

  it("[AC2b] the report-analysis handler passes the executor's signal through callAI to messages.create", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const reached = deferred<void>();
    transport.mockImplementation((...args: FetchArgs) => {
      reached.resolve();
      return hangUntilAborted(seen)(...args);
    });
    const controller = new AbortController();

    const run = reportAnalysisHandler(
      { userId: USER_ID, data: { technicianNotes: "Ceiling stain." } },
      { signal: controller.signal },
    );
    await reached.promise;
    expect(seen[0]?.aborted).toBe(false);
    controller.abort(new Error("executor timeout"));

    await expect(run).rejects.toBeDefined();
    expect(seen[0]?.aborted).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
