/**
 * Progress framework telemetry — RA-1392 / Motion M-17.
 *
 * The 8 event types from UX paper §8 §8 Telemetry. Funnels and KPIs in
 * lib/telemetry/funnels.ts and lib/telemetry/kpis.ts read off this table.
 *
 * Design rules:
 *   - emit() never throws across the service boundary — telemetry failure
 *     must not roll back a transition. We swallow + console.error.
 *   - All fields except eventName are optional; the writer fills in what it
 *     has at the call site.
 *   - Append-only — never UPDATE or DELETE rows.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const PROGRESS_TELEMETRY_EVENTS = [
  "progress.transition.attempt",
  "progress.transition.success",
  "progress.transition.blocked",
  "progress.transition.override",
  "progress.attestation.captured",
  "progress.evidence.missing",
  "progress.offline.queued",
  "progress.offline.synced",
] as const;

export type ProgressTelemetryEventName =
  (typeof PROGRESS_TELEMETRY_EVENTS)[number];

export interface EmitArgs {
  eventName: ProgressTelemetryEventName;
  claimProgressId?: string | null;
  transitionId?: string | null;
  transitionKey?: string | null;
  gateKey?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Write a telemetry event. Fire-and-forget — callers should not await unless
 * they need ordering guarantees (e.g. tests).
 */
export async function emit(args: EmitArgs): Promise<void> {
  try {
    await prisma.progressTelemetryEvent.create({
      data: {
        eventName: args.eventName,
        claimProgressId: args.claimProgressId ?? null,
        transitionId: args.transitionId ?? null,
        transitionKey: args.transitionKey ?? null,
        gateKey: args.gateKey ?? null,
        userId: args.userId ?? null,
        payload:
          args.payload == null
            ? Prisma.JsonNull
            : (args.payload as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    console.error("[telemetry.progress] emit failed", {
      eventName: args.eventName,
      err,
    });
  }
}

// ─── Convenience emitters ────────────────────────────────────────────────────

export const recordTransitionAttempt = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.transition.attempt" });

export const recordTransitionSuccess = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.transition.success" });

export const recordTransitionBlocked = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.transition.blocked" });

export const recordTransitionOverride = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> =>
  emit({ ...args, eventName: "progress.transition.override" });

export const recordAttestationCaptured = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> =>
  emit({ ...args, eventName: "progress.attestation.captured" });

export const recordEvidenceMissing = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.evidence.missing" });

export const recordOfflineQueued = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.offline.queued" });

export const recordOfflineSynced = (
  args: Omit<EmitArgs, "eventName">,
): Promise<void> => emit({ ...args, eventName: "progress.offline.synced" });
