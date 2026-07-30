/**
 * Alternate home presentations for client comparison.
 * Same copy (see homeContent.ts); distinct visual identity per route.
 */
export const LANDING_HOMES = [
  {
    href: "/",
    label: "Home 1",
    pattern: "Dawn Split",
    description:
      "Asymmetric mist + workshop photo plane — operator-first daylight stack.",
  },
  {
    href: "/landing/claim-folio",
    label: "Home 2",
    pattern: "Claim Spine",
    description:
      "Diagonal paper cut over field photo — folio index and monumental type.",
  },
  {
    href: "/landing/operator-atlas",
    label: "Home 3",
    pattern: "Dual Plane",
    description:
      "Dual-plane film strip hero — workshop above, field below; headline-led.",
  },
] as const;

/** @deprecated Use LANDING_HOMES */
export const LANDING_CONCEPTS = LANDING_HOMES;

export type LandingHome = (typeof LANDING_HOMES)[number];
