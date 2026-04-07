/**
 * RA-396: POST /api/inspections/[id]/voice/session
 * Creates a new voice copilot session for an inspection.
 *
 * Body: { mode?: "guided" | "assisted" | "dictation" }
 * Response: { session, greeting, pendingItems }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/voice/session";
import { checkCompletion, buildGreeting } from "@/lib/voice/completion-checker";
import type { VoiceCopilotMode } from "@/lib/voice/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: { id: true, userId: true, propertyAddress: true, status: true },
    });

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    if (inspection.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { mode?: VoiceCopilotMode } = {};
    try {
      body = await req.json();
    } catch {
      // mode is optional
    }

    const mode: VoiceCopilotMode = body.mode ?? "assisted";
    const voiceSession = createSession(inspection.id, session.user.id, mode);

    // Check what's missing
    const completionItems = await checkCompletion(inspection.id);
    const pendingItems = completionItems.filter((i) => !i.complete);

    // Build opening greeting
    const greeting = buildGreeting(
      completionItems,
      mode,
      inspection.propertyAddress,
    );

    return NextResponse.json({
      session: voiceSession,
      greeting,
      pendingItems,
    });
  } catch (error) {
    console.error("[POST /api/inspections/[id]/voice/session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/inspections/[id]/voice/session
 * Ends the voice session.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await req.json().catch(() => ({})) as { sessionId?: string };
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const { endSession } = await import("@/lib/voice/session");
    endSession(sessionId);

    return NextResponse.json({ status: "ended" });
  } catch (error) {
    console.error("[DELETE /api/inspections/[id]/voice/session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
