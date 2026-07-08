import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./prisma";
import { tryClaudeModels } from "./anthropic-models";
import { getOrganizationOwner } from "./organization-credits";
import { createCachedSystemPrompt } from "./anthropic/features/prompt-cache";

export type AIProvider = "anthropic" | "openai" | "gemini" | "openrouter";

export interface AIIntegration {
  id: string;
  name: string;
  apiKey: string;
  provider: AIProvider;
  /**
   * OpenRouter model routing slug (e.g. "deepseek/deepseek-chat"). Only used by
   * the "openrouter" provider; ignored by the fixed-vendor providers, which use
   * their own models. A per-call `options.model` still wins over this.
   */
  model?: string;
}

/**
 * Authoritatively resolve the AI vendor from the API key's prefix.
 * The key itself decides which vendor will accept it, so this can never
 * misroute the way a free-text integration name can. Returns null for an
 * unrecognised format (callers fall back to a name hint as a last resort).
 *   Anthropic:  sk-ant-…
 *   OpenRouter: sk-or-… (checked before OpenAI — an OpenRouter key also starts
 *               with the generic `sk-` prefix, so order is load-bearing here)
 *   OpenAI:     sk-… / sk-proj-…
 *   Google (Gemini): AIza…
 */
export function providerForKey(
  apiKey: string | null | undefined,
): AIProvider | null {
  if (!apiKey) return null;
  const k = apiKey.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

/**
 * Get the effective user ID for integrations
 * For Managers/Technicians, returns the Admin's ID
 * For Admins, returns their own ID
 */
export async function getEffectiveUserIdForIntegrations(
  userId: string,
): Promise<string> {
  const ownerId = await getOrganizationOwner(userId);
  return ownerId || userId;
}

/**
 * Get integrations for a user (using Admin's integrations for Managers/Technicians)
 */
export async function getIntegrationsForUser(
  userId: string,
  filters?: {
    status?: "CONNECTED" | "DISCONNECTED";
    nameContains?: string[];
  },
): Promise<any[]> {
  const effectiveUserId = await getEffectiveUserIdForIntegrations(userId);

  const whereClause: any = {
    userId: effectiveUserId,
    apiKey: { not: null },
  };

  if (filters?.status) {
    whereClause.status = filters.status;
  } else {
    whereClause.status = "CONNECTED";
  }

  if (filters?.nameContains && filters.nameContains.length > 0) {
    whereClause.OR = filters.nameContains.map((name) => ({
      name: { contains: name },
    }));
  }

  // RA-1376: bounded list query (CLAUDE.md rule 3). Only id/name/apiKey are
  // ever read by callers; never over-fetch sensitive columns (accessToken,
  // refreshToken, config).
  return await prisma.integration.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      apiKey: true,
    },
    take: 50,
  });
}

/**
 * Get the latest connected AI integration (OpenAI, Anthropic, or Gemini)
 * For Managers/Technicians, uses the Admin's integrations
 * For Admins, uses their own integrations
 * Returns the most recently connected integration
 */
export async function getLatestAIIntegration(
  userId: string,
): Promise<AIIntegration | null> {
  const integrations = await getIntegrationsForUser(userId, {
    status: "CONNECTED",
    nameContains: [
      "Anthropic",
      "OpenAI",
      "Gemini",
      "Claude",
      "GPT",
      "OpenRouter",
    ],
  });

  if (integrations.length === 0) {
    return null;
  }

  // Get the latest integration
  const integration = integrations[0];

  // Provider is resolved from the API key prefix (authoritative — the key
  // decides which vendor accepts it), falling back to the free-text name only
  // when the key format is unrecognised. Never name-only: a key named
  // "Claude API" that is actually an OpenAI key must NOT be sent to Anthropic.
  let provider = providerForKey(integration.apiKey);
  if (!provider) {
    const nameLower = (integration.name || "").toLowerCase();
    if (nameLower.includes("openrouter")) {
      provider = "openrouter";
    } else if (nameLower.includes("openai") || nameLower.includes("gpt")) {
      provider = "openai";
    } else if (nameLower.includes("gemini") || nameLower.includes("google")) {
      provider = "gemini";
    } else {
      provider = "anthropic";
    }
  }

  return {
    id: integration.id,
    name: integration.name,
    apiKey: integration.apiKey!,
    provider,
  };
}

/**
 * Get the Anthropic API key for the user.
 * Both trial and paid users must add their own API key in Integrations (no env fallback).
 *
 * @param userId - The user ID (uses org owner's integrations for team members)
 * @returns The Anthropic API key to use
 * @throws Error if no API key is available
 */
/**
 * Pure key-precedence resolver (RA-6799 follow-up). A user-supplied (BYOK)
 * Anthropic key wins; otherwise free/trial users fall back to the platform key
 * from the secure ANTHROPIC_API_KEY env var. Throws only when neither exists.
 * Key prefix is authoritative — a non-Anthropic key is refused either way.
 */
