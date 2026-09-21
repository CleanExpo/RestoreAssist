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

import { getEffectiveSubscription } from "@/lib/organization-credits";
import { hasActiveOperatingProviderConnection } from "@/lib/workspace/provider-connections";
import type { AiProvider } from "@/lib/workspace/provider-connections";

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
  /** In-date TRIAL with at least one report credit — platform should supply. */
  fundedTrial: boolean;
  platformKeyPresent: boolean;
  /** Funded trial AND a configured platform Anthropic key. */
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
 * Split "this account is a funded trial" from "the platform key is present".
 * Wizard / onboarding copy must use this — `canUsePlatformTrialCredential`
 * is fail-closed on a missing env key and must not decide the BYOK hard gate.
 */
export async function describePlatformTrialCoverage(
  userId: string,
): Promise<PlatformTrialCoverage> {
  const platformKeyPresent = isPlatformTrialApiKeyConfigured();
  const sub = await getEffectiveSubscription(userId);
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

  return {
    fundedTrial,
    platformKeyPresent,
    canUsePlatformTrial: fundedTrial && platformKeyPresent,
  };
}

/**
 * True when this user (or their org owner) is on an in-date TRIAL with at
 * least one report credit AND the platform Anthropic key is configured.
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
  if (await hasActiveOperatingProviderConnection(userId)) return true;
  return canUsePlatformTrialCredential(userId);
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
