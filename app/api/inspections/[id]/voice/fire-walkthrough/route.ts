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
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { fireActionSchema, type FireActionResponse, type FireWalkthroughResponse } from "@/lib/voice/fire-smoke/schema";
import {
  isFireWalkthroughApplicable,
  loadFireWalkthrough,
  type FireDb,
} from "@/lib/voice/fire-smoke/server";
import { nextStep, runFireAction, type FireActionDb } from "@/lib/voice/fire-smoke/actions";

type RouteContext = { params: Promise<{ id: string }> };

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
      select: { id: true, claimType: true },
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

      const result = await writeWithinInspectionScope(
        tenancy.data.inspectionManyWhere,
        { updatedAt: new Date() },
        (tx) => runFireAction(tx as unknown as FireActionDb, { inspectionId: id, userId }, action),
      );
      if (!result) return notFound(req);
      if (!result.ok) return NextResponse.json(result.body, { status: result.httpStatus });

      const body: FireActionResponse = {
        applicable: true,
        status: result.status,
        outcome: result.outcome,
        ...nextStep(result.status),
      };
      return NextResponse.json(body);
    } catch (error) {
      return fromException(req, error, { stage: "fire-walkthrough-action" });
    }
  });
}
