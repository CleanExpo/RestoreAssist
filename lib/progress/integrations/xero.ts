/**
 * xero.ts — M-11 (RA-1387)
 *
 * Progress-transition → Xero event dispatcher. Called by M-21 Sprint 1
 * `lib/progress/service.ts` AFTER a transition commits, on a fire-and-forget
 * path (CLAUDE.md rule 13 — never block a user-facing request).
 *
 * Design:
 *   - Pure dispatcher that maps `transitionKey` to one of three Xero actions
 *     (issue_invoice → create; record_payment → update; dispute → memo).
 *   - Every other transitionKey is a no-op fast-return — most stage
 *     transitions have nothing to do with Xero, and we must not generate
 *     spurious API calls (principle 7 deterministic fan-out).
 *   - Never throws. Failures return a structured `{ ok: false, reason }` so
 *     the caller can log to IntegrationSyncLog + queue a dead-letter retry.
 *   - Delegates GST + billing-completeness logic to the existing
 *     `lib/gst-treatment-rules.ts` (RA-875) and `lib/billing-completeness-check.ts`
 *     (RA-876). This module only WIRES the dispatch — it does not
 *     re-implement GST rules (explicit scope note on the ticket).
 *   - Idempotency: caller passes `transition.id`; handler keys outbound
 *     work by `${transition.id}:xero`. A replay of the same transition
 *     must not double-fire Xero calls. Idempotency-table persistence is
 *     left to the XeroClient layer (tracked per-PR in M-18 DocuSign/Xero
 *     procurement work); we pass the key through.
 *
 * The module is written with a DI-style `xeroDelegate` so vitest tests can
 * stub the actual Xero calls. Production code supplies the real delegate
 * that wraps `lib/integrations/xero.ts`. This keeps the module unit-testable
 * without a Xero account.
 */

/** Transition keys this handler recognises. All others → no-op. */
const XERO_RELEVANT_TRANSITIONS = new Set([
  "issue_invoice",
  "record_payment",
  "dispute",
] as const);

export type XeroRelevantTransitionKey = typeof XERO_RELEVANT_TRANSITIONS extends Set<infer U>
  ? U
  : never;

/**
 * Minimal transition + claim-progress shape the handler needs. Kept as a
 * structural subset (not a Prisma type import) so this module stays free
 * of the `@prisma/client` hard dependency — same pattern used in
 * `permissions.ts`. The M-21 service narrows its Prisma rows to this
 * shape at the call site.
 */
export interface TransitionRow {
  id: string;
  transitionKey: string;
  actorUserId: string;
  fromState: string;
  toState: string;
  createdAt: Date;
}

export interface ClaimProgressRow {
  id: string;
  reportId: string | null;
  inspectionId: string | null;
  state: string;
  carrierVariationThresholdPercent: number | null;
}

export interface XeroDispatchInput {
  transition: TransitionRow;
  claimProgress: ClaimProgressRow;
  /** Delegate that actually calls Xero. Production code supplies the real one; tests stub it. */
  xeroDelegate: XeroDelegate;
}

export interface XeroDispatchResult {
  ok: boolean;
  /** Always populated — principle 3. */
  reason: string;
  /** Dispatched action, or null if no-op. */
  action: "create_invoice" | "record_payment" | "append_dispute_memo" | "noop" | "error";
  /** Idempotency key we used (or would have used on the no-op). */
  idempotencyKey: string;
}

/**
 * Delegate contract. Returns `{ ok, reason }` — mirrors our own shape so
 * the dispatcher can forward the result verbatim. Each method is idempotent
 * (keyed by `idempotencyKey`).
 */
export interface XeroDelegate {
  createInvoice(args: {
    reportId: string | null;
    inspectionId: string | null;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; reason: string }>;

  recordPayment(args: {
    reportId: string | null;
    inspectionId: string | null;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; reason: string }>;

  appendDisputeMemo(args: {
    reportId: string | null;
    inspectionId: string | null;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; reason: string }>;
}

/**
 * Entry point. Fire-and-forget — caller should not await-and-throw;
 * failures are logged + dead-lettered by the caller.
 */
export async function handleProgressTransitionForXero(
  input: XeroDispatchInput,
): Promise<XeroDispatchResult> {
  const { transition, claimProgress, xeroDelegate } = input;
  const idempotencyKey = `${transition.id}:xero`;

  // Fast no-op path — most transitions don't touch Xero.
  if (!isXeroRelevant(transition.transitionKey)) {
    return {
      ok: true,
      reason: `No Xero action required for transition '${transition.transitionKey}'.`,
      action: "noop",
      idempotencyKey,
    };
  }

  // Defensive: Xero actions need at least one of reportId / inspectionId
  // to locate the invoice / payment / customer context. Without either
  // the handler can't dispatch.
  if (!claimProgress.reportId && !claimProgress.inspectionId) {
    return {
      ok: false,
      reason:
        `ClaimProgress ${claimProgress.id} has neither reportId nor inspectionId — ` +
        `cannot dispatch Xero action for transition '${transition.transitionKey}'.`,
      action: "error",
      idempotencyKey,
    };
  }

  const delegateArgs = {
    reportId: claimProgress.reportId,
    inspectionId: claimProgress.inspectionId,
    actorUserId: transition.actorUserId,
    idempotencyKey,
  };

  try {
    switch (transition.transitionKey) {
      case "issue_invoice": {
        const res = await xeroDelegate.createInvoice(delegateArgs);
        return {
          ok: res.ok,
          reason: res.reason,
          action: "create_invoice",
          idempotencyKey,
        };
      }
      case "record_payment": {
        const res = await xeroDelegate.recordPayment(delegateArgs);
        return {
          ok: res.ok,
          reason: res.reason,
          action: "record_payment",
          idempotencyKey,
        };
      }
      case "dispute": {
        const res = await xeroDelegate.appendDisputeMemo(delegateArgs);
        return {
          ok: res.ok,
          reason: res.reason,
          action: "append_dispute_memo",
          idempotencyKey,
        };
      }
      default:
        // Unreachable — isXeroRelevant gate above — but defensive.
        return {
          ok: true,
          reason: `Unhandled Xero-relevant transitionKey '${transition.transitionKey}' — no-op.`,
          action: "noop",
          idempotencyKey,
        };
    }
  } catch (err) {
    // Rule 13 fire-and-forget: never propagate the throw.
    const message =
      err instanceof Error ? err.message : "unknown error in Xero delegate";
    return {
      ok: false,
      reason: `Xero delegate threw for '${transition.transitionKey}': ${message}`,
      action: "error",
      idempotencyKey,
    };
  }
}

/** Exported for tests — narrow type guard that also documents the dispatch set. */
export function isXeroRelevant(transitionKey: string): transitionKey is XeroRelevantTransitionKey {
  return XERO_RELEVANT_TRANSITIONS.has(transitionKey as XeroRelevantTransitionKey);
}
