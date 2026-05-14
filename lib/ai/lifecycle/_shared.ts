/**
 * SP-A Task 4 — Lifecycle AI hook plumbing.
 *
 * Cross-hook plumbing called out in spec §5.2: subscription gate + atomic
 * credit deduction + AI build + fallback template + AuditLog row. SP-A
 * ships this minimum viable surface so on-close can use it; future hooks
 * (draft-invoice, next-action, etc.) extend the same helper.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 4.
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §5.
 */
import { prisma } from "@/lib/prisma";

/** Subscription statuses that grant AI access. Per CLAUDE.md rule 8. */
const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE"] as const;

export type LifecycleHookFailure = {
  ok: false;
  code: "SUBSCRIPTION_REQUIRED" | "INTERNAL_ERROR";
  message: string;
};

export type LifecycleHookSuccess<TDraft> = {
  ok: true;
  draft: TDraft;
  /** Where the draft came from. "fallback" means AI was unavailable; not an error. */
  source: "ai" | "byok" | "fallback";
};

export type LifecycleHookResult<TDraft> =
  | LifecycleHookSuccess<TDraft>
  | LifecycleHookFailure;

export interface LifecycleHookSpec<TInput, TDraft> {
  /** Stable identifier — used in the AuditLog action name. e.g. "close_summary". */
  feature: string;
  userId: string;
  /** Optional workspace/org id — surface where BYOK keys live. */
  orgId?: string | null;
  /** The hook-specific input the build+fallback functions consume. */
  input: TInput;
  /** Produces the AI draft. Throws on AI failure → fallback path is taken. */
  build: (ctx: { input: TInput; useByok: boolean }) => Promise<TDraft>;
  /** Deterministic template returned when AI is unavailable or credits exhausted. */
  fallback: (input: TInput) => TDraft;
  /** Inspection id to anchor the AuditLog row to. Required. */
  inspectionId: string;
}

/**
 * Runs a lifecycle AI hook honouring the §5.2 invariants:
 *   - Subscription allowlist (TRIAL/ACTIVE today; LIFETIME slot reserved).
 *   - Atomic credit deduction (rule 9) — never read-then-write.
 *   - BYOK fallback — skips credit deduction.
 *   - On zero credits → fallback template; NOT an error.
 *   - AuditLog row written regardless of source so admins can compare draft vs final.
 */
export async function runLifecycleHook<TInput, TDraft>(
  spec: LifecycleHookSpec<TInput, TDraft>,
): Promise<LifecycleHookResult<TDraft>> {
  // 1. Subscription gate.
  const user = await prisma.user.findUnique({
    where: { id: spec.userId },
    select: { subscriptionStatus: true, organizationId: true },
  });
  if (!user) {
    return {
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "User not found",
    };
  }
  const status = user.subscriptionStatus;
  if (
    !status ||
    !ALLOWED_SUBSCRIPTION_STATUSES.includes(
      status as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    return {
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: `Subscription status ${status ?? "MISSING"} not permitted`,
    };
  }

  // 2. BYOK detection — if the workspace has a ProviderConnection, route
  //    through the user's own key and skip platform credit deduction.
  const useByok = await detectByok(spec.orgId ?? user.organizationId);

  // 3. Atomic credit deduction (platform path only).
  if (!useByok && status === "TRIAL") {
    const result = await prisma.user.updateMany({
      where: { id: spec.userId, creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });
    if (result.count === 0) {
      // Zero credits — return fallback template, NOT an error.
      const draft = spec.fallback(spec.input);
      await writeAuditLog(spec, "fallback");
      return { ok: true, draft, source: "fallback" };
    }
  }

  // 4. Run the AI build. On internal failure, fall back to template so the
  //    user-facing journey never breaks (§13.5 subscription regression).
  try {
    const draft = await spec.build({ input: spec.input, useByok });
    await writeAuditLog(spec, useByok ? "byok" : "ai");
    return { ok: true, draft, source: useByok ? "byok" : "ai" };
  } catch (err) {
    console.error(
      `[lifecycle:${spec.feature}] build failed for user ${spec.userId}:`,
      err,
    );
    const draft = spec.fallback(spec.input);
    await writeAuditLog(spec, "fallback");
    return { ok: true, draft, source: "fallback" };
  }
}

async function detectByok(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  // ProviderConnection is keyed by workspaceId in this codebase; org ↔ workspace
  // is 1:1 for tradies today. If the org has any ACTIVE provider connection,
  // route through BYOK.
  const conn = await prisma.providerConnection.findFirst({
    where: { workspaceId: orgId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(conn);
}

async function writeAuditLog<TInput, TDraft>(
  spec: LifecycleHookSpec<TInput, TDraft>,
  source: "ai" | "byok" | "fallback",
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        inspectionId: spec.inspectionId,
        userId: spec.userId,
        action: `AI_GENERATED_${spec.feature.toUpperCase()}`,
        changes: JSON.stringify({ source }),
      },
    });
  } catch (err) {
    // Audit failures must not break the hook — log + swallow.
    console.error(`[lifecycle:${spec.feature}] AuditLog write failed:`, err);
  }
}
