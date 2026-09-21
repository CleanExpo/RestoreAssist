/**
 * Client-portal affected-area projection (RA-7573).
 *
 * The public JSON route already loads AffectedArea rows. The token page must
 * use the same bounded query and render those rows — hide the section when
 * none exist, and never invent a room name when roomZoneId is blank.
 */

export const MAX_PORTAL_AFFECTED_AREAS = 100;

export const PORTAL_AFFECTED_AREAS_INCLUDE = {
  select: {
    id: true,
    roomZoneId: true,
  },
  orderBy: { createdAt: "asc" as const },
  take: MAX_PORTAL_AFFECTED_AREAS,
};

export type PortalAffectedAreaRow = {
  id: string;
  roomZoneId: string | null | undefined;
};

export type PortalAffectedAreaItem = {
  id: string;
  label: string;
};

export function toPortalAffectedAreaItems(
  areas: readonly PortalAffectedAreaRow[],
): PortalAffectedAreaItem[] {
  const items: PortalAffectedAreaItem[] = [];
  for (const area of areas) {
    const label = area.roomZoneId?.trim() ?? "";
    if (!label) continue;
    items.push({ id: area.id, label });
  }
  return items;
}
