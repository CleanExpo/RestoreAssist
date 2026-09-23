/**
 * RA-7727: whose business details head a report.
 *
 * The business name, ABN, address and contact details a report is headed with
 * belong to the BUSINESS — they are saved on the workspace owner's User row
 * (Settings -> Business details). Report paths used to read the AUTHOR's row,
 * so a report written by an invited technician or manager came out headed
 * "RestoreAssist" or blank.
 *
 * Owner resolution mirrors getOrganizationOwner (lib/organization-credits.ts)
 * and the business-info block in app/api/user/profile/route.ts: an ADMIN owns
 * their own workspace; anyone else takes their Organization's owner.
 *
 * TENANCY: the owner is reached only THROUGH the author's own organization
 * relation (`organization.owner`), never looked up by a free id, so it can only
 * ever be the owner of the workspace the author belongs to.
 *
 * Falls back to the author's own details when the owner has saved no business
 * name, so nothing that printed before goes blank.
 */

const BUSINESS_FIELDS = {
  businessName: true,
  businessAddress: true,
  businessLogo: true,
  businessABN: true,
  businessPhone: true,
  businessEmail: true,
} as const;

/** Spread into a User `select` to load what workspaceBusiness() needs. */
export const WORKSPACE_OWNER_SELECT = {
  role: true,
  organization: { select: { owner: { select: BUSINESS_FIELDS } } },
} as const;

type BusinessFields = {
  businessName?: string | null;
  businessAddress?: string | null;
  businessLogo?: string | null;
  businessABN?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
};

type AuthorRow = BusinessFields & {
  role?: string | null;
  organization?: { owner?: BusinessFields | null } | null;
};

export function workspaceBusiness(author: AuthorRow): BusinessFields {
  const owner =
    author.role === "ADMIN" ? null : (author.organization?.owner ?? null);
  const source = owner?.businessName ? owner : author;
  return {
    businessName: source.businessName ?? null,
    businessAddress: source.businessAddress ?? null,
    businessLogo: source.businessLogo ?? null,
    businessABN: source.businessABN ?? null,
    businessPhone: source.businessPhone ?? null,
    businessEmail: source.businessEmail ?? null,
  };
}
