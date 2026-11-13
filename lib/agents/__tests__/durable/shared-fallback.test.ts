/**
 * RA-7999 slice 1a — tryClaudeModels' opt-in single-request mode, and the
 * default mode that every non-agent caller still uses.
 *
 * [AC10] Without the option, a 529 on the first model still falls back to the
 *        next model (lib/anthropic.ts, lib/ai-provider.ts, chatbot unchanged).
 * [AC2b] With {fallbackOn: "notFound"}, errors surface as the original SDK
 *        error object, status and class intact, including when every model
 *        404s; one call cannot fan out.
 *
 * No database: these run in every vitest run.
 */
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { tryClaudeModels } from "@/lib/anthropic-models";

const REQUEST = {
  messages: [{ role: "user", content: "hello" }],
  max_tokens: 10,
};
const MODELS = [
  { name: "model-one", maxTokens: 10 },
  { name: "model-two", maxTokens: 10 },
];

function overloadedError() {
  return Object.assign(new Error("529 overloaded"), {
    status: 529,
    error: { type: "overloaded_error", message: "Overloaded" },
  });
}

function fakeClient(create: (...args: unknown[]) => Promise<unknown>) {
  return { messages: { create: vi.fn(create) } };
}

describe("RA-7999 tryClaudeModels fallback modes", () => {
  it("[AC10] without the option, a 529 on the first model still falls back to the next model", async () => {
    const ok = { id: "msg_1", content: [], usage: {} };
    const client = fakeClient(async (params: any) => {
      if (params.model === "model-one") throw overloadedError();
      return ok;
    });

    const response = await tryClaudeModels(client, REQUEST, MODELS);

    expect(response).toBe(ok);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
    // Default mode passes no request options (no signal argument).
    expect(client.messages.create.mock.calls[0]).toHaveLength(1);
  });

  it("[AC2b] with fallbackOn notFound, a 529 surfaces after one request as the original error", async () => {
    const err = overloadedError();
    const client = fakeClient(async () => {
      throw err;
    });

    await expect(
      tryClaudeModels(client, REQUEST, MODELS, { fallbackOn: "notFound" }),
    ).rejects.toBe(err);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("[AC2b] with fallbackOn notFound, a one-model list that 404s surfaces the SDK NotFoundError with status 404", async () => {
    const client = new Anthropic({
      apiKey: "test-placeholder",
      maxRetries: 0,
      fetch: (async () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "not_found_error", message: "model: model-one" },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        )) as never,
    });

    const failure = await tryClaudeModels(
      client,
      REQUEST,
      [MODELS[0]],
      { fallbackOn: "notFound" },
    ).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Anthropic.NotFoundError);
    expect((failure as { status?: number }).status).toBe(404);
  });
});
