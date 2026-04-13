/**
 * Gemma-4-31B-IT client — "RestoreAssist AI Included" tier
 *
 * Self-hosted on an A10G GPU via an OpenAI-compatible inference endpoint.
 * Apache 2.0 licensed; multimodal (text + image + audio).
 *
 * RA-403: Sprint H — Add Gemma-4-31B-IT as self-hosted model tier
 */

import OpenAI from "openai";

export const GEMMA_MODEL = "gemma-4-31b-it";

/** Cost estimates at self-hosted rates ($/1M tokens) */
export const GEMMA_COST = {
  input: 0.14,
  output: 0.4,
} as const;

export interface GemmaMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
}

export interface GemmaCallOptions {
  messages: GemmaMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface GemmaCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
}

/**
 * Returns true when the self-hosted Gemma endpoint is configured.
 * Does not test connectivity — just checks env vars are present.
 */
export function isGemmaAvailable(): boolean {
  return !!(
    process.env.GEMMA_ENDPOINT_URL && process.env.GEMMA_ENDPOINT_URL.trim()
  );
}

/**
 * Call the self-hosted Gemma-4-31B-IT endpoint.
 * Uses the OpenAI-compatible chat completions API.
 *
 * Throws if GEMMA_ENDPOINT_URL is not set.
 */
export async function callGemma(
  options: GemmaCallOptions,
): Promise<GemmaCallResult> {
  const endpointUrl = process.env.GEMMA_ENDPOINT_URL;
  if (!endpointUrl) {
    throw new Error(
      "GEMMA_ENDPOINT_URL is not configured. Set it in .env.local to use the self-hosted Gemma tier.",
    );
  }

  const apiKey = process.env.GEMMA_API_KEY || "not-required";

  const client = new OpenAI({
    baseURL: endpointUrl,
    apiKey,
  });

  const { messages, maxTokens = 8192, temperature = 0.3 } = options;

  const completionOptions: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming =
    {
      model: GEMMA_MODEL,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
      temperature,
    };

  if (options.responseFormat === "json") {
    completionOptions.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(completionOptions);

  const text = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const cost =
    (inputTokens * GEMMA_COST.input + outputTokens * GEMMA_COST.output) /
    1_000_000;

  return {
    text,
    inputTokens,
    outputTokens,
    cost,
    model: GEMMA_MODEL,
  };
}
