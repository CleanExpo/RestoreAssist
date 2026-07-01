/**
 * RA-2967: Workspace settings API
 *
 * GET    /api/workspace/settings — read workspace-level feature flags
 * PATCH  /api/workspace/settings — update whitelisted feature flags
 *
 * Generic shape so future workspace-level toggles slot in without new endpoints.
 * Only fields in WHITELIST are readable/writable; unknown keys are rejected.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import { hasPermission } from "@/lib/workspace/permissions";
import { apiError, fromException } from "@/lib/api-errors";

// Whitelisted fields. Add new boolean flags here as they ship.
const SETTING_KEYS = ["autoFetchFloorPlanOnInspection"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

interface WorkspaceSettings {
  autoFetchFloorPlanOnInspection: boolean;
}

function isSettingKey(value: unknown): value is SettingKey {
  return (
    typeof value === "string" &&
    (SETTING_KEYS as readonly string[]).includes(value)
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

    const row = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { autoFetchFloorPlanOnInspection: true },
    });

    const settings: WorkspaceSettings = {
      autoFetchFloorPlanOnInspection:
        row?.autoFetchFloorPlanOnInspection ?? false,
    };

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
      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return apiError(req, {
        code: "VALIDATION",
        message: "No settings to update",
        status: 400,
      });
    }

    const row = await prisma.workspace.update({
      where: { id: workspace.id },
      data: updates,
      select: { autoFetchFloorPlanOnInspection: true },
    });

    const settings: WorkspaceSettings = {
      autoFetchFloorPlanOnInspection: row.autoFetchFloorPlanOnInspection,
    };

    return NextResponse.json({ workspaceId: workspace.id, settings });
  } catch (error) {
    return fromException(req, error, { stage: "settings-patch" });
  }
}
