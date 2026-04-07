/**
 * lib/workspace/index.ts
 * Barrel export for workspace RBAC utilities.
 */

export {
  PERMISSION_KEYS,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
  hasPermission,
  listUserPermissions,
  getUserSystemRole,
  requirePermission,
} from "./permissions";

export type { PermissionKey, PermissionCategory, SystemRoleName } from "./permissions";

export { provisionWorkspace } from "./provision";
export type { ProvisionWorkspaceInput, ProvisionResult } from "./provision";
