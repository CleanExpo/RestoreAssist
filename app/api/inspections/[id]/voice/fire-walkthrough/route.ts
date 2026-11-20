/**
 * Fire and smoke make-safe walkthrough (Voice Copilot).
 *
 * GET  /api/inspections/[id]/voice/fire-walkthrough
 *   → FireWalkthroughResponse: applicability, status across every session
 *     of the job, and what Margot says next.
 * POST /api/inspections/[id]/voice/fire-walkthrough
 *   Body: FireAction (acknowledge_notice | capture | file | mark_na | sign_off)
 *   → FireActionResponse, or 400 / 403 / 404 / 422 with a reason.
 *
 * Walkthrough sign-off is NOT the RA-269 inspection signature: it neither
 * sets nor requires Inspection.signedAt. The submit route refuses a job
 * whose walkthrough has started but is not signed (lib/voice/fire-smoke/server.ts).
 *
 * The client sends one Idempotency-Key per capture and reuses it on retry.
 * The key is required. A successful answer and its cached reply commit in
 * ONE transaction, so a retry after a lost reply replays the reply and can
 * never write the answer twice (K12: a retry must not repeat a committed write).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import {
  completeIdempotentSuccessInTransaction,
  getIdempotencyKey,
  withIdempotency,
} from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import {
  fireActionSchema,
  type FireActionResponse,
  type FireBlockerBody,
  type FireWalkthroughResponse,
} from "@/lib/voice/fire-smoke/schema";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import {
  isFireWalkthroughApplicable,
  loadFireWalkthrough,
  type FireDb,
} from "@/lib/voice/fire-smoke/server";
import { nextStep, runFireAction, type FireActionDb } from "@/lib/voice/fire-smoke/actions";

type RouteContext = { params: Promise<{ id: string }> };

/** The idempotency reservation was gone when the answer tried to commit; the write rolled back. */
class IdempotencyReservationLostError extends Error {}

const notFound = (req: NextRequest) =>
  apiError(req, { code: "NOT_FOUND", message: "Inspection not found", status: 404 });

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const { id } = await params;
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) return notFound(req);
    const inspection = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true, claimType: true, propertyCountry: true, propertyPostcode: true },
    });
    if (!inspection) return notFound(req);

    const db = prisma as unknown as FireDb;
    const loaded = await loadFireWalkthrough(inspection.id, db, session.user.id);
    const applicable = await isFireWalkthroughApplicable(inspection, loaded, db);
    console.warn("[fire-walkthrough-applicability]", {
      inspectionId: inspection.id,
      claimType: inspection.claimType ?? null,
      applicable,
    });
    const body: FireWalkthroughResponse = {
      applicable,
      status: loaded.status,
      ...nextStep(loaded.status),
    };
    return NextResponse.json(body);
  } catch (error) {
    return fromException(req, error, { stage: "fire-walkthrough-get" });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;
  const keyResult = getIdempotencyKey(req);
  if (!keyResult.ok || !keyResult.key) {
    return apiError(req, { code: "VALIDATION", message: "Valid Idempotency-Key required", status: 400 });
  }
  const key = keyResult.key;

  // withIdempotency replays a stored reply before it calls the handler, so
  // current access is checked here first; a revoked caller never sees a
  // cached answer. The handler checks again to bind the write to the scope.
  const preflight = await assertInspectionAssignedWrite(session, id);
  if (!preflight.ok) return notFound(req);

  return withIdempotency(req, userId, async (rawBody) => {
    try {
      let json: unknown;
      try {
        json = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(req, { code: "VALIDATION", message: "Invalid JSON body", status: 400 });
      }
      const parsed = fireActionSchema.safeParse(json);
      if (!parsed.success) {
        return apiError(req, { code: "VALIDATION", message: "Invalid walkthrough action", status: 400 });
      }
      const action = parsed.data;

      const tenancy = await assertInspectionAssignedWrite(session, id);
      if (!tenancy.ok) return notFound(req);

      const voiceSession = await prisma.voiceCopilotSession.findFirst({
        where: { id: action.sessionId },
        select: { userId: true, inspectionId: true },
      });
      if (!voiceSession || voiceSession.userId !== userId || voiceSession.inspectionId !== id) {
        return apiError(req, { code: "FORBIDDEN", message: "Forbidden", status: 403 });
      }

      // The walkthrough can change only while the job is a DRAFT. The status
      // sits in the same locked update as the write, and submit moves DRAFT to
      // SUBMITTED under that row lock, so no answer or sign-off can land on a
      // submitted job (kind K13: no write after the record's terminal state).
      const result = await writeWithinInspectionScope(
        { ...tenancy.data.inspectionManyWhere, status: "DRAFT" },
        { updatedAt: new Date() },
        async (tx) => {
          const outcome = await runFireAction(tx as unknown as FireActionDb, { inspectionId: id, userId }, action);
          if (!outcome.ok) return { outcome, body: null };
          const body: FireActionResponse = {
            applicable: true,
            status: outcome.status,
            outcome: outcome.outcome,
            ...nextStep(outcome.status),
          };
          // The reply is cached in the same transaction as the answer.
          const completed = await completeIdempotentSuccessInTransaction({
            tx, scope: userId, key, method: "POST", path: req.nextUrl.pathname, rawBody,
            responseBody: JSON.stringify(body),
          });
          if (!completed) throw new IdempotencyReservationLostError();
          return { outcome, body };
        },
      );
      if (!result) {
        // Nothing was written. Only the message is chosen here: a job that
        // left DRAFT never returns to it through submit.
        const current = await prisma.inspection.findFirst({
          where: tenancy.data.inspectionManyWhere,
          select: { status: true },
        });
        if (current && current.status !== "DRAFT") {
          const body: FireBlockerBody = { error: FIRE_COPY.inspectionSubmitted, code: "INSPECTION_SUBMITTED", openSectionIds: [] };
          return NextResponse.json(body, { status: 422 });
        }
        return notFound(req);
      }
      if (!result.outcome.ok) return NextResponse.json(result.outcome.body, { status: result.outcome.httpStatus });
      return NextResponse.json(result.body, {
        headers: { "X-RestoreAssist-Idempotency-Completed-In-Transaction": "true" },
      });
    } catch (error) {
      if (error instanceof IdempotencyReservationLostError) {
        // Nothing was written. Keep the reservation so a retry waits for it
        // to lapse, then runs once.
        const response = apiError(req, {
          code: "CONFLICT", message: "The answer could not be confirmed. Try again.", status: 409,
        });
        response.headers.set("X-RestoreAssist-Idempotency-Uncertain", "true");
        return response;
      }
      return fromException(req, error, { stage: "fire-walkthrough-action" });
    }
  }, { successCompletedInHandler: "when-marked" });
}
