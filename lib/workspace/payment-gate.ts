/**
 * RA-415: Payment Gate — workspace access enforcement utility.
 *
 * Provides server-side utilities to enforce that a user has a paid, READY workspace
 * before accessing workspace-scoped features.
 *
 * Usage in API routes:
 *   const gate = await checkPaymentGate(session.user.id);
 *   if (!gate.allowed) return gate.response;
 *
 * Usage as a guard (throws on failure):
 *   const workspace = await requireReadyWorkspace(session.user.id);
 *
 * Design decisions:
 * - "PROVISIONING" workspaces are not yet READY — return 402 with retry hint
 * - No workspace at all → redirect to /subscribe
 * - SUSPENDED workspace → 403 with billing portal link
 * - READY workspace → allowed, returns workspace context
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkspaceStatus = "PROVISIONING" | "READY" | "SUSPENDED";

export interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  ownerId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface PaymentGateAllowed {
  allowed: true;
  workspace: WorkspaceContext;
}

export interface PaymentGateBlocked {
  allowed: false;
  reason: "NO_WORKSPACE" | "PROVISIONING" | "SUSPENDED";
  response: NextResponse;
}

export type PaymentGateResult = PaymentGateAllowed | PaymentGateBlocked;

/**
 * Typed error thrown by requireReadyWorkspace() for non-HTTP contexts
 * (e.g. server actions, background jobs).
 */
export class PaymentGateError extends Error {
  constructor(
    public readonly reason: "NO_WORKSPACE" | "PROVISIONING" | "SUSPENDED",
    message: string,
  ) {
    super(message);
    this.name = "PaymentGateError";
  }
}

// ─── Core lookup ─────────────────────────────────────────────────────────────

/**
 * Look up the primary workspace for a user (first READY, then any).
 * Returns null if the user has no workspace at all.
 */
async function lookupUserWorkspace(
  userId: string,
): Promise<WorkspaceContext | null> {
  // Prefer READY workspace; fall back to any owned workspace
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: [
      // READY first, then others
      { status: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ownerId: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!workspace) return null;

  return workspace as WorkspaceContext;
}

// ─── Primary gate check ───────────────────────────────────────────────────────

/**
 * Check whether a user is allowed through the payment gate.
 *
 * Returns `{ allowed: true, workspace }` for READY workspaces,
 * or `{ allowed: false, reason, response }` with a pre-built NextResponse
 * for any blocked state.
 *
 * @example
 * const gate = await checkPaymentGate(session.user.id);
 * if (!gate.allowed) return gate.response;
 * // gate.workspace is now available
 */
export async function checkPaymentGate(
  userId: string,
): Promise<PaymentGateResult> {
  const workspace = await lookupUserWorkspace(userId);

  if (!workspace) {
    return {
      allowed: false,
      reason: "NO_WORKSPACE",
      response: NextResponse.json(
        {
          error: "No workspace found",
          code: "NO_WORKSPACE",
          action: "subscribe",
          redirectUrl: "/subscribe",
        },
        { status: 402 },
      ),
    };
  }

  if (workspace.status === "PROVISIONING") {
    return {
      allowed: false,
      reason: "PROVISIONING",
      response: NextResponse.json(
        {
          error: "Workspace is being set up — please try again shortly",
          code: "WORKSPACE_PROVISIONING",
          action: "retry",
          retryAfterMs: 5000,
        },
        { status: 202 },
      ),
    };
  }

  if (workspace.status === "SUSPENDED") {
    return {
      allowed: false,
      reason: "SUSPENDED",
      response: NextResponse.json(
        {
          error:
            "Workspace is suspended — update your billing to restore access",
          code: "WORKSPACE_SUSPENDED",
          action: "billing",
          redirectUrl: "/dashboard/subscription",
        },
        { status: 403 },
      ),
    };
  }

  // READY
  return { allowed: true, workspace };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the user has a READY workspace.
 * Lightweight — does not build a NextResponse.
 */
export async function hasReadyWorkspace(userId: string): Promise<boolean> {
  const count = await prisma.workspace.count({
    where: { ownerId: userId, status: "READY" },
  });
  return count > 0;
}

/**
 * Returns the READY workspace for the user, or throws PaymentGateError.
 * Use this in server actions and jobs where NextResponse is not appropriate.
 *
 * @throws {PaymentGateError} if no READY workspace exists
 */
export async function requireReadyWorkspace(
  userId: string,
): Promise<WorkspaceContext> {
  const workspace = await lookupUserWorkspace(userId);

  if (!workspace) {
    throw new PaymentGateError(
      "NO_WORKSPACE",
      "User has no workspace — subscription required",
    );
  }
  if (workspace.status === "PROVISIONING") {
    throw new PaymentGateError(
      "PROVISIONING",
      "Workspace is still being provisioned",
    );
  }
  if (workspace.status === "SUSPENDED") {
    throw new PaymentGateError(
      "SUSPENDED",
      "Workspace is suspended — billing update required",
    );
  }

  return workspace;
}

/**
 * Returns workspace status summary for the current user.
 * Safe to call even when no workspace exists — returns null in that case.
 */
export async function getWorkspaceStatus(
  userId: string,
): Promise<{ status: WorkspaceStatus; workspaceId: string } | null> {
  const workspace = await lookupUserWorkspace(userId);
  if (!workspace) return null;
  return { status: workspace.status, workspaceId: workspace.id };
}
