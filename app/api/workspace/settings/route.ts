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
type SettingKey = (typeof SETTING_KEYS)[number];

type WorkspaceSettings = Record<string, never>;

function isSettingKey(value: unknown): value is SettingKey {
  return (
    typeof value === "string" &&
    (SETTING_KEYS as readonly string[]).includes(value as SettingKey)
  );
}

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

    const updates: Partial<Record<SettingKey, boolean>> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!isSettingKey(key)) {
        return NextResponse.json(
          { error: `Unknown setting key: ${key}`, allowed: SETTING_KEYS },
          { status: 400 },
        );
      }
      if (typeof value !== "boolean") {
        return apiError(req, {
          code: "VALIDATION",
          message: `Setting ${key} must be a boolean`,
          status: 400,
        });
      }
      // `isSettingKey` narrows `key` to SettingKey, which is `never` while
      // SETTING_KEYS is empty — the guard above always returns 400 first, so
      // this assignment is unreachable today and TypeScript rightly refuses
      // `boolean` against an index type of `never`. The cast keeps the loop
      // compiling in both states. Delete it once SETTING_KEYS has a member
      // again: the assignment will then type on its own.
      (updates as Record<string, boolean>)[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return apiError(req, {
        code: "VALIDATION",
        message: "No settings to update",
        status: 400,
      });
    }

    // Unreachable until SETTING_KEYS is non-empty again — kept for structure.
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: updates,
      select: { id: true },
    });

    return NextResponse.json({
      workspaceId: workspace.id,
      settings: {} satisfies WorkspaceSettings,
    });
  } catch (error) {
    return fromException(req, error, { stage: "settings-patch" });
  }
}
