/**
 * RA-6801 — platform-managed trial credential.
 *
 * A TRIAL account with remaining report credits may generate reports on the
 * platform Anthropic key until they upgrade or add BYOK. Paid / expired /
 * zero-credit accounts must not reach that key (D-006 / D-022).
 *
 * This module is the single owner of that predicate. Gates (onboarding,
 * check-credits, setup byok_keys) and `resolveWorkspaceAiKey` must call
 * here — do not re-derive "is this a funded trial?" at the call site.
 */

import { getEffectiveSubscription, getOrganizationOwner } from "@/lib/organization-credits";
import { hasActiveOperatingProviderConnection } from "@/lib/workspace/provider-connections";
import type { AiProvider, ProviderConnectionStatus } from "@/lib/workspace/provider-connections";
import { listConfiguredAiConnections } from "@/lib/services/integrations/ai-connections";

export interface FundedTrialAccountInput {
  subscriptionStatus: string | null | undefined;
  creditsRemaining: number | null | undefined;
  trialEndsAt: Date | string | null | undefined;
  now?: Date;
}

export interface PlatformTrialEligibilityInput extends FundedTrialAccountInput {
  platformKeyPresent: boolean;
}

export interface PlatformTrialCoverage {
  /** Account eligibility only; independent of provider configuration. */
  fundedTrial: boolean;
  platformKeyPresent: boolean;
  /** A configured Anthropic connection is authoritative over platform fallback. */
  platformProviderStatus?: ProviderConnectionStatus;
  /** Funded trial, platform key present, and no configured Anthropic override. */
  canUsePlatformTrial: boolean;
}

/**
 * Account shape only — no credential. A funded trial is the D-022 audience:
 * platform should power Basic reports. Missing env must not be rewritten as
 * "this owner must paste a key" (RA-7569).
 */
export function isFundedTrialAccount(input: FundedTrialAccountInput): boolean {
  if (input.subscriptionStatus !== "TRIAL") return false;
  if ((input.creditsRemaining ?? 0) < 1) return false;

  if (input.trialEndsAt) {
    const endsAt = new Date(input.trialEndsAt);
    if (!Number.isNaN(endsAt.getTime())) {
      const now = input.now ?? new Date();
      if (endsAt.getTime() <= now.getTime()) return false;
    }
  }

  return true;
}

/**
 * Pure eligibility check — no I/O. Used by the async wrappers and by unit
 * tests that must prove both the pass and the fail-closed cases.
 */
export function isPlatformTrialEligible(
  input: PlatformTrialEligibilityInput,
): boolean {
  if (!input.platformKeyPresent) return false;
  return isFundedTrialAccount(input);
}

/**
 * Fail-closed: missing, blank, or non-Anthropic env values are not a
 * platform trial key. Prefix matches `providerForKey` in lib/ai-provider.ts
 * (sk-ant-…) so a mis-set OPENAI/OpenRouter secret cannot green the gate.
 */
export function isPlatformTrialApiKeyConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readPlatformTrialApiKey(env) !== null;
}

export function readPlatformTrialApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!key.startsWith("sk-ant-")) return null;
  return key;
}

/**
 * Split funded-trial eligibility from usable platform fallback. A configured
 * Anthropic connection remains authoritative, without changing trial funding.
 * Wizard / onboarding copy must use this — `canUsePlatformTrialCredential`
 * is fail-closed on a missing env key and must not decide the BYOK hard gate.
 */
export async function describePlatformTrialCoverage(
  userId: string,
): Promise<PlatformTrialCoverage> {
  const platformKeyPresent = isPlatformTrialApiKeyConfigured();
  const ownerId = (await getOrganizationOwner(userId)) || userId;
  const sub = await getEffectiveSubscription(ownerId);
  if (!sub) {
    return {
      fundedTrial: false,
      platformKeyPresent,
      canUsePlatformTrial: false,
    };
  }

  const fundedTrial = isFundedTrialAccount({
    subscriptionStatus: sub.subscriptionStatus,
    creditsRemaining: sub.creditsRemaining,
    trialEndsAt: sub.trialEndsAt,
  });

  // Presence metadata only: no decryption, provisioning or provider probe.
  // The resolver never substitutes platform credentials for a configured
  // Anthropic key, including one that is disabled, failed or unreadable.
  const canonical = fundedTrial
    ? await listConfiguredAiConnections(ownerId)
    : null;
  const platformProvider = canonical?.connections.find(
    (connection) => connection.provider === "ANTHROPIC",
  );

  return {
    fundedTrial,
    platformKeyPresent,
    ...(platformProvider ? { platformProviderStatus: platformProvider.status } : {}),
    canUsePlatformTrial: fundedTrial && platformKeyPresent && !platformProvider,
  };
}

/**
 * True when this user (or their org owner) is on an in-date TRIAL with at
 * least one report credit, the platform key is present, and no configured
 * Anthropic connection overrides platform fallback.
 */
export async function canUsePlatformTrialCredential(
  userId: string,
): Promise<boolean> {
  return (await describePlatformTrialCoverage(userId)).canUsePlatformTrial;
}

/**
 * Gate used by check-credits / Make a Report: BYOK wins; otherwise a funded
 * trial may proceed on the platform key.
 */
export async function hasReportGenerationCredential(
  userId: string,
): Promise<boolean> {
  const ownerId = (await getOrganizationOwner(userId)) || userId;
  if (await hasActiveOperatingProviderConnection(ownerId)) return true;
  return canUsePlatformTrialCredential(ownerId);
}

/**
 * Resolve the platform Anthropic key for a funded trial. Returns null when
 * the caller asked for a different provider, or the account is not eligible —
 * callers must then throw `NoWorkspaceKeyError` rather than read env themselves.
 */
export async function tryPlatformTrialApiKey(
  userId: string,
  provider: AiProvider,
): Promise<string | null> {
  if (provider !== "ANTHROPIC") return null;
  if (!(await canUsePlatformTrialCredential(userId))) return null;
  return readPlatformTrialApiKey();
}
