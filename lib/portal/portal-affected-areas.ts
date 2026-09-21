/**
 * Client-portal affected-area projection (RA-7573).
 *
 * The public JSON route already loads AffectedArea rows. The token page must
 * render one item per row — empty only when the job has none. Blank
 * `roomZoneId` is not a licence to drop the row (Critic/Scout bar: no silent
 * omit) and is not a licence to invent a room name.
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
  return areas.map((area) => ({
    id: area.id,
    label: area.roomZoneId?.trim() ?? "",
  }));
}
