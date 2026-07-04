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
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
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

  const workspace = await getWorkspaceForUser(userId);
  if (!workspace) {
    return {
      allowed: false,
      reason: "NO_WORKSPACE",
      sku,
      response: addonRequiredResponse(sku, "NO_WORKSPACE"),
    };
  }

  const entitlement = await prisma.featureEntitlement.findUnique({
    where: { workspaceId_sku: { workspaceId: workspace.id, sku } },
    select: { id: true, active: true },
  });

  if (!entitlement || !entitlement.active) {
    return {
      allowed: false,
      reason: "NOT_ENTITLED",
      sku,
      response: addonRequiredResponse(sku, "ADDON_REQUIRED"),
    };
  }

  return { allowed: true, sku, workspaceId: workspace.id };
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
