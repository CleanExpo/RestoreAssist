/** Fields owners may edit in Settings after setup (S2-2). */

export const ORGANIZATION_PROFILE_FIELDS = [
  "legalName",
  "tradingName",
  "state",
  "address",
  "phone",
  "email",
  "website",
  "logoUrl",
  "primaryColor",
  "accentColor",
  "aboutCopy",
] as const;

export type OrganizationProfileField =
  (typeof ORGANIZATION_PROFILE_FIELDS)[number];
