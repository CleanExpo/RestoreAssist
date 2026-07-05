/**
 * RA-6921 (P0) — single required entry point for BYOK key resolution.
 *
 * The base plan ($99/month AUD) never spends RestoreAssist's own AI provider
 * keys on client workloads — every AI call must resolve the calling
 * workspace's own encrypted key from ProviderConnection. Any route that
 * instead reads `process.env.*_API_KEY` directly is a platform-spend leak.
 *
 * Route handlers must call `resolveWorkspaceAiKey` and catch
 * `NoWorkspaceKeyError` to return a 402 PAYMENT_REQUIRED — never fall
 * through to a platform env var.
 */

import {
  getWorkspaceForUser,
  getProviderApiKey,
  getProviderCredentials,
  type AiProvider,
} from "@/lib/workspace/provider-connections";

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
 * Throws `NoWorkspaceKeyError` if no workspace, or no ACTIVE key, is found —
 * callers must not catch-and-fall-back to a platform key.
 */
export async function resolveWorkspaceAiKey(
  userId: string,
  provider: AiProvider,
): Promise<ResolvedWorkspaceAiKey> {
  const workspace = await getWorkspaceForUser(userId);
  if (!workspace) {
    throw new NoWorkspaceKeyError(provider);
  }

  const apiKey = await getProviderApiKey(workspace.id, provider);
  if (!apiKey) {
    throw new NoWorkspaceKeyError(provider);
  }

  return { workspaceId: workspace.id, apiKey };
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
