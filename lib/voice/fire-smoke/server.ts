/**
 * Server-side loaders for the fire and smoke walkthrough. The fire route
 * and the submit gate both call loadFireWalkthrough, so they read the same
 * rows the same way (spec §0 R1, R5, R6).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { FIRE_SECTION_IDS } from "./checklist";
import {
  ALL_FIRE_OBSERVATION_TYPES,
  FIRE_SECTION_OBSERVATION_TYPES,
  type FireObservationRow,
  type WalkthroughStatus,
} from "./schema";
import { computeWalkthroughStatus, evaluateFireGate } from "./status";
import { walkthroughAppliesAtLocation, type InspectionLocation } from "./jurisdiction";

/** The inspection fields the walkthrough rules read. */
export interface FireInspection extends InspectionLocation {
  id: string;
  claimType?: string | null;
}

/** The prisma surface these loaders need; a transaction client also fits. */
export interface FireDb {
  voiceCopilotObservation: {
    findMany(args: unknown): Promise<unknown[]>;
  };
  fireSmokeDamageAssessment?: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
}

export interface LoadedFireWalkthrough {
  observations: FireObservationRow[];
  sessionCount: number;
  status: WalkthroughStatus;
}

/** The write sequence a fire row stored in its parsed body; 0 when absent. */
function readSeq(parsed: unknown): number {
  const value = (parsed as { seq?: unknown } | null)?.seq;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Every fire observation on every session of this inspection. No endedAt
 * or expiresAt filter: a walkthrough outlives the session it started in.
 */
export async function loadFireWalkthrough(
  inspectionId: string,
  db: FireDb = prisma as unknown as FireDb,
  viewerUserId: string | null = null,
): Promise<LoadedFireWalkthrough> {
  const rows = (await db.voiceCopilotObservation.findMany({
    where: {
      type: { in: [...ALL_FIRE_OBSERVATION_TYPES] },
      session: { inspectionId },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      parsed: true,
      createdAt: true,
      sessionId: true,
      session: { select: { userId: true } },
    },
  })) as Array<
    Omit<FireObservationRow, "userId"> & {
      sessionId: string;
      session?: { userId?: string | null } | null;
    }
  >;
  const observations: FireObservationRow[] = rows.map(({ id, type, parsed, createdAt, session }) => ({
    id,
    userId: session?.userId ?? null,
    seq: readSeq(parsed),
    type,
    parsed,
    createdAt,
  }));
  const sessionCount = new Set(rows.map((r) => r.sessionId)).size;
  return {
    observations,
    sessionCount,
    status: computeWalkthroughStatus(FIRE_SECTION_IDS, observations, viewerUserId),
  };
}

/**
 * Applicable when the inspection is not positively outside Victoria (the
 * checklist is Victorian) AND the claim is fire and smoke in any spelling, a
 * fire assessment exists, or a walkthrough has already started. Once started
 * it stays applicable whatever later routes write to claimType.
 */
export async function isFireWalkthroughApplicable(
  inspection: FireInspection,
  loaded: LoadedFireWalkthrough,
  db: FireDb = prisma as unknown as FireDb,
): Promise<boolean> {
  if (!walkthroughAppliesAtLocation(inspection)) return false;
  if (normalizeClaimType(inspection.claimType) === "FIRE_SMOKE") return true;
  if (loaded.observations.some((o) => FIRE_SECTION_OBSERVATION_TYPES.includes(o.type as never))) {
    return true;
  }
  if (!db.fireSmokeDamageAssessment) return false;
  const assessment = await db.fireSmokeDamageAssessment.findFirst({
    where: { inspectionId: inspection.id },
    select: { id: true },
  });
  return assessment != null;
}

export interface FireSubmitGateResult {
  blocked: boolean;
  status?: number;
  body?: {
    error: string;
    code: "SECTIONS_OPEN" | "CHANGED_AFTER_SIGNOFF" | "UNSIGNED";
    openSectionIds: string[];
  };
}

/**
 * Submit gate. Keys on "walkthrough started", never on claimType alone, and
 * does not apply to an inspection outside Victoria (jurisdiction.ts).
 * Logs one line for every fire job, so a weekly review can see claims
 * submitted with no walkthrough at all.
 */
export async function checkFireSubmitGate(
  inspection: FireInspection,
  db: FireDb = prisma as unknown as FireDb,
): Promise<FireSubmitGateResult> {
  if (!walkthroughAppliesAtLocation(inspection)) return { blocked: false };
  const loaded = await loadFireWalkthrough(inspection.id, db);
  const { outcome, canSubmit } = evaluateFireGate(loaded.status);
  const isFireClaim = normalizeClaimType(inspection.claimType) === "FIRE_SMOKE";
  if (isFireClaim || loaded.status.started) {
    console.warn("[fire-walkthrough-gate]", {
      inspectionId: inspection.id,
      outcome,
      sessionCount: loaded.sessionCount,
      openSections: loaded.status.openSectionIds.length,
    });
  }
  if (canSubmit) return { blocked: false };
  const open = loaded.status.openSectionIds;
  const changed = outcome === "refused_changed";
  return {
    blocked: true,
    status: 422,
    body: {
      error: changed
        ? "The fire and smoke walkthrough changed after it was signed. The technician must review it and sign again before this job can be submitted."
        : open.length > 0
          ? "The fire and smoke walkthrough is not finished. Fill in or mark N/A every section, then sign off."
          : "The fire and smoke walkthrough has not been signed off by the technician.",
      code: changed ? "CHANGED_AFTER_SIGNOFF" : open.length > 0 ? "SECTIONS_OPEN" : "UNSIGNED",
      openSectionIds: open,
    },
  };
}

class FireGateMovedError extends Error {
  constructor(readonly result: FireSubmitGateResult) {
    super("Fire walkthrough changed while the job was being submitted");
  }
}

/**
 * Submit claim bound to the fire gate. The claim (the DRAFT to SUBMITTED
 * update) takes the inspection row lock first, and every fire write takes
 * the same lock (writeWithinInspectionScope), so the gate re-read here sees
 * every fire write committed before the claim, and no fire write can land
 * until this transaction ends. A refusal rolls the claim back. Ordering is
 * decided by the lock, never by comparing timestamps.
 */
export async function claimSubmitWithFireGate(
  db: Pick<typeof prisma, "$transaction">,
  inspection: FireInspection,
  claim: (tx: Prisma.TransactionClient) => Promise<{ count: number }>,
): Promise<{ count: number; fireBlock?: FireSubmitGateResult }> {
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await claim(tx);
      if (claimed.count === 0) return { count: 0 };
      const gate = await checkFireSubmitGate(inspection, tx as unknown as FireDb);
      if (gate.blocked) throw new FireGateMovedError(gate);
      return { count: claimed.count };
    });
  } catch (error) {
    if (error instanceof FireGateMovedError) return { count: 0, fireBlock: error.result };
    throw error;
  }
}
