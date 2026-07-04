/**
 * RA-6922 (P1) — BYOK monetisation entitlement layer (public surface).
 */

export {
  ADDON_SKUS,
  isAddonSku,
  type AddonSku,
} from "./types";

export {
  requireAddon,
  requireAddonOrThrow,
  AddonNotEntitledError,
  type AddonDenyReason,
  type AddonGateAllowed,
  type AddonGateBlocked,
  type AddonGateResult,
} from "./require-addon";
