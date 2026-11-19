/**
 * Wave 4 (W4-4) — auth for automation polling (Zapier custom apps).
 */

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

const MANAGER_ROLES = new Set(["ADMIN", "MANAGER"]);

export type AutomationAuth =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; status: 401 | 403; reason: string };

export async function assertAutomationV1Auth(
  request: NextRequest,
  session: Session | null,
): Promise<AutomationAuth> {
  const configuredKey = process.env.ZAPIER_API_KEY?.trim();
  const bearer = request.headers.get("authorization")?.trim();
  if (configuredKey && bearer?.startsWith("Bearer ")) {
    if (bearer !== `Bearer ${configuredKey}`) {
      return {
        ok: false,
        status: 401,
        reason: "Invalid automation API key",
      };
    }
  }
  if (
    configuredKey &&
    bearer === `Bearer ${configuredKey}` &&
    process.env.ZAPIER_ACT_AS_USER_ID?.trim()
  ) {
    const user = await prisma.user.findUnique({
      where: { id: process.env.ZAPIER_ACT_AS_USER_ID.trim() },
      select: { id: true, organizationId: true, role: true },
    });
    if (user?.organizationId && MANAGER_ROLES.has(user.role)) {
      return {
        ok: true,
        userId: user.id,
        organizationId: user.organizationId,
      };
    }
    return { ok: false, status: 403, reason: "Invalid automation service user" };
  }

  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, organizationId: true, role: true },
  });
  if (!user?.organizationId || !MANAGER_ROLES.has(user.role)) {
    return {
      ok: false,
      status: 403,
      reason: "Manager or admin role required",
    };
  }

  return {
    ok: true,
    userId: user.id,
    organizationId: user.organizationId,
  };
}