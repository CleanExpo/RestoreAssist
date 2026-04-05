/**
 * lib/workspace/permissions.ts
 * [RA-412] Multi-tenant RBAC — permission definitions and utility functions.
 *
 * Usage:
 *   import { hasPermission, listUserPermissions, PERMISSION_KEYS } from "@/lib/workspace/permissions";
 *
 *   const canInvite = await hasPermission(userId, workspaceId, "membership.invite");
 */

import { prisma } from "@/lib/prisma";

// ── Permission key union type ──────────────────────────────────────────────

export const PERMISSION_KEYS = [
  // membership family
  "membership.invite",
  "membership.remove",
  "membership.view",
  "membership.role.assign",
  // workspace family
  "workspace.view",
  "workspace.settings",
  "workspace.billing",
  "workspace.delete",
  // reporting family
  "reporting.create",
  "reporting.view",
  "reporting.export",
  "reporting.approve",
  "reporting.delete",
  // ai family
  "ai.use_basic",
  "ai.use_premium",
  "ai.configure_byok",
  "ai.view_usage",
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

export type PermissionCategory = "membership" | "workspace" | "reporting" | "ai";

// ── System role names ──────────────────────────────────────────────────────

export const SYSTEM_ROLE_NAMES = ["Owner", "Manager", "Technician"] as const;
export type SystemRoleName = typeof SYSTEM_ROLE_NAMES[number];

/**
 * Default permissions granted to each system role.
 * Source of truth is the DB (seeded by prisma/seed-workspace.ts).
 * This constant is useful for UI display and static checks without DB hits.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, PermissionKey[]> = {
  Owner: [
    "membership.invite", "membership.remove", "membership.view", "membership.role.assign",
    "workspace.view", "workspace.settings", "workspace.billing", "workspace.delete",
    "reporting.create", "reporting.view", "reporting.export", "reporting.approve", "reporting.delete",
    "ai.use_basic", "ai.use_premium", "ai.configure_byok", "ai.view_usage",
  ],
  Manager: [
    "membership.invite", "membership.remove", "membership.view", "membership.role.assign",
    "workspace.view",
    "reporting.create", "reporting.view", "reporting.export", "reporting.approve", "reporting.delete",
    "ai.use_basic", "ai.use_premium", "ai.view_usage",
  ],
  Technician: [
    "membership.view",
    "workspace.view",
    "reporting.create", "reporting.view", "reporting.export",
    "ai.use_basic",
  ],
};

// ── DB-backed permission check ─────────────────────────────────────────────

/**
 * Check if a user has a specific permission within a workspace.
 * Resolves via: User → WorkspaceMember → MemberRoleBinding → WorkspaceRole → RolePermission → Permission.
 *
 * @param userId       - The authenticated user's ID
 * @param workspaceId  - The workspace to check against
 * @param permissionKey - e.g. "reporting.create"
 * @returns true if the user holds at least one role that grants the permission
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  const result = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "ACTIVE",
      roleBindings: {
        some: {
          role: {
            permissions: {
              some: {
                permission: { key: permissionKey },
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return result !== null;
}

/**
 * Fetch all permission keys a user holds within a workspace.
 * Returns a Set for O(1) membership checks in components/middleware.
 *
 * @example
 *   const perms = await listUserPermissions(userId, workspaceId);
 *   if (perms.has("reporting.approve")) { ... }
 */
export async function listUserPermissions(
  userId: string,
  workspaceId: string
): Promise<Set<PermissionKey>> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    select: {
      status: true,
      roleBindings: {
        select: {
          role: {
            select: {
              permissions: {
                select: {
                  permission: { select: { key: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!member || member.status !== "ACTIVE") return new Set();

  const keys = new Set<PermissionKey>();
  for (const binding of member.roleBindings) {
    for (const rp of binding.role.permissions) {
      keys.add(rp.permission.key as PermissionKey);
    }
  }
  return keys;
}

/**
 * Resolve a user's system role name within a workspace.
 * Returns the name of the first system role found (Owner > Manager > Technician priority).
 * Returns null if the user is not an ACTIVE member or has no system role.
 */
export async function getUserSystemRole(
  userId: string,
  workspaceId: string
): Promise<SystemRoleName | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      status: true,
      roleBindings: {
        select: {
          role: { select: { name: true, isSystem: true } },
        },
      },
    },
  });

  if (!member || member.status !== "ACTIVE") return null;

  const priority: SystemRoleName[] = ["Owner", "Manager", "Technician"];
  const roleNames = member.roleBindings
    .filter((b) => b.role.isSystem)
    .map((b) => b.role.name as SystemRoleName);

  return priority.find((r) => roleNames.includes(r)) ?? null;
}

/**
 * Assert a permission and throw a 403-style error if not granted.
 * Use in API route handlers for concise guard clauses.
 *
 * @throws Error with status 403 if permission is denied
 */
export async function requirePermission(
  userId: string,
  workspaceId: string,
  permissionKey: PermissionKey
): Promise<void> {
  const granted = await hasPermission(userId, workspaceId, permissionKey);
  if (!granted) {
    const err = new Error(
      `Permission denied: '${permissionKey}' required in workspace ${workspaceId}`
    );
    (err as NodeJS.ErrnoException).code = "PERMISSION_DENIED";
    throw err;
  }
}
