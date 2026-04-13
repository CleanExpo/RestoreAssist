/**
 * Pilot Survey Status
 *
 * GET /api/pilot/survey-status
 *   Returns whether the authenticated technician has already submitted a
 *   CLAIM-005 ease-of-use survey response. Used by the survey UI to decide
 *   whether to show the prompt.
 *
 *   Response:
 *     { hasResponded: boolean, responseCount: number }
 *
 * No body required — user is identified from session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.pilotObservation.count({
      where: {
        claimId: "CLAIM-005",
        observationType: "technician_survey",
        recordedByUserId: session.user.id,
      },
    });

    return NextResponse.json({
      hasResponded: count > 0,
      responseCount: count,
    });
  } catch (error) {
    console.error("Error checking survey status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
