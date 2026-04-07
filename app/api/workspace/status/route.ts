/**
 * RA-415: Workspace Status API
 *
 * GET /api/workspace/status
 *   Returns the current workspace status for the authenticated user.
 *   Used by the frontend to poll during the PROVISIONING → READY transition
 *   after Stripe checkout completes.
 *
 * Response codes:
 *   200 — workspace found (status may be PROVISIONING | READY | SUSPENDED)
 *   401 — not authenticated
 *   404 — no workspace exists for this user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWorkspaceStatus } from "@/lib/workspace/payment-gate";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const statusResult = await getWorkspaceStatus(session.user.id);

    if (!statusResult) {
      return NextResponse.json(
        {
          hasWorkspace: false,
          status: null,
          workspaceId: null,
          message: "No workspace found — complete checkout to provision one",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      hasWorkspace: true,
      status: statusResult.status,
      workspaceId: statusResult.workspaceId,
      ready: statusResult.status === "READY",
      retryAfterMs: statusResult.status === "PROVISIONING" ? 3000 : null,
    });
  } catch (error) {
    console.error("[GET /api/workspace/status]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
