/**
 * RA-6922 (P1) — `requireAddon()` entitlement guard scaffold.
 *
 * Given a user + an add-on SKU, resolve whether that user's workspace has an
 * ACTIVE `FeatureEntitlement` for the add-on, and return a structured
 * allow/deny. The deny carries a pre-built 402 `NextResponse` in the same
 * shape as the payment gate (`lib/workspace/payment-gate.ts`) and the BYOK
 * key gate (`resolveWorkspaceAiKey` → `NoWorkspaceKeyError` → 402), so route
 * handlers can enforce it with the repo's standard idiom:
 *
 *   const gate = await requireAddon(session.user.id, "VOICE");
 *   if (!gate.allowed) return gate.response;
 *
 * SCOPE (RA-6922): this PR only adds the model, guard, migration and tests.
 * The guard is NOT wired into any live surface — default behaviour for every
 * existing user is unchanged. Wiring voice/Xero/Ascora/DR-NRPG/payments is the
 * sequenced P2 phase (byok-monetisation-spec §6) and is intentionally out of
 * scope here.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { isAddonSku, type AddonSku } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AddonDenyReason = "UNKNOWN_SKU" | "NO_WORKSPACE" | "NOT_ENTITLED";

export interface AddonGateAllowed {
  allowed: true;
  sku: AddonSku;
  workspaceId: string;
}

export interface AddonGateBlocked {
  allowed: false;
  reason: AddonDenyReason;
  /** The requested key — may be an invalid string when reason is UNKNOWN_SKU. */
  sku: string;
  response: NextResponse;
}

export type AddonGateResult = AddonGateAllowed | AddonGateBlocked;

/**
 * Typed error thrown by `requireAddonOrThrow()` for non-HTTP contexts
 * (server actions, background jobs) — mirrors `NoWorkspaceKeyError` /
 * `PaymentGateError`.
 */
export class AddonNotEntitledError extends Error {
  constructor(
    public readonly reason: AddonDenyReason,
    public readonly sku: string,
  ) {
    super(
      reason === "UNKNOWN_SKU"
        ? `Unknown add-on SKU "${sku}".`
        : `Add-on "${sku}" is not enabled for this workspace. Upgrade in Subscription settings.`,
    );
    this.name = "AddonNotEntitledError";
  }
}

// ─── Deny responses ───────────────────────────────────────────────────────────

function unknownSkuResponse(sku: string): NextResponse {
  // Guard misuse / invalid input — a 400, not a payment-required state.
  return NextResponse.json(
    { error: "Unknown add-on", code: "UNKNOWN_ADDON", sku },
    { status: 400 },
  );
}

function addonRequiredResponse(
  sku: string,
  code: "NO_WORKSPACE" | "ADDON_REQUIRED",
): NextResponse {
  return NextResponse.json(
    {
      error:
        code === "NO_WORKSPACE"
          ? "No workspace found — subscription required"
          : `The "${sku}" add-on is required for this feature`,
      code,
      sku,
      action: code === "NO_WORKSPACE" ? "subscribe" : "upgrade",
      redirectUrl:
        code === "NO_WORKSPACE" ? "/subscribe" : "/dashboard/subscription",
    },
    { status: 402 },
  );
}

// ─── Entitlement workspace ────────────────────────────────────────────────────

/**
 * RA-7893 — the workspace whose add-ons apply to this user, for READING an
 * entitlement only.
 *
 * Add-ons are bought by the business owner and belong to the owner's
 * workspace. Invite acceptance gives a technician or manager an
 * organizationId and no WorkspaceMember row, so resolving through the
 * member's own id found nothing and every add-on read as "subscription
 * required".
 *
 * Resolution: the organisation owner (`getOrganizationOwner`, which already
 * scopes MANAGER/USER to their own organisation's owner), falling back to the
 * user themselves when they have no organisation; then the oldest READY
 * workspace that user OWNS. A user removed from the organisation
 * (organizationId null) falls back to themselves and so gets only what they
 * own — never a lingering WorkspaceMember row.
 *
 * NOT for writes. `getWorkspaceForUser` is deliberately left keyed on the
 * caller: its other callers write provider API keys, and widening it would
 * let a technician write into the owner's workspace.
 */
export async function getEntitlementWorkspaceForUser(
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const ownerId = (await getOrganizationOwner(userId)) ?? userId;
  return getReadyWorkspaceOwnedBy(ownerId);
}

/**
 * The oldest READY workspace `ownerId` OWNS — the only workspace whose
 * add-ons an entitlement read may use. For callers that have already resolved
 * the organisation owner themselves.
 */
