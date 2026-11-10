/**
 * Hard Floor add-on (feature flag: addon_hardfloor) — public API.
 * v1 is domain logic only; persistence, routes, UI and billing follow.
 */

export const HARDFLOOR_ADDON_FLAG = "addon_hardfloor" as const;

export * from "./types";
export * from "./sop-library";
export * from "./gates";
export * from "./estimate";
export * from "./walkthrough";
export * from "./maintenance";
