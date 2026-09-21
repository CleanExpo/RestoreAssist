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
 *
 * RA-7600: the 402 copy must distinguish a platform-key miss (ops fail;
 * the funded trial should have been covered) from a BYOK-required miss
 * (paid / expired / zero-credit). Same fail-closed throw; different message.
 */

import {
  getWorkspaceForUser,
  getProviderApiKey,
  getProviderCredentials,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import {
  describePlatformTrialCoverage,
  tryPlatformTrialApiKey,
} from "@/lib/ai/platform-trial-credential";
import {
  REPORT_GEN_PLATFORM_NOT_READY_BODY,
  reportGenByokRequiredBody,
} from "@/lib/signup-pricing-honesty";

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

/** Why resolveWorkspaceAiKey failed — copy, not a second fallback. */
export type NoWorkspaceKeyReason = "BYOK_REQUIRED" | "PLATFORM_NOT_READY";

export class NoWorkspaceKeyError extends Error {
  constructor(
    public readonly provider: AiProvider,
    public readonly reason: NoWorkspaceKeyReason = "BYOK_REQUIRED",
  ) {
    super(
      reason === "PLATFORM_NOT_READY"
        ? REPORT_GEN_PLATFORM_NOT_READY_BODY
        : reportGenByokRequiredBody(provider),
    );
    this.name = "NoWorkspaceKeyError";
  }
}

/**
 * Fail-closed credential miss. A funded trial whose platform key is absent
 * is an ops fail — never rewrite that as "add your own key" (RA-7600).
 */
export async function noWorkspaceKeyErrorForUser(
  userId: string,
  provider: AiProvider,
): Promise<NoWorkspaceKeyError> {
  const coverage = await describePlatformTrialCoverage(userId);
  if (coverage.fundedTrial && !coverage.platformKeyPresent) {
    return new NoWorkspaceKeyError(provider, "PLATFORM_NOT_READY");
  }
  return new NoWorkspaceKeyError(provider, "BYOK_REQUIRED");
}

/**
 * RA-7601 — client copy when report-gen cannot obtain a working key for a
 * reason other than `NoWorkspaceKeyError` (decrypt / store failure). Uses
 * the same two SSOT bodies as the 402 path. A funded trial is the D-022
 * audience: the platform should cover, so never rewrite as "add a key"
 * even if we never reached `tryPlatformTrialApiKey`.
 */
export async function reportGenUnexpectedKeyFailureCopy(
  userId: string,
  provider: AiProvider,
): Promise<string> {
  const coverage = await describePlatformTrialCoverage(userId);
  if (coverage.fundedTrial) {
    return REPORT_GEN_PLATFORM_NOT_READY_BODY;
  }
  return reportGenByokRequiredBody(provider);
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
    throw await noWorkspaceKeyErrorForUser(userId, provider);
  }

  const apiKey = await getProviderApiKey(workspace.id, provider);
  if (apiKey) {
    return { workspaceId: workspace.id, apiKey };
  }

  const trialKey = await tryPlatformTrialApiKey(userId, provider);
  if (trialKey) {
    return { workspaceId: workspace.id, apiKey: trialKey };
  }

  throw await noWorkspaceKeyErrorForUser(userId, provider);
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