export async function getReadyWorkspaceOwnedBy(
  ownerId: string,
): Promise<{ id: string; name: string } | null> {
  // OWNED workspaces only. getWorkspaceForUser's WorkspaceMember fallback is
  // deliberately not used here: a membership row can point into another
  // organisation's workspace (an owner who is also a member elsewhere), or
  // outlive the user's removal from the organisation. Either would carry an
  // add-on across a tenant boundary. Workspace has no organisation column,
  // so ownership by the resolved owner is the binding.
  return prisma.workspace.findFirst({
    where: { ownerId, status: "READY" },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * RA-7893 — fail-closed boolean read of an add-on for the business a user
 * belongs to. For surfaces with no session user (the client portal) that
 * resolve the job's creator: any error reads as "not entitled", never as paid
 * content.
 */
export async function isAddonEntitledForUser(
  userId: string,
  sku: string,
): Promise<boolean> {
  try {
    const workspace = await getEntitlementWorkspaceForUser(userId);
    if (!workspace) return false;
    const gate = await requireAddonForWorkspace(workspace.id, sku);
    return gate.allowed;
  } catch {
    return false;
  }
}

// ─── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Resolve whether the calling user's workspace is entitled to the given add-on.
 *
 * @returns `{ allowed: true, sku, workspaceId }` when an ACTIVE entitlement
 *   exists, otherwise `{ allowed: false, reason, sku, response }` with a
 *   pre-built deny response (402 for NO_WORKSPACE/NOT_ENTITLED, 400 for an
 *   UNKNOWN_SKU).
 */
export async function requireAddon(
  userId: string,
  sku: string,
): Promise<AddonGateResult> {
  if (!isAddonSku(sku)) {
    return {
      allowed: false,
      reason: "UNKNOWN_SKU",
      sku,
      response: unknownSkuResponse(sku),
    };
  }

  const workspace = await getEntitlementWorkspaceForUser(userId);
  if (!workspace) {
    return {
      allowed: false,
      reason: "NO_WORKSPACE",
      sku,
      response: addonRequiredResponse(sku, "NO_WORKSPACE"),
    };
  }

  return requireAddonForWorkspace(workspace.id, sku);
}

/**
 * Workspace-keyed sibling of `requireAddon()`.
 *
 * WHY THIS EXISTS. Entitlement is stored per WORKSPACE — `FeatureEntitlement` is
 * keyed `@@unique([workspaceId, sku])` — but until now the only way to ask about
 * it was through a user id. That is fine for a dashboard route with a session,
 * and impossible for a surface that has no session user at all.
 *
 * The client portal is exactly that surface: `/portal/<token>` is opened by the
 * homeowner, who has no account. There is no user id to pass, and passing the
 * technician's would be wrong even where one is to hand — the add-on belongs to
 * the restoration firm that owns the job, not to whichever staff member last
 * touched it. Resolving through a user would also make the answer depend on
 * which technician is assigned, which is not what anyone is buying.
 *
 * `requireAddon()` now resolves the workspace and delegates here, so the
 * entitlement rule itself exists once. A second copy of this query is how the
 * two would quietly disagree — one honouring `active`, the other forgetting it,
 * for instance.
 *
 * The caller supplies the workspace id, so the caller owns proving it is the
 * right one. For the portal that means token -> Inspection -> owning workspace,
 * never a workspace id taken from user input.
 */
export async function requireAddonForWorkspace(
  workspaceId: string,
  sku: string,
): Promise<AddonGateResult> {
  if (!isAddonSku(sku)) {
    return {
      allowed: false,
      reason: "UNKNOWN_SKU",
      sku,
      response: unknownSkuResponse(sku),
    };
  }

  const entitlement = await prisma.featureEntitlement.findUnique({
    where: { workspaceId_sku: { workspaceId, sku } },
    select: { id: true, active: true },
  });

  // An entitlement row that exists but is inactive (cancelled, or expired by the
  // Stripe webhook) denies exactly like an absent one. Checking only for the
  // row's presence would keep a cancelled add-on working indefinitely.
  if (!entitlement || !entitlement.active) {
    return {
      allowed: false,
      reason: "NOT_ENTITLED",
      sku,
      response: addonRequiredResponse(sku, "ADDON_REQUIRED"),
    };
  }

  return { allowed: true, sku, workspaceId };
}

/**
 * Throwing variant for server actions / jobs where a `NextResponse` is not
 * appropriate. Resolves to the entitled workspace id or throws
 * `AddonNotEntitledError`.
 */
export async function requireAddonOrThrow(
  userId: string,
  sku: string,
): Promise<{ sku: AddonSku; workspaceId: string }> {
  const result = await requireAddon(userId, sku);
  if (!result.allowed) {
    throw new AddonNotEntitledError(result.reason, result.sku);
  }
  return { sku: result.sku, workspaceId: result.workspaceId };
}
