/**
 * Landing presentations kept in the codebase after Home 2 was approved as `/`.
 * Not linked from the public nav — retained for reference / A-B archive.
 */
export const LANDING_HOMES = [
  {
    href: "/",
    label: "Home (live)",
    pattern: "Claim Spine",
    description:
      "Client-approved live homepage — diagonal paper cut over field photo.",
  },
  {
    href: "/landing/dawn-split",
    label: "Dawn Split (archive)",
    pattern: "Dawn Split",
    description:
      "Archived asymmetric mist + workshop photo stack — former Home 1.",
  },
  {
    href: "/landing/claim-folio",
    label: "Claim Spine (alias)",
    pattern: "Claim Spine",
    description: "Alias of the live homepage at /.",
  },
  {
    href: "/landing/operator-atlas",
    label: "Dual Plane (archive)",
    pattern: "Dual Plane",
    description:
      "Archived dual-plane film-strip hero — former Home 3.",
  },
] as const;

/** @deprecated Use LANDING_HOMES */
export const LANDING_CONCEPTS = LANDING_HOMES;

export type LandingHome = (typeof LANDING_HOMES)[number];
