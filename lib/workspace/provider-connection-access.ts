import type { NextRequest } from "next/server";
import { getEffectiveUserIdForIntegrations } from "@/lib/ai-provider";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import { hasPermission } from "@/lib/workspace/permissions";
import { ensureWorkspaceForUser } from "@/lib/workspace/provision";

/** Authorise the actor against the owner's exact workspace before provisioning. */
export async function authorizeProviderWorkspace(req: NextRequest, actorId: string) {
  const ownerId = await getEffectiveUserIdForIntegrations(actorId);
  let authorisedWorkspaceId: string | null = null;

  if (actorId !== ownerId) {
    const owned = await prisma.workspace.findFirst({
      where: { ownerId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!owned || !await hasPermission(actorId, owned.id, "workspace.settings")) {
      return { allowed: false as const, response: forbidden(req) };
    }
    authorisedWorkspaceId = owned.id;
  }

  // Signup can leave the owner's own workspace unprovisioned. Only the owner
  // or a member already authorised on that exact workspace may repair it.
  await ensureWorkspaceForUser(ownerId);
  const gate = await checkPaymentGate(ownerId);
  if (!gate.allowed) return gate;

  // The generic payment gate can fall back to a membership in another tenant.
  if (
    gate.workspace.ownerId !== ownerId ||
    (authorisedWorkspaceId !== null && gate.workspace.id !== authorisedWorkspaceId) ||
    !await hasPermission(actorId, gate.workspace.id, "workspace.settings")
  ) {
    return { allowed: false as const, response: forbidden(req) };
  }
  return gate;
}

function forbidden(req: NextRequest) {
  return apiError(req, {
    code: "FORBIDDEN",
    message: "Forbidden — only workspace owners and authorised members may configure AI providers",
    status: 403,
  });
}
