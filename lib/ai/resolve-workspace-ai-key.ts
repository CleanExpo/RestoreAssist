/**
 * RA-6921 (P0) — single required entry point for report-generation key
 * resolution.
 *
 * Paid workspaces must use their own encrypted ProviderConnection key.
 * RA-6801 / D-022 is the one explicit exception: an in-date TRIAL with
 * remaining credits may use the platform Anthropic key, via
 * `tryPlatformTrialApiKey` — never a raw `process.env.*_API_KEY` read in
 * a route, and never for ACTIVE / expired / zero-credit accounts.
 *
 * Route handlers must call `resolveWorkspaceAiKey` and catch
 * `NoWorkspaceKeyError` to return a 402 PAYMENT_REQUIRED.
 */

import {
  getWorkspaceForUser,
  getProviderApiKey,
  getProviderCredentials,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { tryPlatformTrialApiKey } from "@/lib/ai/platform-trial-credential";

export interface ResolvedWorkspaceAiKey {
  workspaceId: string;
  apiKey: string;
}

export interface ResolvedWorkspaceElevenLabsKey {
  workspaceId: string;
  apiKey: string;
  /** The workspace's default ElevenLabs Voice ID, if one was configured. */
  voiceId?: string;
}

export class NoWorkspaceKeyError extends Error {
  constructor(public readonly provider: AiProvider) {
    super(
      `No active ${provider} API key configured for this workspace. Add your own key in Workspace Settings -> AI Providers.`,
    );
    this.name = "NoWorkspaceKeyError";
  }
}

/**
 * Resolve the calling user's workspace-owned BYOK key for the given provider.
 * Funded trials may receive the platform Anthropic key (RA-6801). Everyone
 * else throws `NoWorkspaceKeyError` — callers must not add a second fallback.
 */
export async function resolveWorkspaceAiKey(
  userId: string,
  provider: AiProvider,
): Promise<ResolvedWorkspaceAiKey> {
  const workspace = await getWorkspaceForUser(userId);
  if (!workspace) {
    const trialKey = await tryPlatformTrialApiKey(userId, provider);
    if (trialKey) {
      return { workspaceId: "platform-trial", apiKey: trialKey };
    }
    throw new NoWorkspaceKeyError(provider);
  }

  const apiKey = await getProviderApiKey(workspace.id, provider);
  if (apiKey) {
    return { workspaceId: workspace.id, apiKey };
  }

  const trialKey = await tryPlatformTrialApiKey(userId, provider);
  if (trialKey) {
    return { workspaceId: workspace.id, apiKey: trialKey };
  }

  throw new NoWorkspaceKeyError(provider);
}

/**
 * ElevenLabs BYOK resolver (RA-6920 / RA-6998). ElevenLabs voice/SFX runs on
 * the calling workspace's OWN ElevenLabs key — never the platform key — so the
 * founder's zero-platform-cost model holds for audio the same way it does for
 * Anthropic/OpenAI. Returns the key plus the workspace's optional default Voice
 * ID; throws `NoWorkspaceKeyError` (mapped to a 402 by callers) when the
 * workspace has no ACTIVE ElevenLabs key — callers must not fall back to a
 * platform env key.
 */
export async function resolveWorkspaceElevenLabsKey(
  userId: string,
): Promise<ResolvedWorkspaceElevenLabsKey> {
  const workspace = await getWorkspaceForUser(userId);
  if (!workspace) {
    throw new NoWorkspaceKeyError("ELEVENLABS");
  }

  const credentials = await getProviderCredentials(workspace.id, "ELEVENLABS");
  if (!credentials) {
    throw new NoWorkspaceKeyError("ELEVENLABS");
  }

  return {
    workspaceId: workspace.id,
    apiKey: credentials.apiKey,
    voiceId: credentials.voiceId,
  };
}
