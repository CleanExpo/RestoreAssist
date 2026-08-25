/**
 * Workspace settings API
 *
 * GET    /api/workspace/settings — read workspace-level feature flags
 * PATCH  /api/workspace/settings — update whitelisted feature flags
 *
 * Floor-plan auto-fetch is NO LONGER a workspace setting — it follows the
 * active FLOORPLAN_UNDERLAY entitlement. The DB column
 * `autoFetchFloorPlanOnInspection` remains for schema compatibility but is
 * not exposed here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import { hasPermission } from "@/lib/workspace/permissions";
import { apiError, fromException } from "@/lib/api-errors";

/** Whitelisted boolean settings. Add new keys here as they ship. */
const SETTING_KEYS = [] as const;

type WorkspaceSettings = Record<string, never>;

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

    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    // Touch workspace so a missing row still 404s via payment gate / lookup.
    await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { id: true },
    });

    const settings: WorkspaceSettings = {};

    return NextResponse.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      settings,
    });
  } catch (error) {
    return fromException(_req, error, { stage: "settings-get" });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;

    const gate = await checkPaymentGate(userId);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const allowed = await hasPermission(
      userId,
      workspace.id,
      "workspace.settings",
    );
    if (!allowed) {
      return apiError(req, {
        code: "FORBIDDEN",
        message:
          "Forbidden — only workspace owners and managers may change workspace settings",
        status: 403,
      });
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid request body",
        status: 400,
      });
    }

    // Reject legacy floor-plan toggle explicitly so old clients get a clear message.
    if ("autoFetchFloorPlanOnInspection" in body) {
      return NextResponse.json(
        {
          error:
            "autoFetchFloorPlanOnInspection was removed. Floor plan listing fetch runs automatically when the Floor Plan Underlay add-on is active.",
          code: "SETTING_REMOVED",
        },
        { status: 410 },
      );
    }

    const [unknownKey] = Object.keys(body);
    if (!unknownKey) {
      return apiError(req, {
        code: "VALIDATION",
        message: "No settings to update",
        status: 400,
      });
    }

    return NextResponse.json(
      { error: `Unknown setting key: ${unknownKey}`, allowed: SETTING_KEYS },
      { status: 400 },
    );
  } catch (error) {
    return fromException(req, error, { stage: "settings-patch" });
  }
}
