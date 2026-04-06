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
import { getSession, addObservation, updateSessionState, updateMissingItems } from "@/lib/voice/session";
import { parseTranscript, buildConfirmationPrompt } from "@/lib/voice/transcript-parser";
import { checkCompletion } from "@/lib/voice/completion-checker";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { sessionId?: string; transcript?: string };

    if (!body.sessionId || !body.transcript) {
      return NextResponse.json(
        { error: "sessionId and transcript are required" },
        { status: 400 },
      );
    }

    const voiceSession = getSession(body.sessionId);
    if (!voiceSession) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 },
      );
    }

    if (voiceSession.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update session state to processing
    updateSessionState(body.sessionId, "processing");

    // Parse the transcript
    const { type, parsed, confidence, needsConfirmation } = parseTranscript(
      body.transcript,
    );

    // Add observation to session
    const observation = addObservation(
      body.sessionId,
      type,
      body.transcript,
      parsed,
      confidence,
      needsConfirmation,
    );

    if (!observation) {
      return NextResponse.json({ error: "Session error" }, { status: 500 });
    }

    // Build the confirmation prompt
    const confirmationPrompt = buildConfirmationPrompt(parsed, type, confidence);

    // If high-confidence and no confirmation needed, mark as stored directly
    const storedDirectly = confidence === "high" && !needsConfirmation;
    if (storedDirectly) {
      observation.storedAt = new Date().toISOString();
    }

    // Re-check completion (async, update session)
    const updatedItems = await checkCompletion(params.id);
    updateMissingItems(body.sessionId, updatedItems);

    // Return to responding state
    updateSessionState(body.sessionId, "responding");

    return NextResponse.json({
      observation,
      confirmationPrompt,
      storedDirectly,
      updatedMissingItems: updatedItems.filter((i) => !i.complete),
    });
  } catch (error) {
    console.error("[POST /api/inspections/[id]/voice/observation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
