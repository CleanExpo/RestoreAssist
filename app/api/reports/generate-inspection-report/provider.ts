/**
 * resolveReportProvider — reads the new ProviderConnection store (Task 2's
 * BYOK store) to determine which AI provider to use for report generation.
 *
 * Priority: ANTHROPIC first (preferred), then OPENAI, then GOOGLE (Gemini),
 * then OPENROUTER. Returns null when no workspace exists or no active key is
 * available for a supported provider.
 *
 * This allows a client who installed a key via the AI-providers page to have
 * their reports routed to that provider, independent of the old Integration
 * store checked by getLatestAIIntegration.
 */

import type { AIIntegration } from "@/lib/ai-provider";
import {
  getWorkspaceForUser,
  listProviderConnections,
  getProviderCredentials,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { aiProviderToCallProvider } from "@/lib/workspace/ai-key-type";

/**
 * Preferred provider resolution order. ANTHROPIC first because it supports
 * the full 16 000-token output needed for a 13-section report. OPENAI is
 * capped at 4 096 tokens in callAIProvider but is still a valid fallback.
 * GOOGLE (Gemini) follows first-party OpenAI. OPENROUTER is last — opt-in.
 */
const PREFERRED_PROVIDERS: AiProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE",
  "OPENROUTER",
];

/**
 * Resolve which AI provider to use for report generation by reading the
 * ProviderConnection (new BYOK) store — the same store the setup gate checks.
 *
 * @param userId - The authenticated user's ID
 * @returns An AIIntegration-compatible object ready to pass to callAIProvider,
 *          or null if no workspace / no active supported key is found.
 */
export async function resolveReportProvider(
  userId: string,
): Promise<AIIntegration | null> {
  // 1. Find the user's workspace
  const workspace = await getWorkspaceForUser(userId);
  if (!workspace) return null;

  // 2. List all provider connections (safe, masked keys — status only)
  const connections = await listProviderConnections(workspace.id);

  // 3. Pick the highest-priority ACTIVE provider
  for (const preferredProvider of PREFERRED_PROVIDERS) {
    const connection = connections.find(
      (c) => c.provider === preferredProvider && c.status === "ACTIVE",
    );
    if (!connection) continue;

    // 4. Retrieve the decrypted credentials (never exposed to API responses).
    //    getProviderCredentials also carries the OpenRouter model slug.
    const creds = await getProviderCredentials(workspace.id, preferredProvider);
    if (!creds?.apiKey) continue;

    const callProvider = aiProviderToCallProvider(preferredProvider);
    if (!callProvider) continue;

    // 5. Build an AIIntegration with lowercase provider to match callAIProvider's
    //    switch. For OPENROUTER, attach the workspace's stored model slug (if any)
    //    so callAIProvider routes to the user's chosen model.
    return {
      id: `byok-${preferredProvider.toLowerCase()}`,
      name: `${preferredProvider} (BYOK)`,
      apiKey: creds.apiKey,
      provider: callProvider,
      model: preferredProvider === "OPENROUTER" ? creds.model : undefined,
    };
  }

  return null;
}