export function selectAnthropicApiKey(
  integrationKey: string | null | undefined,
  envKey: string | null | undefined,
): string {
  if (integrationKey) {
    const p = providerForKey(integrationKey);
    if (p && p !== "anthropic") {
      throw new Error(
        "The configured Anthropic integration holds a non-Anthropic API key; refusing to use it. Re-add your Anthropic key in Settings → Integrations.",
      );
    }
    return integrationKey;
  }

  const env = envKey?.trim();
  if (env) {
    const p = providerForKey(env);
    if (p && p !== "anthropic") {
      throw new Error(
        "ANTHROPIC_API_KEY is set but does not look like an Anthropic key; refusing to use it.",
      );
    }
    return env;
  }

  throw new Error(
    "No Anthropic API key available. Set ANTHROPIC_API_KEY in the environment, or add your Anthropic key in Settings → Integrations.",
  );
}

export async function getAnthropicApiKey(userId: string): Promise<string> {
  const integrations = await getIntegrationsForUser(userId, {
    status: "CONNECTED",
    nameContains: ["Anthropic", "Claude"],
  });

  const integration = integrations.find(
    (i) =>
      i.name === "Anthropic Claude" ||
      i.name === "Anthropic API" ||
      i.name.toLowerCase().includes("anthropic"),
  );

  // BYOK integration key first, then the platform ANTHROPIC_API_KEY env var.
  return selectAnthropicApiKey(
    integration?.apiKey,
    process.env.ANTHROPIC_API_KEY,
  );
}

/**
 * Call the appropriate AI provider based on integration type
 */
export async function callAIProvider(
  integration: AIIntegration,
  options: {
    system?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    /**
     * OpenRouter model slug (e.g. "deepseek/deepseek-chat"). Only consulted by
     * the "openrouter" branch; the fixed-vendor branches use their own models.
     */
    model?: string;
  },
): Promise<string> {
  const { system, prompt, maxTokens = 16000, temperature = 0.7 } = options;

  // Defence in depth: never send a key to a vendor it does not belong to.
  // If the key's prefix contradicts its configured provider, fail closed
  // rather than leak the key to the wrong vendor's endpoint.
  const keyProvider = providerForKey(integration.apiKey);
  if (keyProvider && keyProvider !== integration.provider) {
    throw new Error(
      `API key format (${keyProvider}) does not match its configured provider (${integration.provider}); refusing to send the key to the wrong vendor.`,
    );
  }

  switch (integration.provider) {
    case "anthropic": {
      const anthropic = new Anthropic({
        apiKey: integration.apiKey,
      });

      const messages: any[] = [
        {
          role: "user",
          content: prompt,
        },
      ];

      // Use tryClaudeModels for automatic fallback to working models
      // Use prompt caching for cost optimization (90% savings on cache hits)
      const response = await tryClaudeModels(
        anthropic,
        {
          system: system ? [createCachedSystemPrompt(system)] : undefined,
          messages,
          max_tokens: maxTokens,
        },
        undefined, // use default models
        {
          agentName: "AIProvider",
          enableCacheMetrics: true,
        },
      );

      if (
        response.content &&
        response.content.length > 0 &&
        response.content[0].type === "text"
      ) {
        return response.content[0].text;
      }

      throw new Error("Unexpected response format from Anthropic");
    }

    case "openai": {
      const openai = new OpenAI({
        apiKey: integration.apiKey,
      });

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (system) {
        messages.push({
          role: "system",
          content: system,
        });
      }

      messages.push({
        role: "user",
        content: prompt,
      });

      // OpenAI models have different max_tokens limits
      // gpt-4-turbo-preview supports max 4096 completion tokens
      // Use a safer limit for OpenAI
      const openaiMaxTokens = Math.min(maxTokens, 4096);

      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages,
        max_tokens: openaiMaxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      return content;
    }

    case "openrouter": {
      // OpenRouter exposes an OpenAI-compatible Chat Completions API, so we
      // reuse the OpenAI SDK with its base URL. The model is a routing slug
      // (namespace/model) resolved by precedence: per-call option → the
      // workspace's stored default → env → a stable fallback. Attribution
      // headers are optional per OpenRouter's docs.
      const model =
        options.model ||
        integration.model ||
        process.env.OPENROUTER_MODEL ||
        "deepseek/deepseek-chat";

      const referer = process.env.OPENROUTER_SITE_URL;
      const openrouter = new OpenAI({
        apiKey: integration.apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "X-Title": "RestoreAssist",
          ...(referer ? { "HTTP-Referer": referer } : {}),
        },
      });

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (system) {
        messages.push({ role: "system", content: system });
      }
      messages.push({ role: "user", content: prompt });

      // Pass maxTokens through unchanged — per-model output caps vary across
      // OpenRouter, and the caller owns the value (default 16 000).
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in OpenRouter response");
      }

      return content;
    }

    case "gemini": {
      const genAI = new GoogleGenerativeAI(integration.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      let fullPrompt = prompt;
      if (system) {
        fullPrompt = `${system}\n\n${prompt}`;
      }

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error("No content in Gemini response");
      }

      return text;
    }

    default:
      throw new Error(`Unsupported AI provider: ${integration.provider}`);
  }
}
