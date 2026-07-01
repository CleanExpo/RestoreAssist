/**
 * RA-396: POST /api/inspections/[id]/voice/observation
 * Accepts a raw STT transcript, parses it, stores it, returns a confirmation prompt.
 *
 * Body: { sessionId: string, transcript: string }
 * Response: { observation, confirmationPrompt, storedDirectly, updatedMissingItems }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getSession,
  addObservation,
  updateSessionState,
  updateMissingItems,
  markObservationStored,
} from "@/lib/voice/session";
import {
  parseTranscript,
  buildConfirmationPrompt,
} from "@/lib/voice/transcript-parser";
import { checkCompletion } from "@/lib/voice/completion-checker";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: voice observation appends to session state and triggers
  // completion-checker side effects — retry duplicates the observation.
  return withIdempotency(req, userId, async (rawBody) => {
    try {
      let body: { sessionId?: string; transcript?: string };
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(req, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      if (!body.sessionId || !body.transcript) {
        return apiError(req, {
          code: "VALIDATION",
          message: "sessionId and transcript are required",
          status: 400,
        });
      }

      const voiceSession = await getSession(body.sessionId);
      if (!voiceSession) {
        return apiError(req, {
          code: "NOT_FOUND",
          message: "Session not found or expired",
          status: 404,
        });
      }

      if (voiceSession.userId !== userId) {
        return apiError(req, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      // Update session state to processing
      await updateSessionState(body.sessionId, "processing");

      // Parse the transcript
      const { type, parsed, confidence, needsConfirmation } = parseTranscript(
        body.transcript,
      );

      // Add observation to session
      let observation = await addObservation(
        body.sessionId,
        type,
        body.transcript,
        parsed,
        confidence,
        needsConfirmation,
      );

      if (!observation) {
        return apiError(req, {
          code: "INTERNAL",
          message: "Session error",
          status: 500,
        });
      }

      // Build the confirmation prompt
      const confirmationPrompt = buildConfirmationPrompt(
        parsed,
        type,
        confidence,
      );

      // If high-confidence and no confirmation needed, mark as stored directly
      const storedDirectly = confidence === "high" && !needsConfirmation;
      if (storedDirectly) {
        observation =
          (await markObservationStored(body.sessionId, observation.id)) ??
          observation;
      }

      // Re-check completion (async, update session)
      const updatedItems = await checkCompletion(id);
      await updateMissingItems(body.sessionId, updatedItems);

      // Return to responding state
      await updateSessionState(body.sessionId, "responding");

      return NextResponse.json({
        observation,
        confirmationPrompt,
        storedDirectly,
        updatedMissingItems: updatedItems.filter((i) => !i.complete),
      });
    } catch (error) {
      return fromException(req, error, { stage: "voice-observation" });
    }
  });
}
