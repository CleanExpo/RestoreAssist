/**
 * RA-8001 slice 1d-i — the two gates workflow create and execute run before
 * any row is written or any task is claimed.
 *
 *   G1         the caller's effective plan is current (hasActiveSubscription).
 *              Route-local: the executor itself has no subscription gate
 *              until 1d-iii, which is why advance-workflows and
 *              dead-letter-review stay out of the production schedule.
 *   Preflight  the caller's Anthropic key passes the same refusal predicate
 *              callAI applies (resolveAgentAiKey), so a funded trial with no
 *              key of its own is told to add one instead of failing a task.
 *
 * Each returns the refusal response, or null to proceed. A DB read that
 * throws is a 503 GOVERNOR_UNAVAILABLE (logged via apiError's reportError),
 * never a pass.
 */
import type { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { hasActiveSubscription } from "@/lib/billing/subscription-gate";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import {
  BYOK_ONLY_AGENT_SLUGS,
  PlatformKeyRefusedError,
  resolveAgentAiKey,
} from "./ai-bridge";

export interface AgentGateContext {
  /** Route label for the refusal log line, e.g. "agents-workflow-create". */
  route: string;
  userId: string;
  /** Extra ids for the 503 report: workflowId or inspectionId/reportId. */
  ids?: Record<string, string | undefined>;
}

/** True when any of these agent slugs must run on the workspace's own key. */
export function needsByokKey(agentSlugs: readonly string[]): boolean {
  return agentSlugs.some((slug) =>
    (BYOK_ONLY_AGENT_SLUGS as readonly string[]).includes(slug),
  );
}

async function logRefusal(ctx: AgentGateContext, code: string): Promise<void> {
  let subscriptionStatus: string | null = null;
  try {
    subscriptionStatus =
      (await getEffectiveSubscription(ctx.userId))?.subscriptionStatus ?? null;
  } catch {
    subscriptionStatus = "unreadable";
  }
  console.info("[agent-gate-refusal]", {
    route: ctx.route,
    userId: ctx.userId,
    code,
    subscriptionStatus,
  });
}

function unavailable(
  request: NextRequest,
  ctx: AgentGateContext,
  reason: "subscription-gate" | "key-preflight",
  err: unknown,
): NextResponse {
  return apiError(request, {
    code: "GOVERNOR_UNAVAILABLE",
    message: "AI access could not be checked right now. Please try again shortly.",
    status: 503,
    err,
    stage: ctx.route,
    context: { userId: ctx.userId, reason, ...ctx.ids },
  });
}

/** G1: 402 AI_SUBSCRIPTION_INACTIVE when the plan is not current. */
export async function agentSubscriptionGate(
  request: NextRequest,
  ctx: AgentGateContext,
): Promise<NextResponse | null> {
  let current: boolean;
  try {
    current = await hasActiveSubscription(ctx.userId);
  } catch (err) {
    return unavailable(request, ctx, "subscription-gate", err);
  }
  if (current) return null;
  await logRefusal(ctx, "AI_SUBSCRIPTION_INACTIVE");
  return apiError(request, {
    code: "AI_SUBSCRIPTION_INACTIVE",
    message:
      "Your RestoreAssist plan is not active. Renew your plan to run agent workflows.",
    status: 402,
  });
}

/**
 * Key preflight: 402 PAYMENT_REQUIRED when the caller's key would be refused
 * (platform source, the platform key under a BYOK label, or no key at all).
 */
export async function agentKeyPreflight(
  request: NextRequest,
  ctx: AgentGateContext,
): Promise<NextResponse | null> {
  try {
    await resolveAgentAiKey(ctx.userId, "byok-only");
    return null;
  } catch (err) {
    if (!(err instanceof PlatformKeyRefusedError)) {
      return unavailable(request, ctx, "key-preflight", err);
    }
    await logRefusal(ctx, "PAYMENT_REQUIRED");
    return apiError(request, {
      code: "PAYMENT_REQUIRED",
      message: err.message,
      status: 402,
    });
  }
}
