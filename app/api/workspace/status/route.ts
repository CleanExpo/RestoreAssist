/**
 * RA-415: Workspace Status API
 *
 * GET /api/workspace/status
 *   Returns the current workspace status for the authenticated user.
 *   Used by the frontend to poll during the PROVISIONING → READY transition
 *   after Stripe checkout completes.
 *
 * Response codes:
 *   200 — workspace found, or none (hasWorkspace: false for invited/legacy)
 *   401 — not authenticated
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWorkspaceStatus } from "@/lib/workspace/payment-gate";
import { ensureWorkspaceForUser } from "@/lib/workspace/provision";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    let statusResult = await getWorkspaceStatus(session.user.id);

    // Signup / Google users historically got an Organization but no Workspace
    // until Stripe webhook or provider-settings lazy provision. Repair on read
    // so the dashboard and AI-key flows stop 404ing in production.
    if (!statusResult) {
      try {
        await ensureWorkspaceForUser(session.user.id);
        statusResult = await getWorkspaceStatus(session.user.id);
      } catch (provisionErr) {
        console.error("[workspace/status] ensureWorkspaceForUser failed", provisionErr);
      }
    }

    if (!statusResult) {
      return NextResponse.json({
        hasWorkspace: false,
        status: null,
        workspaceId: null,
        ready: false,
        message:
          "No workspace for this account yet — owners get one automatically after subscribe; invited staff use the org workspace through their role.",
      });
    }

    return NextResponse.json({
      hasWorkspace: true,
      status: statusResult.status,
      workspaceId: statusResult.workspaceId,
      workspaceName: statusResult.workspaceName,
      ready: statusResult.status === "READY",
      retryAfterMs: statusResult.status === "PROVISIONING" ? 3000 : null,
      // This is deliberately DB-owned. Production workspaces have the field
      // false by default and never self-label based on host/name/env values.
      ...(statusResult.pilotSandboxEnabled
        ? { sandboxMarker: "RESTOREASSIST_PILOT_SANDBOX_V1" }
        : {}),
    });
  } catch (error) {
    return fromException(_req, error, { stage: "status" });
  }
}
