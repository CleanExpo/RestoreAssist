/** Persisted ownership is a restriction, never a grant of server authority. */
export interface OfflineOwner {
  userId: string;
  organizationId: string | null;
  workspaceId: string | null;
  workspaceOwnerId: string | null;
}

export const OFFLINE_OWNER_HEADER = "x-restoreassist-offline-owner";

export function parseOfflineOwner(value: unknown): OfflineOwner | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.userId !== "string" || !row.userId || row.userId.length > 200) return null;
  for (const key of ["organizationId", "workspaceId", "workspaceOwnerId"]) {
    if (row[key] !== null && (typeof row[key] !== "string" || !row[key] || (row[key] as string).length > 200)) return null;
  }
  if ((row.workspaceId === null) !== (row.workspaceOwnerId === null)) return null;
  return { userId: row.userId, organizationId: row.organizationId as string | null,
    workspaceId: row.workspaceId as string | null, workspaceOwnerId: row.workspaceOwnerId as string | null };
}

export function sameOfflineOwner(a: OfflineOwner | null | undefined, b: OfflineOwner | null | undefined): boolean {
  return !!a && !!b && a.userId === b.userId && a.organizationId === b.organizationId &&
    a.workspaceId === b.workspaceId && a.workspaceOwnerId === b.workspaceOwnerId;
}
